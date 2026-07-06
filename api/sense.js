// The Spine - the SENSE leg (input understanding), consolidated to conserve serverless functions.
// One leg, two senses, routed by action:
//   { action:"transcribe", audio, mime? } -> { text }      (Whisper primary -> ElevenLabs fallback)
//   { action:"readurl",   url }           -> { content, title? }  (Tavily primary -> fetch fallback)
// OCTOPUS DOCTRINE: each sense has a primary brain + a fallback; fails open if all routes fail.

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {}; }
  catch (e) { return res.status(200).json({ error: "Bad request body." }); }

  const action = (body.action || "").toString();

  // ============================ TRANSCRIBE ============================
  if (action === "transcribe") {
    const openaiKey = process.env.OPENAI_API_KEY;
    const elevenKey = process.env.ELEVENLABS_API_KEY;
    if (!openaiKey && !elevenKey) return res.status(200).json({ notConnected: true });

    const audio = (body.audio || "").toString();
    if (!audio || audio.indexOf(",") === -1) return res.status(400).json({ error: "Audio data is required." });
    const mime = (body.mime || (audio.match(/^data:([^;]+);/) || [])[1] || "audio/webm").toString();
    const bytes = Buffer.from(audio.slice(audio.indexOf(",") + 1), "base64");
    const ext = mime.indexOf("mp3") !== -1 ? "mp3" : mime.indexOf("wav") !== -1 ? "wav" : mime.indexOf("m4a") !== -1 ? "m4a" : "webm";

    if (openaiKey) {
      try {
        const form = new FormData();
        form.append("file", new Blob([bytes], { type: mime }), "audio." + ext);
        form.append("model", "whisper-1");
        const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST", headers: { "Authorization": "Bearer " + openaiKey }, body: form,
        });
        const data = await r.json();
        if (r.ok && data && typeof data.text === "string") return res.status(200).json({ text: data.text });
      } catch (e) { /* route to fallback */ }
    }
    if (elevenKey) {
      try {
        const form = new FormData();
        form.append("file", new Blob([bytes], { type: mime }), "audio." + ext);
        form.append("model_id", "scribe_v1");
        const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
          method: "POST", headers: { "xi-api-key": elevenKey }, body: form,
        });
        const data = await r.json();
        if (r.ok && data && typeof data.text === "string") return res.status(200).json({ text: data.text });
      } catch (e) { /* fall through */ }
    }
    return res.status(200).json({ error: "Couldn't transcribe the audio just now. Please try again." });
  }

  // ============================ READ URL ============================
  if (action === "readurl") {
    let url = (body.url || "").toString().trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    if (!/^https?:\/\/.+\..+/.test(url)) return res.status(400).json({ error: "A valid URL is required." });

    const tavilyKey = process.env.TAVILY_API_KEY;
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
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; SpineBot/1.0)" } });
      const html = await r.text();
      if (html) {
        const text = html
          .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
        const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";
        if (text) return res.status(200).json({ content: text.slice(0, 12000), title: title.trim() });
      }
    } catch (e) { /* fall through */ }
    return res.status(200).json({ error: "Couldn't read that page just now. Please try again or paste the text directly." });
  }

  return res.status(400).json({ error: "Unknown action." });
}
