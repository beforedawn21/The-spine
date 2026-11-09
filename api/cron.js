// ============================================================================
//  CRON  —  the jobs that run without anybody opening the app
//
//  Vercel calls this on the schedule in vercel.json. It is not a public route:
//  Vercel signs its own calls, and anything else must carry the admin password.
//
//  Today it does the housekeeping that was never being done: trimming the usage
//  counters that grow forever, and expiring subscriptions that have lapsed.
// ============================================================================

export default async function handler(req, res) {
  // WHO IS CALLING. With CRON_SECRET set in Vercel, Vercel's scheduler signs every call with
  // "Authorization: Bearer <CRON_SECRET>" - that is the proof. Without it, the old check (the
  // scheduler's user-agent) still works, but anyone can type a user-agent, so set CRON_SECRET.
  // A person can always run it by hand with the admin password.
  const secret = process.env.CRON_SECRET;
  const auth = String(req.headers["authorization"] || "");
  const fromVercel = secret ? auth === "Bearer " + secret : String(req.headers["user-agent"] || "").includes("vercel-cron");
  const pass = req.headers["x-spine-admin"];
  const real = process.env.ADMIN_PASSWORD;
  if (!fromVercel) {
    if (!real || !pass || String(pass) !== real) {
      return res.status(401).json({ error: "Not authorised." });
    }
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return res.status(200).json({ skipped: "no database configured" });

  // New sb_secret_ keys must travel in apikey alone (Supabase rejects them as a Bearer token);
  // legacy JWT keys keep both headers. Correct under either key type.
  const base = /^eyJ/.test(key) ? { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" }
                                : { apikey: key, "Content-Type": "application/json" };
  const done = {};

  // 1. The counters table grows on every single run and nothing ever deleted from it.
  try {
    const cutoff = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString();
    const r = await fetch(url + "/rest/v1/usage_counters?window_start=lt." + encodeURIComponent(cutoff), {
      method: "DELETE", headers: { ...base, Prefer: "return=minimal" },
    });
    done.usageTrimmed = r.ok;
  } catch (e) { done.usageTrimmed = false; }

  // 2. A lapsed subscription expires by itself because pro_until is a date - but clearing
  //    it keeps the table honest and makes "who is paying" a simple query.
  try {
    const now = new Date().toISOString();
    const r = await fetch(url + "/rest/v1/accounts?pro_until=lt." + encodeURIComponent(now), {
      method: "PATCH", headers: { ...base, Prefer: "return=minimal" },
      body: JSON.stringify({ pro_until: null }),
    });
    done.lapsedCleared = r.ok;
  } catch (e) { done.lapsedCleared = false; }

  // 3. Sign-ins that have run out are only clutter, and the table grows with every sign-in.
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const r = await fetch(url + "/rest/v1/sessions?expires_at=lt." + encodeURIComponent(cutoff), {
      method: "DELETE", headers: { ...base, Prefer: "return=minimal" },
    });
    done.sessionsCleared = r.ok;
  } catch (e) { done.sessionsCleared = false; }

  // 4. SCHEDULED AGENTS (batch 7). Each person can set up to five jobs - "every Monday, three
  //    things to do this weekend near me" - and this runs the ones that are due, writes the answer
  //    back for them to find in the Core, and (for a job tied to one of their tools) refreshes that
  //    tool's edition. At most eight per night run here, each on a fast model with a time limit,
  //    so the nightly job stays well inside its minute. Anything left waits for tomorrow.
  try {
    const ak = process.env.ANTHROPIC_API_KEY;
    if (ak) {
      const r = await fetch(url + "/rest/v1/rpc/due_schedules", { method: "POST", headers: base, body: JSON.stringify({ p_limit: 8 }) });
      const due = r.ok ? await r.json() : [];
      const today = new Date().toUTCString().slice(0, 16);
      const results = await Promise.all((Array.isArray(due) ? due : []).map(async (job) => {
        try {
          const ar = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST", signal: AbortSignal.timeout(30000),
            headers: { "x-api-key": ak, "anthropic-version": "2023-06-01", "content-type": "application/json" },
            body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 900,
              system: "You are The Spine, running a job a person scheduled for themselves. Today is " + today + ". Do exactly what the job asks, as a finished result they can read in under a minute: clear, warm, concrete. If it needs live facts you cannot check right now, say what to check rather than inventing anything.",
              messages: [{ role: "user", content: String(job.prompt || "").slice(0, 1000) }] }),
          });
          const j = ar.ok ? await ar.json() : null;
          const text = j && Array.isArray(j.content) ? j.content.map((b) => b.text || "").join("").trim() : "";
          const out = text || "This job couldn't run tonight - it will try again on its next turn.";
          const f = await fetch(url + "/rest/v1/rpc/finish_schedule", { method: "POST", headers: base, body: JSON.stringify({ p_id: job.id, p_result: out }) });
          // batch 14: tell the person's phone (lock screen), if they asked for that on a phone
          if (f.ok && text) { try { done.pushesSent = (done.pushesSent || 0) + await pushSchedule(url, base, job, out); } catch (e) {} }
          return f.ok && !!text;
        } catch (e) { return false; }
      }));
      done.schedulesRun = results.filter(Boolean).length;
      done.schedulesDue = results.length;
    } else done.schedulesRun = "no reasoning key";
  } catch (e) { done.schedulesRun = 0; }

  // 5. WHAT PEOPLE USE (batch 10): feature counts older than about 13 months are cleared.
  try {
    const r = await fetch(url + "/rest/v1/rpc/prune_usage_events", { method: "POST", headers: base, body: "{}" });
    done.usageEventsPruned = r.ok ? await r.json().catch(() => 0) : "not set up";
  } catch (e) { done.usageEventsPruned = 0; }

  return res.status(200).json({ ok: true, at: new Date().toISOString(), ...done });
}

