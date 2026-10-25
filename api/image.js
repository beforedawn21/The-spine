// The Spine — image generation router. OpenAI, Runway and Cloudflare FLUX paint; Openverse and
// then Pexels supply a licensed photograph only when every painter is down.
// Accepts { prompt, model, size, prefer, stock, seed }. Returns { b64, mime } or { url, credit }.

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
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  {
    const rl = __rateLimit(req, "image", 20, 3600000);
    if (!rl.ok) return res.status(429).json({ error: "Too many requests - try again shortly.", retryAfter: rl.retryAfter });
  }
  {
    const __sg = await __spendGuard(req, "image");
    req.__spineTier = __sg.tier;
    if (!__sg.ok) return res.status(429).json({ error: "You've reached today's limit for this. It refills within 24 hours.", limitReached: true, resetAt: __sg.resetAt || null });
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════
  //  THE IMAGE ROUTER - one request, as many engines as it takes.
  //  Painters, in the order the request prefers:
  //    quality (default)  OpenAI  ->  Runway  ->  Cloudflare FLUX (free)
  //    free               Cloudflare FLUX  ->  OpenAI  ->  Runway
  //  and only when every painter is down, a real photograph that is licensed for commercial
  //  use: Openverse first, Pexels last - never ahead of anything else.
  //  A refusal on safety grounds is final. It is never retried elsewhere.
  //  Accepts { prompt, model, size, prefer, stock, seed }.
  //  Returns { b64, mime, engine } | { url, engine, stock, credit } | { notConnected } | { error }
  // ══════════════════════════════════════════════════════════════════════════════════════════
  const openaiKey = process.env.OPENAI_API_KEY;
  const cfAcct = process.env.CLOUDFLARE_ACCOUNT_ID, cfTok = process.env.CLOUDFLARE_API_TOKEN;
  const runwayKey = process.env.RUNWAY_API_KEY;
  const pexelsKey = process.env.PEXELS_API_KEY;

  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {}; }
  catch (e) { return res.status(200).json({ error: "Bad request body." }); }
  const prompt = (body.prompt || "").toString().slice(0, 1000);
  if (!prompt.trim()) return res.status(400).json({ error: "A prompt is required." });
  const size = ["1024x1024", "1024x1536", "1536x1024", "auto"].includes(body.size) ? body.size : "1024x1024";
  const prefer = body.prefer === "free" ? "free" : "quality";
  const allowStock = body.stock !== false;
  const hi = body.model === "gpt-image-1" || body.model === "gpt-image-2.5-sunburst" || body.hi === true;

  const started = Date.now();
  const BUDGET = 110000;                       // the function has 120s; keep 10 in hand
  const left = (cap) => Math.max(0, Math.min(cap, BUDGET - (Date.now() - started)));
  const tried = [];
  const timed = async (ms, fn) => {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
    try { return await fn(ctl.signal); } finally { clearTimeout(t); }
  };

  // ── OpenAI. Each model name is tried in turn; names OpenAI has shut down are skipped.
  const RETIRED = { "gpt-image-1": "2026-12-01", "gpt-image-1-mini": "2026-12-01", "chatgpt-image-latest": "2026-12-01" };
  const alive = (m) => !RETIRED[m] || Date.now() < Date.parse(RETIRED[m]);
  const OK_MODELS = { "gpt-image-1-mini": 1, "gpt-image-1": 1, "gpt-image-2": 1, "gpt-image-2.5-flare": 1, "gpt-image-2.5-sunburst": 1 };
  async function openai() {
    if (!openaiKey) return null;
    const first = OK_MODELS[body.model] ? body.model : (hi ? "gpt-image-1" : "gpt-image-1-mini");
    const ladder = [first].concat(hi ? ["gpt-image-2.5-sunburst", "gpt-image-2.5-flare"] : ["gpt-image-2.5-flare"])
      .filter((m, k, a) => a.indexOf(m) === k && alive(m));
    for (const model of ladder) {
      const ms = left(80000); if (ms < 5000) return null;
      const payload = { model, prompt, size, n: 1 };
      if (/^gpt-image-2\.5/.test(model)) payload.quality = hi ? "high" : "medium";
      let data = null, status = 0;
      try {
        const r = await timed(ms, (signal) => fetch("https://api.openai.com/v1/images/generations", {
          method: "POST", signal, headers: { "Content-Type": "application/json", "Authorization": "Bearer " + openaiKey }, body: JSON.stringify(payload),
        }));
        status = r.status; data = await r.json().catch(() => null);
      } catch (e) { tried.push({ engine: "openai " + model, ok: false, said: "timed out" }); continue; }
      const first0 = data && data.data && data.data[0];
      if (first0 && first0.b64_json) return { b64: first0.b64_json, mime: "image/png", engine: "openai" };
      if (first0 && first0.url) return { url: first0.url, engine: "openai" };
      const err = (data && data.error) || {};
      const msg = String(err.message || ("HTTP " + status));
      tried.push({ engine: "openai " + model, ok: false, said: msg.slice(0, 200) });
      if (err.code === "moderation_blocked" || /safety system|moderation|content polic/i.test(msg)) return { refused: msg };
      if (/model|not found|does not exist|deprecat|verif|access/i.test(msg)) continue;   // try the next name
      return null;                                                                      // quota, outage - next engine
    }
    return null;
  }

  // ── Cloudflare FLUX.1 [schnell]: free within the daily allowance, Apache-2.0 output.
  async function flux() {
    if (!cfAcct || !cfTok) return null;
    const ms = left(35000); if (ms < 5000) return null;
    try {
      const payload = { prompt: prompt.slice(0, 2048), steps: hi ? 8 : 6 };
      if (Number.isInteger(body.seed) && body.seed > 0) payload.seed = body.seed;
      const r = await timed(ms, (signal) => fetch("https://api.cloudflare.com/client/v4/accounts/" + cfAcct + "/ai/run/@cf/black-forest-labs/flux-1-schnell", {
        method: "POST", signal, headers: { "Content-Type": "application/json", Authorization: "Bearer " + cfTok }, body: JSON.stringify(payload),
      }));
      const j = await r.json().catch(() => null);
      const b64 = j && ((j.result && j.result.image) || j.image);
      tried.push({ engine: "cloudflare flux", ok: !!b64, status: r.status });
      return b64 ? { b64, mime: "image/jpeg", engine: "cloudflare" } : null;
    } catch (e) { tried.push({ engine: "cloudflare flux", ok: false, said: "timed out" }); return null; }
  }

  // ── Runway Gen-4 Image: queued, so it is started and then watched until it lands.
  async function runway() {
    if (!runwayKey) return null;
    const H = { "Content-Type": "application/json", "Authorization": "Bearer " + runwayKey, "X-Runway-Version": "2024-11-06" };
    const RATIO = { "1024x1536": "1080:1440", "1536x1024": "1440:1080" }[size] || "1024:1024";
    try {
      const ms = left(20000); if (ms < 5000) return null;
      const r = await timed(ms, (signal) => fetch("https://api.dev.runwayml.com/v1/text_to_image", {
        method: "POST", signal, headers: H, body: JSON.stringify({ model: "gen4_image", promptText: prompt, ratio: RATIO }),
      }));
      const j = await r.json().catch(() => null);
      const id = j && j.id;
      tried.push({ engine: "runway gen4_image", ok: !!id, status: r.status });
      if (!id) return null;
      while (left(60000) > 4000) {
        await new Promise((ok) => setTimeout(ok, 2500));
        const p = await timed(8000, (signal) => fetch("https://api.dev.runwayml.com/v1/tasks/" + encodeURIComponent(id), { headers: H, signal })).catch(() => null);
        const t = p && p.ok ? await p.json().catch(() => null) : null;
        const st = t && String(t.status || "").toUpperCase();
        if (st === "SUCCEEDED" && t.output && t.output[0]) {
          // Runway's links expire within two days, so the picture itself is brought home when it
          // is small enough to travel; otherwise the link is handed back as it is.
          try {
            const g = await timed(15000, (signal) => fetch(t.output[0], { signal }));
            const buf = Buffer.from(await g.arrayBuffer());
            if (g.ok && buf.length && buf.length < 3000000) return { b64: buf.toString("base64"), mime: g.headers.get("content-type") || "image/png", engine: "runway" };
          } catch (e) {}
          return { url: t.output[0], engine: "runway", expires: true };
        }
        if (st === "FAILED" || st === "CANCELLED") return null;
      }
      return null;
    } catch (e) { return null; }
  }

  // ── Real photographs, licensed for commercial use. Only reached when every painter failed.
  const STOP = new Set("a an the of and or with in on at to for from by into over under very some is are be my your our this that it as like make create draw paint generate image picture photo photograph showing realistic style high quality detailed 4k 8k".split(" "));
  const words = prompt.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).slice(0, 5).join(" ");
  async function openverse() {
    if (!words) return null;
    try {
      const ms = left(9000); if (ms < 3000) return null;
      const H = { "User-Agent": "TheSpine/1.0 (hello@thespine.cloud)" };
      const u = "https://api.openverse.org/v1/images/?q=" + encodeURIComponent(words) + "&license_type=commercial,modification&mature=false&page_size=8";
      const r = await timed(ms, (signal) => fetch(u, { headers: H, signal }));
      const j = r.ok ? await r.json().catch(() => null) : null;
      const pick = j && (j.results || []).find((x) => x && x.url && /^https:\/\//.test(x.url) && !/\.svg(\?|$)/i.test(x.url));
      tried.push({ engine: "openverse", ok: !!pick, status: r.status });
      if (!pick) return null;
      const lic = (String(pick.license || "").toUpperCase() === "CC0" || pick.license === "pdm") ? "public domain" : ("CC " + String(pick.license || "").toUpperCase() + (pick.license_version ? " " + pick.license_version : ""));
      return { url: pick.url, engine: "openverse", stock: true,
        credit: { text: (pick.title ? "“" + String(pick.title).slice(0, 80) + "” " : "") + (pick.creator ? "by " + String(pick.creator).slice(0, 60) + " " : "") + "(" + lic + ")", url: pick.foreign_landing_url || pick.url } };
    } catch (e) { return null; }
  }
  async function pexels() {
    if (!pexelsKey || !words) return null;
    try {
      const ms = left(9000); if (ms < 3000) return null;
      const orient = size === "1024x1536" ? "&orientation=portrait" : size === "1536x1024" ? "&orientation=landscape" : "";
      const r = await timed(ms, (signal) => fetch("https://api.pexels.com/v1/search?per_page=1&query=" + encodeURIComponent(words) + orient, { headers: { Authorization: pexelsKey }, signal }));
      const j = r.ok ? await r.json().catch(() => null) : null;
      const ph = j && j.photos && j.photos[0];
      tried.push({ engine: "pexels", ok: !!ph, status: r.status });
      if (!ph || !ph.src) return null;
      return { url: ph.src.large2x || ph.src.large || ph.src.original, engine: "pexels", stock: true,
        credit: { text: "Photo by " + String(ph.photographer || "a Pexels photographer").slice(0, 60) + " on Pexels", url: ph.url || "https://www.pexels.com" } };
    } catch (e) { return null; }
  }

  const painters = prefer === "free" ? [flux, openai, runway] : [openai, runway, flux];
  const anyPainter = !!(openaiKey || (cfAcct && cfTok) || runwayKey);
  try {
    for (const paint of painters) {
      const got = await paint();
      if (got && got.refused) return res.status(200).json({ error: got.refused, refused: true });
      if (got) return res.status(200).json(got);
    }
    if (allowStock) {
      for (const find of [openverse, pexels]) {
        const got = await find();
        if (got) return res.status(200).json(got);
      }
    }
    if (!anyPainter && !allowStock) return res.status(200).json({ notConnected: true });
    if (!anyPainter && !pexelsKey && !tried.length) return res.status(200).json({ notConnected: true });
    return res.status(200).json({ error: "No picture came back from any engine just now. Try again in a moment.", tried });
  } catch (e) {
    return res.status(200).json({ error: "Image service error: " + (e && e.message ? e.message : String(e)) });
  }
}
