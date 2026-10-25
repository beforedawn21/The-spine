// The Spine - transcription leg (audio -> text).
// OCTOPUS DOCTRINE: OpenAI Whisper is the primary brain; if it fails, this leg routes to
// ElevenLabs speech-to-text. If both fail, it fails open with a calm message - the creature is fine.
//
// POST { audio: "data:audio/...;base64,....", mime? } -> { text } | { notConnected } | { error }

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
    const rl = __rateLimit(req, "transcribe", 40, 3600000);
    if (!rl.ok) return res.status(429).json({ error: "Too many requests - try again shortly.", retryAfter: rl.retryAfter });
  }
  {
    const __sg = await __spendGuard(req, "transcribe");
    req.__spineTier = __sg.tier;
    if (!__sg.ok) return res.status(429).json({ error: "You've reached today's limit for this. It refills within 24 hours.", limitReached: true, resetAt: __sg.resetAt || null });
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  const elevenKey = process.env.ELEVENLABS_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  const cfAcct = process.env.CLOUDFLARE_ACCOUNT_ID, cfTok = process.env.CLOUDFLARE_API_TOKEN;
  if (!openaiKey && !elevenKey && !groqKey && !(cfAcct && cfTok)) return res.status(200).json({ notConnected: true });

  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {}; }
  catch (e) { return res.status(200).json({ error: "Bad request body." }); }

  const audio = (body.audio || "").toString();
  if (!audio || audio.indexOf(",") === -1) return res.status(400).json({ error: "Audio data is required." });
  const mime = (body.mime || (audio.match(/^data:([^;]+);/) || [])[1] || "audio/webm").toString();
  const b64 = audio.slice(audio.indexOf(",") + 1);
  const bytes = Buffer.from(b64, "base64");
  const ext = mime.indexOf("mp3") !== -1 ? "mp3" : mime.indexOf("wav") !== -1 ? "wav" : mime.indexOf("m4a") !== -1 ? "m4a" : "webm";

  // PRIMARY: OpenAI Whisper
  if (openaiKey) {
    try {
      const form = new FormData();
      form.append("file", new Blob([bytes], { type: mime }), "audio." + ext);
      form.append("model", "whisper-1");
      const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST", signal: AbortSignal.timeout(40000),
        headers: { "Authorization": "Bearer " + openaiKey },
        body: form,
      });
      const data = await r.json();
      if (r.ok && data && typeof data.text === "string") return res.status(200).json({ text: data.text });
    } catch (e) { /* route to fallback */ }
  }

  // FALLBACK: ElevenLabs speech-to-text. Scribe v2 first; v1 is kept only for older accounts.
  if (elevenKey) {
    for (const model of ["scribe_v2", "scribe_v1"]) {
      try {
        const form = new FormData();
        form.append("file", new Blob([bytes], { type: mime }), "audio." + ext);
        form.append("model_id", model);
        const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
          method: "POST", signal: AbortSignal.timeout(40000),
          headers: { "xi-api-key": elevenKey },
          body: form,
        });
        const data = await r.json().catch(() => null);
        if (r.ok && data && typeof data.text === "string") return res.status(200).json({ text: data.text });
        if (!/model/i.test(JSON.stringify(data || ""))) break;
      } catch (e) { break; }
    }
  }

  // THIRD: Groq runs Whisper Large v3 Turbo on the key the fast answers already use.
  if (groqKey) {
    try {
      const form = new FormData();
      form.append("file", new Blob([bytes], { type: mime }), "audio." + ext);
      form.append("model", "whisper-large-v3-turbo");
      const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST", signal: AbortSignal.timeout(30000),
        headers: { "Authorization": "Bearer " + groqKey },
        body: form,
      });
      const data = await r.json().catch(() => null);
      if (r.ok && data && typeof data.text === "string") return res.status(200).json({ text: data.text });
    } catch (e) { /* next */ }
  }

  // FOURTH: Cloudflare Workers AI, the same Whisper model, free within the daily allowance.
  if (cfAcct && cfTok) {
    try {
      const r = await fetch("https://api.cloudflare.com/client/v4/accounts/" + cfAcct + "/ai/run/@cf/openai/whisper-large-v3-turbo", {
        method: "POST", signal: AbortSignal.timeout(30000),
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + cfTok },
        body: JSON.stringify({ audio: b64 }),
      });
      const j = await r.json().catch(() => null);
      const text = j && ((j.result && j.result.text) || j.text);
      if (r.ok && typeof text === "string") return res.status(200).json({ text: text.trim() });
    } catch (e) { /* fall through to fail-open */ }
  }

  return res.status(200).json({ error: "Couldn't transcribe the audio just now. Please try again." });
}