// ── LOCK-SCREEN ALERTS (batch 14) ─────────────────────────────────────────────────
// Standard Web Push, signed with the site's own VAPID keys (made once, free - no outside account).
// iPhones get these once The Spine is on the Home Screen and the person tapped "Tell me on this
// phone". Addresses that have gone away (404/410) are forgotten. Without the keys it does nothing.
export async function pushSchedule(url, base, job, result) {
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv || !job || !job.id) return 0;
  let wp; try { const m = await import("web-push"); wp = m.default && m.default.sendNotification ? m.default : m; } catch (e) { return 0; } // web-push 4 has no default export
  if (!wp || typeof wp.sendNotification !== "function") return 0;
  try { wp.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:hello@thespine.cloud", pub, priv); } catch (e) { return 0; }
  let subs = [];
  try { const r = await fetch(url + "/rest/v1/rpc/schedule_pushes", { method: "POST", headers: base, body: JSON.stringify({ p_schedule: job.id }) }); subs = r.ok ? await r.json() : []; } catch (e) { return 0; }
  const site = (process.env.PUBLIC_SITE_URL || "https://thespine.cloud").replace(/\/$/, "");
  const first = String(result || "").replace(/[#*_`>]/g, "").replace(/\s+/g, " ").trim();
  const payload = JSON.stringify({ title: "Your scheduled job is ready", body: (String(job.prompt || "").slice(0, 60) + " - " + first).slice(0, 180), url: site + "/?open=schedules", tag: "sched-" + job.id });
  let sent = 0;
  for (const s of (Array.isArray(subs) ? subs : []).slice(0, 6)) {
    try { await wp.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: "normal" }); sent++; }
    catch (e) { if (e && (e.statusCode === 404 || e.statusCode === 410)) { try { await fetch(url + "/rest/v1/rpc/drop_push", { method: "POST", headers: base, body: JSON.stringify({ p_endpoint: s.endpoint }) }); } catch (_) {} } }
  }
  return sent;
}
