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

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

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

  // FALLBACK 1: Jina Reader (r.jina.ai) - keyless, returns clean readable text. No API key needed.
  try {
    const jr = await fetch("https://r.jina.ai/" + url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; SpineBot/1.0)", "Accept": "text/plain" } });
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
