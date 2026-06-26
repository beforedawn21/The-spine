// The Spine — live search proxy (Tavily). Last-resort lookup.
// Dormant until TAVILY_API_KEY is set in Vercel. Accepts { query }. Returns { results, answer } or { notConnected }.

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return res.status(200).json({ notConnected: true });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const query = (body.query || "").toString().slice(0, 400);
    if (!query.trim()) return res.status(400).json({ error: "A query is required." });

    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        include_answer: true,
        max_results: 5,
      }),
    });

    const data = await response.json();
    if (data && data.error) return res.status(200).json({ error: data.error });

    // Return a concise answer + sources for the AI to present in-house.
    const results = (data.results || []).map((r) => ({
      title: r.title, url: r.url, content: (r.content || "").slice(0, 600),
    }));
    return res.status(200).json({ answer: data.answer || "", results });
  } catch (e) {
    return res.status(200).json({ error: "Search service error: " + (e && e.message ? e.message : String(e)) });
  }
}
