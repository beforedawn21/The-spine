// The Spine - live search proxy (Tavily). Last-resort lookup.
// Dormant until TAVILY_API_KEY is set in Vercel. Accepts { query }. Returns { results, answer } or { notConnected }.
// Uses the modern Bearer-token auth (current Tavily API).

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
}
