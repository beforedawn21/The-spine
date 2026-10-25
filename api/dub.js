// The Spine - voice / dub proxy (ElevenLabs).
// Dormant until ELEVENLABS_API_KEY is set in Vercel. Fully fail-open: if the key is missing or the
// service errors, this returns a calm status and NEVER affects any other pipe.
//
// POST { text, voiceId? }  -> { audioUrl }   (audioUrl is a base64 data URL the browser can play)
//
// Auth: ElevenLabs uses the  xi-api-key: <KEY>  header. TTS returns raw audio bytes.

// Default voice: use the user's own voice via ELEVENLABS_VOICE_ID if set (required on the free tier,
// which blocks stock "library" voices through the API). Falls back to a stock voice for paid plans.
const DEFAULT_VOICE = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
const MODEL = "eleven_multilingual_v2";

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
    const rl = __rateLimit(req, "dub", 40, 3600000);
    if (!rl.ok) return res.status(429).json({ error: "Too many requests - try again shortly.", retryAfter: rl.retryAfter });
  }
  {
    const __sg = await __spendGuard(req, "dub");
    req.__spineTier = __sg.tier;
    if (!__sg.ok) return res.status(429).json({ error: "You've reached today's limit for this. It refills within 24 hours.", limitReached: true, resetAt: __sg.resetAt || null });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch (e) {
    return res.status(200).json({ error: "Bad request body." });
  }

  const text = (body.text || "").toString().slice(0, 5000);
  if (!text.trim()) return res.status(400).json({ error: "Text is required to generate a voice." });
  const voiceId = (body.voiceId || DEFAULT_VOICE).toString();

  // OpenAI TTS fallback - 11 built-in voices, no voice-ID config needed. Used when ElevenLabs
  // has no key, or when it errors. Uses the OPENAI_API_KEY you already have.
  async function openaiTTS() {
    if (!openaiKey) return null;
    try {
      const ovoice = (body.openaiVoice || "alloy").toString();
      const r = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST", signal: AbortSignal.timeout(30000),
        headers: { "Authorization": "Bearer " + openaiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "tts-1", voice: ovoice, input: text }),
      });
      if (!r.ok) return null;
      const buf = Buffer.from(await r.arrayBuffer());
      if (!buf.length) return null;
      return "data:audio/mpeg;base64," + buf.toString("base64");
    } catch (e) { return null; }
  }

  // THIRD VOICE: Cloudflare Workers AI, on the account translation already uses. Deepgram's
  // Aura 2 first (natural, English), then MeloTTS (lighter, more languages). Either answers in
  // audio bytes or in base64 JSON depending on the model, so both are read.
  const cfAcct = process.env.CLOUDFLARE_ACCOUNT_ID, cfTok = process.env.CLOUDFLARE_API_TOKEN;
  async function cloudflareTTS() {
    if (!cfAcct || !cfTok) return null;
    const short = text.slice(0, 2000);
    const tries = [
      ["@cf/deepgram/aura-2-en", { text: short, encoding: "mp3" }],
      ["@cf/myshell/melotts", { prompt: short, lang: String(body.lang || "en").slice(0, 5) }],
    ];
    for (const [model, payload] of tries) {
      try {
        const r = await fetch("https://api.cloudflare.com/client/v4/accounts/" + cfAcct + "/ai/run/" + model, {
          method: "POST", signal: AbortSignal.timeout(30000),
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + cfTok },
          body: JSON.stringify(payload),
        });
        if (!r.ok) continue;
        const type = String(r.headers.get("content-type") || "");
        if (/json/.test(type)) {
          const j = await r.json().catch(() => null);
          const b64 = j && ((j.result && (j.result.audio || j.result.data)) || j.audio);
          if (typeof b64 === "string" && b64.length > 100) return "data:audio/" + (/wav/i.test(type) ? "wav" : "mpeg") + ";base64," + b64;
          continue;
        }
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > 100) return "data:" + (/audio\//.test(type) ? type.split(";")[0] : "audio/mpeg") + ";base64," + buf.toString("base64");
      } catch (e) { /* next */ }
    }
    return null;
  }
  async function backupVoice() {
    const a = await openaiTTS(); if (a) return { audioUrl: a, engine: "openai" };
    const c = await cloudflareTTS(); if (c) return { audioUrl: c, engine: "cloudflare" };
    return null;
  }

  // If ElevenLabs isn't connected, go straight to the backups.
  if (!apiKey) {
    const fb = await backupVoice();
    if (fb) return res.status(200).json(fb);
    return res.status(200).json({ notConnected: true });
  }

  try {
    const r = await fetch("https://api.elevenlabs.io/v1/text-to-speech/" + encodeURIComponent(voiceId), {
      method: "POST", signal: AbortSignal.timeout(45000),
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify({
        text: text,
        model_id: MODEL,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!r.ok) {
      // ElevenLabs returns JSON on error - surface the real reason (bad key, credits, model access).
      let msg = "HTTP " + r.status;
      try {
        const err = await r.json();
        msg = (err && err.detail && (err.detail.message || err.detail)) || (err && err.message) || msg;
        if (typeof msg === "object") msg = JSON.stringify(msg);
      } catch (pe) { /* keep HTTP status */ }
      // Friendlier guidance for the common free-tier library-voice block.
      if (/library voices|upgrade your subscription/i.test(String(msg))) {
        msg = "Your ElevenLabs plan can't use stock voices via API. Create or clone a voice in your ElevenLabs dashboard, then set its ID as ELEVENLABS_VOICE_ID in Vercel - or upgrade your ElevenLabs plan.";
      }
      // Fall back so the person still gets a voice.
      const fb = await backupVoice();
      if (fb) return res.status(200).json(fb);
      return res.status(200).json({ error: "Voice engine: " + msg });
    }

    // Success: raw MP3 bytes. Convert to a base64 data URL the browser can play directly.
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length) return res.status(200).json({ error: "Voice engine returned empty audio." });
    const audioUrl = "data:audio/mpeg;base64," + buf.toString("base64");
    return res.status(200).json({ audioUrl: audioUrl });
  } catch (e) {
    // ElevenLabs unreachable - the backups still get their turn.
    try { const fb = await backupVoice(); if (fb) return res.status(200).json(fb); } catch (_) {}
    // Fail-open: any error is contained here; nothing else on the Spine is affected.
    return res.status(200).json({ error: "Voice service error: " + (e && e.message ? e.message : String(e)) });
  }
}
