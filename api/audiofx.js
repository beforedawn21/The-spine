// The Spine - audio FX leg (ElevenLabs byproducts on the same key you already pay for).
//   { action:"sfx", prompt, seconds? }  -> { audioUrl }   text -> sound effect
//   { action:"isolate", audio }         -> { audioUrl }   strip background noise from a voice clip
// OCTOPUS DOCTRINE: own leg, own logic, fails open. If the key is missing or the call fails,
// returns a calm status and never affects any other pipe.

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return res.status(200).json({ notConnected: true });

  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {}; }
  catch (e) { return res.status(200).json({ error: "Bad request body." }); }

  const action = (body.action || "").toString();

  // ============================ SOUND EFFECTS ============================
  if (action === "sfx") {
    const prompt = (body.prompt || "").toString().slice(0, 450);
    if (!prompt.trim()) return res.status(400).json({ error: "Describe the sound you want." });
    try {
      const payload = { text: prompt };
      const secs = Number(body.seconds);
      if (secs && secs > 0 && secs <= 22) payload.duration_seconds = secs;
      const r = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) { return res.status(200).json({ error: "Couldn't generate that sound just now. Please try again." }); }
      const buf = Buffer.from(await r.arrayBuffer());
      if (!buf.length) return res.status(200).json({ error: "Empty audio returned. Please try again." });
      return res.status(200).json({ audioUrl: "data:audio/mpeg;base64," + buf.toString("base64") });
    } catch (e) { return res.status(200).json({ error: "Couldn't generate that sound just now. Please try again." }); }
  }

  // ============================ VOICE ISOLATION ============================
  if (action === "isolate") {
    const audio = (body.audio || "").toString();
    if (!audio || audio.indexOf(",") === -1) return res.status(400).json({ error: "Audio data is required." });
    const mime = (audio.match(/^data:([^;]+);/) || [])[1] || "audio/webm";
    const bytes = Buffer.from(audio.slice(audio.indexOf(",") + 1), "base64");
    const ext = mime.indexOf("mp3") !== -1 ? "mp3" : mime.indexOf("wav") !== -1 ? "wav" : mime.indexOf("m4a") !== -1 ? "m4a" : "webm";
    try {
      const form = new FormData();
      form.append("audio", new Blob([bytes], { type: mime }), "audio." + ext);
      const r = await fetch("https://api.elevenlabs.io/v1/audio-isolation", {
        method: "POST", headers: { "xi-api-key": apiKey }, body: form,
      });
      if (!r.ok) { return res.status(200).json({ error: "Couldn't clean that audio just now. Please try again." }); }
      const buf = Buffer.from(await r.arrayBuffer());
      if (!buf.length) return res.status(200).json({ error: "Empty audio returned. Please try again." });
      return res.status(200).json({ audioUrl: "data:audio/mpeg;base64," + buf.toString("base64") });
    } catch (e) { return res.status(200).json({ error: "Couldn't clean that audio just now. Please try again." }); }
  }

  return res.status(400).json({ error: "Unknown action." });
}
