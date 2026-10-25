// The Spine - music generation proxy (Suno via sunor.cc).
// Dormant until SUNO_API_KEY is set in Vercel. Fully fail-open: if the key is missing or the
// reseller is down/erroring, this returns a calm status and NEVER affects any other pipe.
//
// Suno generation is async and takes ~30-60s, which nears Vercel's 60s function cap, so this
// endpoint is TWO-STEP so no single request is held open that long:
//   POST { action:"start", prompt }        -> { taskId }        (kicks off the job)
//   POST { action:"poll",  taskId }        -> { status, audioUrl, title } | { status:"pending" }
//
// Auth: sunor.cc uses the  x-api-key: <KEY>  header (NOT Bearer).

const SUNO_BASE = "https://sunor.cc/api/v1";

// ── Budget guard (self-contained, no import - an endpoint must never fail to load because a
//    helper file is missing). Ceilings sit far above human pace and it fails open, so a real
//    person is never blocked by it.
const __rlBuckets = globalThis.__spineRlBuckets || (globalThis.__spineRlBuckets = new Map());
function __rateLimit(req, name, limit, windowMs) {
  try {
    const now = Date.now();
    if (__rlBuckets.size > 5000) { for (const [k, v] of __rlBuckets) { if (v.resetAt <= now) __rlBuckets.delete(k); } }
    let ip = "";
    try { const xff = String(req.headers["x-forwarded-for"] || ""); ip = xff ? xff.split(",")[0].trim() : String(req.headers["x-real-ip"] || (req.socket && req.socket.remoteAddress) || ""); } catch (e) {}
    // If we cannot tell requests apart, DO NOT put everyone in one bucket - that turns a
    // safety measure into a site-wide outage. No identifiable caller means no limit.
    if (!ip || ip === "unknown") return { ok: true };
    const key = name + ":" + ip;
    const b = __rlBuckets.get(key);
    if (!b || b.resetAt <= now) { __rlBuckets.set(key, { count: 1, resetAt: now + windowMs }); return { ok: true }; }
    if (b.count < limit) { b.count++; return { ok: true }; }
    return { ok: false, retryAfter: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  } catch (e) { return { ok: true }; }
}

// ── SPEND GUARD (self-contained, like the rate limiter above) ───────────────────────────────
// The daily allowances lived only in /api/usage, which the APP chose to call first - so anyone
// calling this endpoint directly skipped them and spent on your account without limit. This
// endpoint now counts for itself, in the same race-proof database counter. The person is known
// only from their session token (never from an id they claim); without one, by their address.
// Ceilings are about twice each in-app allowance, so a real person always meets the friendly
// in-app limit first. Checking progress never counts. If the database cannot be reached it
// lets the request through, exactly as the rest of the system does.
const __SG_CAPS = {
  chat:       { anon: 30, acct: 600, pro: 1800 },
  image:      { anon: 6,  acct: 50,  pro: 150 },
  video:      { anon: 2,  acct: 12,  pro: 36 },
  music:      { anon: 2,  acct: 16,  pro: 48 },
  dub:        { anon: 4,  acct: 40,  pro: 120 },
  audiofx:    { anon: 4,  acct: 40,  pro: 120 },
  transcribe: { anon: 10, acct: 100, pro: 300 },
  search:     { anon: 20, acct: 200, pro: 600 },
  readurl:    { anon: 20, acct: 200, pro: 600 },
  assist:     { anon: 30, acct: 300, pro: 900 },
};
// New sb_secret_ keys go in apikey alone; legacy JWT keys in both headers. Right under either rule.
function __sgHeaders(k) { return /^eyJ/.test(k) ? { apikey: k, Authorization: "Bearer " + k } : { apikey: k }; }
async function __spendGuard(req, kind) {
  try {
    const url = String(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return { ok: true, tier: "anon" };
    let b = req.body; if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } } b = b || {};
    const act = String(b.action || b.op || "").toLowerCase();
    if (act === "poll" || act === "status" || act === "check") return { ok: true, tier: "anon" };
    const H = { ...__sgHeaders(key), "Content-Type": "application/json" };
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 4000);
    const rpc = async (fn, args) => {
      const r = await fetch(url + "/rest/v1/rpc/" + fn, { method: "POST", headers: H, body: JSON.stringify(args), signal: ctl.signal });
      if (!r.ok) throw new Error(fn + " " + r.status); return r.json();
    };
    const tok = String(req.headers["x-spine-session"] || "");
    let who = null, tier = "anon";
    if (/^[0-9a-f]{64}$/.test(tok)) {
      who = await rpc("spine_whoami", { p_token: tok });
      if (who) {
        tier = "acct";
        const r = await fetch(url + "/rest/v1/accounts?select=pro_until&id=eq." + encodeURIComponent(who), { headers: H, signal: ctl.signal });
        const a = r.ok ? (await r.json())[0] : null;
        if (a && a.pro_until && new Date(a.pro_until) > new Date()) tier = "pro";
      }
    }
    let ip = "";
    try { ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || String(req.headers["x-real-ip"] || ""); } catch (e) {}
    if (!who && !ip) { clearTimeout(timer); return { ok: true, tier }; }
    const cap = (__SG_CAPS[kind] || __SG_CAPS.chat)[tier];
    const rows = await rpc("usage_bump", { p_subject: who ? "acct:" + who : "ip:" + ip, p_kind: "srv:" + kind, p_lim: cap, p_win_hours: 24 });
    clearTimeout(timer);
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (row && row.allowed === false) return { ok: false, tier, resetAt: row.reset_at };
    return { ok: true, tier };
  } catch (e) { return { ok: true, tier: "anon" }; }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  {
    const rl = __rateLimit(req, "music", 10, 3600000);
    if (!rl.ok) return res.status(429).json({ error: "Too many requests - try again shortly.", retryAfter: rl.retryAfter });
  }
  {
    const __sg = await __spendGuard(req, "music");
    req.__spineTier = __sg.tier;
    if (!__sg.ok) return res.status(429).json({ error: "You've reached today's limit for this. It refills within 24 hours.", limitReached: true, resetAt: __sg.resetAt || null });
  }

  const apiKey = process.env.SUNO_API_KEY;
  const elevenKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey && !elevenKey) return res.status(200).json({ notConnected: true });

  // SECOND COMPOSER. Suno reaches us through a reseller, and a reseller can vanish overnight.
  // ElevenLabs composes music on the key the voice already uses, licensed for commercial use
  // on paid plans, and answers in one call - so when Suno cannot start a track, the song is
  // composed here and handed straight back, finished, with no polling.
  async function elevenMusic(prompt) {
    if (!elevenKey) return null;
    const secs = Math.min(180, Math.max(15, parseInt(body.seconds || 90, 10) || 90));
    for (const model of ["music_v2_5", "music_v2"]) {
      try {
        const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 160000);
        const r = await fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", {
          method: "POST", signal: ctl.signal,
          headers: { "xi-api-key": elevenKey, "Content-Type": "application/json", "Accept": "audio/mpeg" },
          body: JSON.stringify({ prompt: prompt.slice(0, 4000), music_length_ms: secs * 1000, model_id: model, force_instrumental: body.instrumental === true }),
        });
        clearTimeout(t);
        if (!r.ok) {
          let said = ""; try { said = JSON.stringify(await r.json()).toLowerCase(); } catch (e) {}
          if (/model/.test(said)) continue;
          return null;
        }
        const buf = Buffer.from(await r.arrayBuffer());
        if (!buf.length) return null;
        return { status: "success", audioUrl: "data:audio/mpeg;base64," + buf.toString("base64"), title: "", engine: "elevenlabs" };
      } catch (e) { return null; }
    }
    return null;
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch (e) {
    return res.status(200).json({ error: "Bad request body." });
  }

  const headers = { "Content-Type": "application/json", "x-api-key": apiKey };
  const action = (body.action || "start").toString();

  try {
    // ---- STEP 1: start a generation task ----
    if (action === "start") {
      const prompt = (body.prompt || "").toString().slice(0, 2000);
      if (!prompt.trim()) return res.status(400).json({ error: "A music prompt is required." });

      if (!apiKey) {
        const el = await elevenMusic(prompt);
        return res.status(200).json(el || { error: "The music engine couldn't compose this one just now." });
      }
      const r = await fetch(SUNO_BASE + "/task", {
        method: "POST",
        headers, signal: AbortSignal.timeout(20000),
        body: JSON.stringify({
          model: "suno",
          task_type: "music",
          input: { gpt_description_prompt: prompt },
        }),
      });

      let data = null;
      try { data = await r.json(); } catch (pe) { data = null; }
      const taskId = r.ok && data && data.data && (data.data.task_id || data.data.taskId || data.data.id);
      if (taskId) return res.status(200).json({ taskId: taskId });
      // Suno did not start - compose it on the second engine instead of giving up.
      const el = await elevenMusic(prompt);
      if (el) return res.status(200).json(el);
      if (!data) return res.status(200).json({ error: "Music engine returned a non-JSON response (status " + r.status + ")." });
      const msg = (data && (data.error || data.detail || data.message)) || ("HTTP " + r.status);
      return res.status(200).json({ error: r.ok ? "Music engine did not return a task id." : "Music engine: " + msg });
    }

    // ---- STEP 2: poll a task for its result ----
    if (action === "poll") {
      const taskId = (body.taskId || "").toString();
      if (!taskId) return res.status(400).json({ error: "A taskId is required to poll." });

      const r = await fetch(SUNO_BASE + "/task/" + encodeURIComponent(taskId), { method: "GET", headers });
      let data;
      try { data = await r.json(); } catch (pe) {
        return res.status(200).json({ error: "Music engine returned a non-JSON response (status " + r.status + ")." });
      }
      if (!r.ok) {
        const msg = (data && (data.error || data.detail || data.message)) || ("HTTP " + r.status);
        return res.status(200).json({ error: "Music engine: " + msg });
      }

      const d = (data && data.data) || {};
      const status = (d.status || "pending").toString();

      if (status === "success") {
        // Suno succeeded - find the audio URL wherever sunor.cc nested it. Deep-search the whole
        // response so we're robust to their exact shape (field names/nesting vary).
        function findAudio(obj, depth) {
          if (!obj || depth > 6) return "";
          if (typeof obj === "string") {
            if (/^https?:\/\/.+\.(mp3|wav|m4a|ogg|flac)(\?|$)/i.test(obj)) return obj;
            return "";
          }
          if (Array.isArray(obj)) {
            for (const it of obj) { const f = findAudio(it, depth + 1); if (f) return f; }
            return "";
          }
          if (typeof obj === "object") {
            // Prefer explicit audio fields first.
            for (const k of ["audio_url", "audioUrl", "audio", "stream_audio_url", "source_audio_url"]) {
              if (typeof obj[k] === "string" && /^https?:\/\//i.test(obj[k])) return obj[k];
            }
            for (const k in obj) { const f = findAudio(obj[k], depth + 1); if (f) return f; }
          }
          return "";
        }
        let title = "";
        const out = d.output || d.result || d.clips || d.songs || d.data || d;
        if (Array.isArray(out) && out.length && out[0]) title = out[0].title || "";
        else if (out && typeof out === "object") title = out.title || "";
        const audioUrl = findAudio(data, 0);
        if (!audioUrl) return res.status(200).json({ status: "success", error: "Track finished but no audio URL was returned." });
        return res.status(200).json({ status: "success", audioUrl: audioUrl, title: title });
      }
      if (status === "failure" || status === "failed") {
        return res.status(200).json({ status: "failure", error: (d.error || "The music engine could not generate this track. (Credits for failed generations are refunded.)") });
      }
      // still working
      return res.status(200).json({ status: "pending" });
    }

    return res.status(400).json({ error: "Unknown action." });
  } catch (e) {
    // Suno unreachable or timed out while starting - the second composer still gets its turn.
    if (action === "start" && elevenKey && String(body.prompt || "").trim()) {
      const el = await elevenMusic(String(body.prompt).slice(0, 2000));
      if (el) return res.status(200).json(el);
    }
    // Fail-open: any error is contained here and reported; nothing else on the Spine is affected.
    return res.status(200).json({ error: "Music service error: " + (e && e.message ? e.message : String(e)) });
  }
}
