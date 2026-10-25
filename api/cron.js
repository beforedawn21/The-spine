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

  return res.status(200).json({ ok: true, at: new Date().toISOString(), ...done });
}
