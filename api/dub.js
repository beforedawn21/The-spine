// The Spine - voice / dub proxy (ElevenLabs).
// Dormant until ELEVENLABS_API_KEY is set in Vercel. Fully fail-open: if the key is missing or the
// service errors, this returns a calm status and NEVER affects any other pipe.
//
// POST { text, voiceId? }  -> { audioUrl }   (audioUrl is a base64 data URL the browser can play)
//
// Auth: ElevenLabs uses the  xi-api-key: <KEY>  header. TTS returns raw audio bytes.

// A widely-available default multilingual voice ("Rachel"); the pipe can pass its own voiceId later.
const DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM";
const MODEL = "eleven_multilingual_v2";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return res.status(200).json({ notConnected: true });

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch (e) {
    return res.status(200).json({ error: "Bad request body." });
  }

  const text = (body.text || "").toString().slice(0, 5000);
  if (!text.trim()) return res.status(400).json({ error: "Text is required to generate a voice." });
  const voiceId = (body.voiceId || DEFAULT_VOICE).toString();

  try {
    const r = await fetch("https://api.elevenlabs.io/v1/text-to-speech/" + encodeURIComponent(voiceId), {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify({
        text: text,
        model_id: MODEL,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!r.ok) {
      // ElevenLabs returns JSON on error - surface the real reason (bad key, credits, model access).
      let msg = "HTTP " + r.status;
      try {
        const err = await r.json();
        msg = (err && err.detail && (err.detail.message || err.detail)) || (err && err.message) || msg;
        if (typeof msg === "object") msg = JSON.stringify(msg);
      } catch (pe) { /* keep HTTP status */ }
      return res.status(200).json({ error: "Voice engine: " + msg });
    }

    // Success: raw MP3 bytes. Convert to a base64 data URL the browser can play directly.
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length) return res.status(200).json({ error: "Voice engine returned empty audio." });
    const audioUrl = "data:audio/mpeg;base64," + buf.toString("base64");
    return res.status(200).json({ audioUrl: audioUrl });
  } catch (e) {
    // Fail-open: any error is contained here; nothing else on the Spine is affected.
    return res.status(200).json({ error: "Voice service error: " + (e && e.message ? e.message : String(e)) });
  }
}
