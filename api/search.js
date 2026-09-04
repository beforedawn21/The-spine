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
    let ip = "unknown";
    try { const xff = String(req.headers["x-forwarded-for"] || ""); ip = xff ? xff.split(",")[0].trim() : String(req.headers["x-real-ip"] || (req.socket && req.socket.remoteAddress) || "unknown"); } catch (e) {}
    const key = name + ":" + ip;
    const b = __rlBuckets.get(key);
    if (!b || b.resetAt <= now) { __rlBuckets.set(key, { count: 1, resetAt: now + windowMs }); return { ok: true }; }
    if (b.count < limit) { b.count++; return { ok: true }; }
    return { ok: false, retryAfter: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  } catch (e) { return { ok: true }; }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return res.status(200).json({ notConnected: true });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const query = (body.query || "").toString().slice(0, 400);
    if (!query.trim()) return res.status(400).json({ error: "A query is required." });

    // Current Tavily API: key goes in the Authorization header as a Bearer token.
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey,
      },
      body: JSON.stringify({
        query: query,
        search_depth: "basic",
        include_answer: true,
        max_results: 5,
      }),
    });

    let data;
    try { data = await response.json(); } catch (parseErr) {
      return res.status(200).json({ error: "Tavily returned a non-JSON response (status " + response.status + ")." });
    }

    if (!response.ok) {
      // Surface the real reason (bad key, billing, etc.) so we can see it.
      const msg = (data && (data.error || data.detail || data.message)) || ("HTTP " + response.status);
      return res.status(200).json({ error: "Tavily: " + msg });
    }
    if (data && data.error) return res.status(200).json({ error: "Tavily: " + data.error });

    const results = (data.results || []).map((r) => ({
      title: r.title, url: r.url, content: (r.content || "").slice(0, 600),
    }));
    return res.status(200).json({ answer: data.answer || "", results: results });
  } catch (e) {
    return res.status(200).json({ error: "Search service error: " + (e && e.message ? e.message : String(e)) });
  }
  {
    const rl = __rateLimit(req, "search", 120, 3600000);
    if (!rl.ok) return res.status(429).json({ error: "Too many requests - try again shortly.", retryAfter: rl.retryAfter });
  }
}
