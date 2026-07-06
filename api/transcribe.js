// The Spine - transcription leg (audio -> text).
// OCTOPUS DOCTRINE: OpenAI Whisper is the primary brain; if it fails, this leg routes to
// ElevenLabs speech-to-text. If both fail, it fails open with a calm message - the creature is fine.
//
// POST { audio: "data:audio/...;base64,....", mime? } -> { text } | { notConnected } | { error }

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const openaiKey = process.env.OPENAI_API_KEY;
  const elevenKey = process.env.ELEVENLABS_API_KEY;
  if (!openaiKey && !elevenKey) return res.status(200).json({ notConnected: true });

  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {}; }
  catch (e) { return res.status(200).json({ error: "Bad request body." }); }

  const audio = (body.audio || "").toString();
  if (!audio || audio.indexOf(",") === -1) return res.status(400).json({ error: "Audio data is required." });
  const mime = (body.mime || (audio.match(/^data:([^;]+);/) || [])[1] || "audio/webm").toString();
  const b64 = audio.slice(audio.indexOf(",") + 1);
  const bytes = Buffer.from(b64, "base64");
  const ext = mime.indexOf("mp3") !== -1 ? "mp3" : mime.indexOf("wav") !== -1 ? "wav" : mime.indexOf("m4a") !== -1 ? "m4a" : "webm";

  // PRIMARY: OpenAI Whisper
  if (openaiKey) {
    try {
      const form = new FormData();
      form.append("file", new Blob([bytes], { type: mime }), "audio." + ext);
      form.append("model", "whisper-1");
      const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { "Authorization": "Bearer " + openaiKey },
        body: form,
      });
      const data = await r.json();
      if (r.ok && data && typeof data.text === "string") return res.status(200).json({ text: data.text });
    } catch (e) { /* route to fallback */ }
  }

  // FALLBACK: ElevenLabs speech-to-text
  if (elevenKey) {
    try {
      const form = new FormData();
      form.append("file", new Blob([bytes], { type: mime }), "audio." + ext);
      form.append("model_id", "scribe_v1");
      const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST",
        headers: { "xi-api-key": elevenKey },
        body: form,
      });
      const data = await r.json();
      if (r.ok && data && typeof data.text === "string") return res.status(200).json({ text: data.text });
    } catch (e) { /* fall through to fail-open */ }
  }

  return res.status(200).json({ error: "Couldn't transcribe the audio just now. Please try again." });
}
