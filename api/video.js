// The Spine — video generation proxy. Kling primary, Runway secondary.
// Dormant until KLING_API_KEY (or RUNWAY_API_KEY) is set in Vercel.
// Accepts { prompt, seconds }. Returns { url } or { taskId, status } or { notConnected }.
//
// NOTE: Video providers differ in exact request/response shape and are often async
// (you submit a job, then poll for the result). This builds the standard shape;
// once the real key is added we verify the live response and adjust if needed.

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const klingKey = process.env.KLING_API_KEY;
  const runwayKey = process.env.RUNWAY_API_KEY;
  if (!klingKey && !runwayKey) return res.status(200).json({ notConnected: true });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const prompt = (body.prompt || "").toString().slice(0, 800);
    if (!prompt.trim()) return res.status(400).json({ error: "A prompt is required." });

    // HARD CAP on length — video is the cost-explosion risk. Never exceed the ceiling.
    const MAX_SECONDS = 5;
    let seconds = parseInt(body.seconds || 5, 10);
    if (isNaN(seconds) || seconds < 1) seconds = 5;
    if (seconds > MAX_SECONDS) seconds = MAX_SECONDS;

    // PRIMARY: Kling
    if (klingKey) {
      try {
        const r = await fetch("https://api.klingai.com/v1/videos/text2video", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + klingKey },
          body: JSON.stringify({ prompt, duration: seconds, mode: "std" }),
        });
        const data = await r.json();
        if (data && (data.task_id || data.id)) {
          return res.status(200).json({ provider: "kling", taskId: data.task_id || data.id, status: "processing" });
        }
        if (data && data.error) {
          // fall through to Runway if available
          if (!runwayKey) return res.status(200).json({ error: data.error.message || "Kling error." });
        }
        if (data && data.video_url) return res.status(200).json({ provider: "kling", url: data.video_url });
      } catch (e) {
        if (!runwayKey) return res.status(200).json({ error: "Kling service error." });
      }
    }

    // SECONDARY: Runway
    if (runwayKey) {
      const r = await fetch("https://api.runwayml.com/v1/image_to_video", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + runwayKey, "X-Runway-Version": "2024-11-06" },
        body: JSON.stringify({ promptText: prompt, duration: seconds, model: "gen3a_turbo" }),
      });
      const data = await r.json();
      if (data && (data.id || data.task_id)) return res.status(200).json({ provider: "runway", taskId: data.id || data.task_id, status: "processing" });
      if (data && data.error) return res.status(200).json({ error: data.error });
    }

    return res.status(200).json({ error: "No video provider responded." });
  } catch (e) {
    return res.status(200).json({ error: "Video service error: " + (e && e.message ? e.message : String(e)) });
  }
}
