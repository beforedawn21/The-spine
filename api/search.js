// The Spine - live search proxy (Tavily). Last-resort lookup.
// Dormant until TAVILY_API_KEY is set in Vercel. Accepts { query }. Returns { results, answer } or { notConnected }.
// Uses the modern Bearer-token auth (current Tavily API).

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
    const rl = __rateLimit(req, "search", 120, 3600000);
    if (!rl.ok) return res.status(429).json({ error: "Too many requests - try again shortly.", retryAfter: rl.retryAfter });
  }
  {
    const __sg = await __spendGuard(req, "search");
    req.__spineTier = __sg.tier;
    if (!__sg.ok) return res.status(429).json({ error: "You've reached today's limit for this. It refills within 24 hours.", limitReached: true, resetAt: __sg.resetAt || null });
  }

  // THREE SEARCH ENGINES, ONE ANSWER SHAPE. Tavily first, as before. If it is missing, out of
  // credit or down, Jina's search and then Brave's are tried - each switches on the moment its
  // key is added. With none of them connected the app falls back to Wikipedia on its own.
  const apiKey = process.env.TAVILY_API_KEY;
  const jinaKey = process.env.JINA_API_KEY;
  const braveKey = process.env.BRAVE_API_KEY;
  if (!apiKey && !jinaKey && !braveKey) return res.status(200).json({ notConnected: true });

  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {}; }
  catch (e) { return res.status(200).json({ error: "Bad request body." }); }
  const query = (body.query || "").toString().slice(0, 400);
  if (!query.trim()) return res.status(400).json({ error: "A query is required." });

  const problems = [];
  if (apiKey) {
    try {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST", signal: AbortSignal.timeout(15000),
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
        body: JSON.stringify({ query: query, search_depth: "basic", include_answer: true, max_results: 5 }),
      });
      let data = null;
      try { data = await response.json(); } catch (parseErr) { data = null; }
      if (response.ok && data && !data.error) {
        const results = (data.results || []).map((r) => ({ title: r.title, url: r.url, content: (r.content || "").slice(0, 600) }));
        if (data.answer || results.length) return res.status(200).json({ answer: data.answer || "", results: results, engine: "tavily" });
      }
      problems.push("Tavily: " + String((data && (data.error || data.detail || data.message)) || ("HTTP " + response.status)).slice(0, 160));
    } catch (e) { problems.push("Tavily: " + ((e && e.message) || "unreachable")); }
  }
  if (jinaKey) {
    try {
      const r = await fetch("https://s.jina.ai/?q=" + encodeURIComponent(query), {
        signal: AbortSignal.timeout(15000),
        headers: { "Authorization": "Bearer " + jinaKey, "Accept": "application/json", "X-Respond-With": "no-content" },
      });
      const j = r.ok ? await r.json().catch(() => null) : null;
      const rows = (j && (j.data || j.results)) || [];
      const results = rows.slice(0, 5).map((x) => ({ title: x.title || "", url: x.url || "", content: String(x.description || x.content || "").slice(0, 600) })).filter((x) => x.url);
      if (results.length) return res.status(200).json({ answer: "", results, engine: "jina" });
      problems.push("Jina: HTTP " + r.status);
    } catch (e) { problems.push("Jina: unreachable"); }
  }
  if (braveKey) {
    try {
      const r = await fetch("https://api.search.brave.com/res/v1/web/search?count=5&q=" + encodeURIComponent(query), {
        signal: AbortSignal.timeout(15000),
        headers: { "X-Subscription-Token": braveKey, "Accept": "application/json" },
      });
      const j = r.ok ? await r.json().catch(() => null) : null;
      const rows = (j && j.web && j.web.results) || [];
      const results = rows.slice(0, 5).map((x) => ({ title: x.title || "", url: x.url || "", content: String(x.description || "").replace(/<[^>]+>/g, "").slice(0, 600) })).filter((x) => x.url);
      if (results.length) return res.status(200).json({ answer: "", results, engine: "brave" });
      problems.push("Brave: HTTP " + r.status);
    } catch (e) { problems.push("Brave: unreachable"); }
  }
  return res.status(200).json({ error: problems.join(" | ") || "Search returned nothing." });
}
