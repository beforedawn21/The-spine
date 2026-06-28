// The Spine - video generation proxy. Kling primary, Runway secondary.
// Dormant until KLING_API_KEY (or RUNWAY_API_KEY) is set in Vercel.
// Accepts { prompt, seconds, image }. If `image` (a data URL or base64) is present,
// it runs IMAGE-TO-VIDEO; otherwise TEXT-TO-VIDEO. Returns { url } | { taskId, status } | { notConnected } | { error }.
import { rateLimit } from "./_ratelimit.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Budget protection: video is the most expensive call, so the tightest per-IP cap.
  const rl = rateLimit(req, "video", 4, 60000);
  if (!rl.ok) {
    res.setHeader("Retry-After", String(rl.retryAfter));
    return res.status(429).json({ error: "Too many video requests. Please wait a moment." });
  }

  const klingKey = process.env.KLING_API_KEY;
  const runwayKey = process.env.RUNWAY_API_KEY;
  if (!klingKey && !runwayKey) return res.status(200).json({ notConnected: true });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const prompt = (body.prompt || "").toString().slice(0, 800);
    // image may arrive as a full data URL ("data:image/png;base64,XXXX") or bare base64.
    let image = (body.image || "").toString();
    const hasImage = image && image.length > 100;
    // Kling wants bare base64 (no data: prefix); strip it if present.
    let imageBase64 = image;
    if (hasImage && image.indexOf(",") !== -1 && image.slice(0, 5) === "data:") {
      imageBase64 = image.slice(image.indexOf(",") + 1);
    }
    if (!prompt.trim() && !hasImage) return res.status(400).json({ error: "A prompt or an image is required." });

    // HARD CAP on length - video is the cost-explosion risk. Never exceed the ceiling.
    const MAX_SECONDS = 5;
    let seconds = parseInt(body.seconds || 5, 10);
    if (isNaN(seconds) || seconds < 1) seconds = 5;
    if (seconds > MAX_SECONDS) seconds = MAX_SECONDS;

    // PRIMARY: Kling - Bearer token auth. Endpoint depends on mode.
    if (klingKey) {
      try {
        const endpoint = hasImage
          ? "https://api.klingai.com/v1/videos/image2video"
          : "https://api.klingai.com/v1/videos/text2video";
        const payload = hasImage
          ? { image: imageBase64, prompt: prompt || "", duration: seconds, mode: "std" }
          : { prompt: prompt, duration: seconds, mode: "std" };
        const r = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + klingKey },
          body: JSON.stringify(payload),
        });
        let data;
        try { data = await r.json(); } catch (pe) { data = null; }
        if (data) {
          if (data.task_id || data.id || (data.data && data.data.task_id)) {
            return res.status(200).json({ provider: "kling", mode: hasImage ? "image" : "text", taskId: data.task_id || data.id || data.data.task_id, status: "processing" });
          }
          if (data.video_url || (data.data && data.data.video_url)) {
            return res.status(200).json({ provider: "kling", mode: hasImage ? "image" : "text", url: data.video_url || data.data.video_url });
          }
          if (!r.ok && !runwayKey) {
            const msg = (data.error && (data.error.message || data.error)) || data.message || ("HTTP " + r.status);
            return res.status(200).json({ error: "Kling: " + msg });
          }
        }
      } catch (e) {
        if (!runwayKey) return res.status(200).json({ error: "Kling service error: " + (e && e.message ? e.message : String(e)) });
      }
    }

    // SECONDARY: Runway - Bearer token auth. Runway's gen3 is natively image-to-video.
    if (runwayKey) {
      const rwBody = hasImage
        ? { promptImage: image, promptText: prompt || "", duration: seconds, model: "gen3a_turbo" }
        : { promptText: prompt, duration: seconds, model: "gen3a_turbo" };
      const r = await fetch("https://api.runwayml.com/v1/image_to_video", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + runwayKey, "X-Runway-Version": "2024-11-06" },
        body: JSON.stringify(rwBody),
      });
      let data;
      try { data = await r.json(); } catch (pe) { data = null; }
      if (data) {
        if (data.id || data.task_id) return res.status(200).json({ provider: "runway", mode: hasImage ? "image" : "text", taskId: data.id || data.task_id, status: "processing" });
        if (!r.ok) {
          const msg = (data.error && (data.error.message || data.error)) || data.message || ("HTTP " + r.status);
          return res.status(200).json({ error: "Runway: " + msg });
        }
      }
    }

    return res.status(200).json({ error: "No video provider responded." });
  } catch (e) {
    return res.status(200).json({ error: "Video service error: " + (e && e.message ? e.message : String(e)) });
  }
}
