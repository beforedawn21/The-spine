// The Spine - URL reading leg (paste a link -> Core reads it).
// OCTOPUS DOCTRINE: Tavily extract is the primary brain; if it fails, this leg routes to a plain
// fetch + tag-strip. If both fail, it fails open with a calm message.
//
// POST { url } -> { content, title? } | { notConnected } | { error }

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {}; }
  catch (e) { return res.status(200).json({ error: "Bad request body." }); }

  let url = (body.url || "").toString().trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  if (!/^https?:\/\/.+\..+/.test(url)) return res.status(400).json({ error: "A valid URL is required." });

  const tavilyKey = process.env.TAVILY_API_KEY;

  // PRIMARY: Tavily extract (clean, readable content)
  if (tavilyKey) {
    try {
      const r = await fetch("https://api.tavily.com/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + tavilyKey },
        body: JSON.stringify({ urls: [url] }),
      });
      const data = await r.json();
      const first = data && data.results && data.results[0];
      const content = first && (first.raw_content || first.content);
      if (r.ok && content) return res.status(200).json({ content: String(content).slice(0, 12000), title: first.title || "" });
    } catch (e) { /* route to fallback */ }
  }

  // FALLBACK: plain fetch + strip tags (best-effort readable text)
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; SpineBot/1.0)" } });
    const html = await r.text();
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
