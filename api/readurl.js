// The Spine - URL reading leg (paste a link -> Core reads it).
// OCTOPUS DOCTRINE: Tavily extract is the primary brain; if it fails, this leg routes to a plain
// fetch + tag-strip. If both fail, it fails open with a calm message.
//
// POST { url } -> { content, title? } | { notConnected } | { error }

// Blocks anything that is not a public web page. Without this, a POST to /api/readurl with
// http://169.254.169.254/... reaches cloud metadata from inside Vercel, and file:// or
// http://localhost reaches the machine itself. That is a server-side request forgery hole,
// and it was wide open.
function isSafePublicUrl(raw) {
  let u;
  try { u = new URL(String(raw || "")); } catch (e) { return false; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase().replace(/\.$/, "");
  if (h === "localhost" || h === "0.0.0.0" || h.endsWith(".localhost")) return false;
  if (h === "metadata.google.internal" || h.endsWith(".internal")) return false;
  if (h.endsWith(".local") || h.endsWith(".lan") || h.endsWith(".home.arpa")) return false;
  // literal IPv4
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)];
    if (a === 10 || a === 127 || a === 0) return false;           // private / loopback / this host
    if (a === 172 && b >= 16 && b <= 31) return false;            // private
    if (a === 192 && b === 168) return false;                     // private
    if (a === 169 && b === 254) return false;                     // link-local: CLOUD METADATA
    if (a === 100 && b >= 64 && b <= 127) return false;           // carrier-grade NAT
    if (a >= 224) return false;                                   // multicast / reserved
  }
  // IPv6 loopback, link-local and unique-local
  if (h.startsWith("[")) {
    const v6 = h.replace(/^\[|\]$/g, "");
    if (v6 === "::1" || v6.startsWith("fe80") || v6.startsWith("fc") || v6.startsWith("fd")) return false;
  }
  if (h.includes("%")) return false;   // zone identifiers
  return true;
}

// THE MOST EXPENSIVE ENDPOINT HAD NO LIMITER.
// Every other paid route has one; this did not. Anyone, with no account, could loop
// this until the API key was exhausted. 20 calls a minute per address.
const RL = new Map();
function __rateLimit(ip, max, windowMs) {
  const now = Date.now();
  const hit = RL.get(ip);
  if (!hit || now > hit.reset) { RL.set(ip, { n: 1, reset: now + windowMs }); return true; }
  if (hit.n >= max) return false;
  hit.n++; return true;
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
  const __ip = (req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  if (!__rateLimit(__ip, 20, 60000)) {
    return res.status(429).json({ error: "Too many requests. Wait a minute." });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  {
    const __sg = await __spendGuard(req, "readurl");
    req.__spineTier = __sg.tier;
    if (!__sg.ok) return res.status(429).json({ error: "You've reached today's limit for this. It refills within 24 hours.", limitReached: true, resetAt: __sg.resetAt || null });
  }

  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {}; }
  catch (e) { return res.status(200).json({ error: "Bad request body." }); }

  let url = (body.url || "").toString().trim();
    if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
    if (!isSafePublicUrl(url)) {
      return res.status(400).json({ error: "That address can't be read - only public web pages." });
    }
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  if (!/^https?:\/\/.+\..+/.test(url)) return res.status(400).json({ error: "A valid URL is required." });

  const tavilyKey = process.env.TAVILY_API_KEY;

  // PRIMARY: Tavily extract (clean, readable content)
  if (tavilyKey) {
    try {
      const r = await fetch("https://api.tavily.com/extract", {
        method: "POST", signal: AbortSignal.timeout(15000),
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + tavilyKey },
        body: JSON.stringify({ urls: [url] }),
      });
      const data = await r.json();
      const first = data && data.results && data.results[0];
      const content = first && (first.raw_content || first.content);
      if (r.ok && content) return res.status(200).json({ content: String(content).slice(0, 12000), title: first.title || "" });
    } catch (e) { /* route to fallback */ }
  }

  // FALLBACK 1: Jina Reader (r.jina.ai) - keyless, returns clean readable text. No API key needed.
  try {
    // Jina reads keyless at 20 a minute; with a free JINA_API_KEY, 500 a minute.
    const jh = { "User-Agent": "Mozilla/5.0 (compatible; SpineBot/1.0)", "Accept": "text/plain" };
    if (process.env.JINA_API_KEY) jh["Authorization"] = "Bearer " + process.env.JINA_API_KEY;
    const jr = await fetch("https://r.jina.ai/" + url, { headers: jh, signal: AbortSignal.timeout(15000) });
    if (jr.ok) {
      const txt = await jr.text();
      if (txt && txt.trim().length > 40) {
        const tMatch = txt.match(/^Title:\s*(.+)$/im);
        return res.status(200).json({ content: txt.slice(0, 12000), title: tMatch ? tMatch[1].trim() : "" });
      }
    }
  } catch (e) { /* route to plain fetch */ }

  // FALLBACK 2: plain fetch + strip tags (best-effort readable text)
  try {
    // Redirects are followed by hand, and every hop is checked again - otherwise a public page
    // could bounce this server to a private address the first check never saw.
    let at = url, r = null;
    for (let hop = 0; hop < 4; hop++) {
      r = await fetch(at, { redirect: "manual", signal: AbortSignal.timeout(12000), headers: { "User-Agent": "Mozilla/5.0 (compatible; SpineBot/1.0)" } });
      if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
        const next = new URL(r.headers.get("location"), at).toString();
        if (!isSafePublicUrl(next)) { r = null; break; }
        at = next; continue;
      }
      break;
    }
    if (!r || (r.status >= 300 && r.status < 400)) throw new Error("redirect refused");
    const html = (await r.text()).slice(0, 3000000);
    if (html) {
      let text = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";
      if (text) return res.status(200).json({ content: text.slice(0, 12000), title: title.trim() });
    }
  } catch (e) { /* fall through to fail-open */ }

  return res.status(200).json({ error: "Couldn't read that page just now. Please try again or paste the text directly." });
}
