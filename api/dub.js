// The Spine - voice / dub proxy (ElevenLabs).
// Dormant until ELEVENLABS_API_KEY is set in Vercel. Fully fail-open: if the key is missing or the
// service errors, this returns a calm status and NEVER affects any other pipe.
//
// POST { text, voiceId? }  -> { audioUrl }   (audioUrl is a base64 data URL the browser can play)
//
// Auth: ElevenLabs uses the  xi-api-key: <KEY>  header. TTS returns raw audio bytes.

// Default voice: use the user's own voice via ELEVENLABS_VOICE_ID if set (required on the free tier,
// which blocks stock "library" voices through the API). Falls back to a stock voice for paid plans.
const DEFAULT_VOICE = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
const MODEL = "eleven_multilingual_v2";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch (e) {
    return res.status(200).json({ error: "Bad request body." });
  }

  const text = (body.text || "").toString().slice(0, 5000);
  if (!text.trim()) return res.status(400).json({ error: "Text is required to generate a voice." });
  const voiceId = (body.voiceId || DEFAULT_VOICE).toString();

  // OpenAI TTS fallback - 11 built-in voices, no voice-ID config needed. Used when ElevenLabs
  // has no key, or when it errors. Uses the OPENAI_API_KEY you already have.
  async function openaiTTS() {
    if (!openaiKey) return null;
    try {
      const ovoice = (body.openaiVoice || "alloy").toString();
      const r = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: { "Authorization": "Bearer " + openaiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "tts-1", voice: ovoice, input: text }),
      });
      if (!r.ok) return null;
      const buf = Buffer.from(await r.arrayBuffer());
      if (!buf.length) return null;
      return "data:audio/mpeg;base64," + buf.toString("base64");
    } catch (e) { return null; }
  }

  // If ElevenLabs isn't connected, go straight to OpenAI TTS.
  if (!apiKey) {
    const fb = await openaiTTS();
    if (fb) return res.status(200).json({ audioUrl: fb, engine: "openai" });
    return res.status(200).json({ notConnected: true });
  }

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
      // Friendlier guidance for the common free-tier library-voice block.
      if (/library voices|upgrade your subscription/i.test(String(msg))) {
        msg = "Your ElevenLabs plan can't use stock voices via API. Create or clone a voice in your ElevenLabs dashboard, then set its ID as ELEVENLABS_VOICE_ID in Vercel - or upgrade your ElevenLabs plan.";
      }
      // Fall back to OpenAI TTS so the user still gets a voice.
      const fb = await openaiTTS();
      if (fb) return res.status(200).json({ audioUrl: fb, engine: "openai" });
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
