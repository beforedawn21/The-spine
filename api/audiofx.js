// The Spine - audio FX leg (ElevenLabs byproducts on the same key you already pay for).
//   { action:"sfx", prompt, seconds? }  -> { audioUrl }   text -> sound effect
//   { action:"isolate", audio }         -> { audioUrl }   strip background noise from a voice clip
// OCTOPUS DOCTRINE: own leg, own logic, fails open. If the key is missing or the call fails,
// returns a calm status and never affects any other pipe.

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
    const rl = __rateLimit(req, "audiofx", 40, 3600000);
    if (!rl.ok) return res.status(429).json({ error: "Too many requests - try again shortly.", retryAfter: rl.retryAfter });
  }
  {
    const __sg = await __spendGuard(req, "audiofx");
    req.__spineTier = __sg.tier;
    if (!__sg.ok) return res.status(429).json({ error: "You've reached today's limit for this. It refills within 24 hours.", limitReached: true, resetAt: __sg.resetAt || null });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;

  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {}; }
  catch (e) { return res.status(200).json({ error: "Bad request body." }); }

  const action = (body.action || "").toString();

  // A RECORDED SOUND WHEN NOTHING CAN MAKE ONE. Openverse indexes Freesound and other open
  // libraries; only sounds licensed for commercial use are taken, and the credit travels with
  // them. Keyless. Used when ElevenLabs is absent, refuses, or does not answer in time.
  // Sounds land inside worlds and games where no credit line can be shown, so by default only
  // public-domain (CC0) sounds are taken; a caller that displays credits can ask for more.
  async function foundSound(prompt) {
    try {
      const STOP = new Set("a an the of and or with in on at to for from sound effect sfx noise of some".split(" "));
      const q = prompt.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).slice(0, 4).join(" ");
      if (!q) return null;
      const r = await fetch("https://api.openverse.org/v1/audio/?q=" + encodeURIComponent(q) + (body.credited === true ? "&license_type=commercial" : "&license=cc0,pdm") + "&mature=false&page_size=8", {
        headers: { "User-Agent": "TheSpine/1.0 (hello@thespine.cloud)" }, signal: AbortSignal.timeout(9000),
      });
      const j = r.ok ? await r.json().catch(() => null) : null;
      const max = (Number(body.seconds) > 0 ? Number(body.seconds) : 22) * 1000 + 8000;
      const pick = j && (j.results || []).find((x) => x && x.url && /^https:\/\//.test(x.url) && (!x.duration || x.duration <= max));
      if (!pick) return null;
      const lic = String(pick.license || "").toLowerCase() === "cc0" ? "public domain" : "CC " + String(pick.license || "").toUpperCase() + (pick.license_version ? " " + pick.license_version : "");
      return { audioUrl: pick.url, found: true, engine: "openverse",
        credit: { text: (pick.title ? "\u201C" + String(pick.title).slice(0, 60) + "\u201D " : "") + (pick.creator ? "by " + String(pick.creator).slice(0, 50) + " " : "") + "(" + lic + ")", url: pick.foreign_landing_url || pick.url } };
    } catch (e) { return null; }
  }

  if (!apiKey) {
    if (action === "sfx" && String(body.prompt || "").trim()) {
      const f = await foundSound(String(body.prompt).slice(0, 450));
      if (f) return res.status(200).json(f);
    }
    return res.status(200).json({ notConnected: true });
  }

  // ============================ SOUND EFFECTS ============================
  if (action === "sfx") {
    const prompt = (body.prompt || "").toString().slice(0, 450);
    if (!prompt.trim()) return res.status(400).json({ error: "Describe the sound you want." });
    try {
      const payload = { text: prompt };
      const secs = Number(body.seconds);
      if (secs && secs > 0 && secs <= 22) payload.duration_seconds = secs;
      const r = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
        method: "POST", signal: AbortSignal.timeout(45000),
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const buf = r.ok ? Buffer.from(await r.arrayBuffer()) : null;
      if (buf && buf.length) return res.status(200).json({ audioUrl: "data:audio/mpeg;base64," + buf.toString("base64") });
      const f = await foundSound(prompt);
      if (f) return res.status(200).json(f);
      return res.status(200).json({ error: "Couldn't generate that sound just now. Please try again." });
    } catch (e) {
      const f = await foundSound(prompt);
      if (f) return res.status(200).json(f);
      return res.status(200).json({ error: "Couldn't generate that sound just now. Please try again." });
    }
  }

  // ============================ VOICE ISOLATION ============================
  if (action === "isolate") {
    const audio = (body.audio || "").toString();
    if (!audio || audio.indexOf(",") === -1) return res.status(400).json({ error: "Audio data is required." });
    const mime = (audio.match(/^data:([^;]+);/) || [])[1] || "audio/webm";
    const bytes = Buffer.from(audio.slice(audio.indexOf(",") + 1), "base64");
    const ext = mime.indexOf("mp3") !== -1 ? "mp3" : mime.indexOf("wav") !== -1 ? "wav" : mime.indexOf("m4a") !== -1 ? "m4a" : "webm";
    try {
      const form = new FormData();
      form.append("audio", new Blob([bytes], { type: mime }), "audio." + ext);
      const r = await fetch("https://api.elevenlabs.io/v1/audio-isolation", {
        method: "POST", headers: { "xi-api-key": apiKey }, body: form,
      });
      if (!r.ok) { return res.status(200).json({ error: "Couldn't clean that audio just now. Please try again." }); }
      const buf = Buffer.from(await r.arrayBuffer());
      if (!buf.length) return res.status(200).json({ error: "Empty audio returned. Please try again." });
      return res.status(200).json({ audioUrl: "data:audio/mpeg;base64," + buf.toString("base64") });
    } catch (e) { return res.status(200).json({ error: "Couldn't clean that audio just now. Please try again." }); }
  }

  return res.status(400).json({ error: "Unknown action." });
}
