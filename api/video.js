// The Spine - video generation proxy. Kling primary, Runway secondary.
// Dormant until KLING_API_KEY (or RUNWAY_API_KEY) is set in Vercel.
//
// TWO-STEP (async) so no single request is held open near Vercel's 60s cap:
//   POST { action:"start", prompt, seconds, image }  -> { provider, taskId, status:"processing" } | { url } | { notConnected } | { error }
//   POST { action:"poll",  provider, taskId }         -> { status:"processing" } | { status:"success", url } | { error }
//
// Kling endpoint moved to the Singapore host (api.klingai.com was retired for non-China servers).
// Kling API Key uses Bearer auth: Authorization: Bearer <KEY>.

const KLING_BASE = "https://api-singapore.klingai.com";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const klingKey = process.env.KLING_API_KEY;
  const runwayKey = process.env.RUNWAY_API_KEY;
  if (!klingKey && !runwayKey) return res.status(200).json({ notConnected: true });

  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {}; }
  catch (e) { return res.status(200).json({ error: "Bad request body." }); }

  const action = (body.action || "start").toString();

  try {
    // ===================== POLL: check a running task for its finished video =====================
    if (action === "poll") {
      const provider = (body.provider || "kling").toString();
      const taskId = (body.taskId || "").toString();
      if (!taskId) return res.status(400).json({ error: "A taskId is required to poll." });

      if (provider === "kling" && klingKey) {
        // Deep-search any object for a video URL, whatever field/nesting Kling uses.
        function findVideo(obj, depth) {
          if (!obj || depth > 7) return "";
          if (typeof obj === "string") {
            if (/^https?:\/\/.+\.(mp4|mov|webm|m3u8)(\?|$)/i.test(obj)) return obj;
            return "";
          }
          if (Array.isArray(obj)) { for (const it of obj) { const f = findVideo(it, depth + 1); if (f) return f; } return ""; }
          if (typeof obj === "object") {
            for (const k of ["url", "video_url", "videoUrl"]) {
              if (typeof obj[k] === "string" && /^https?:\/\//i.test(obj[k]) && /\.(mp4|mov|webm|m3u8)/i.test(obj[k])) return obj[k];
            }
            for (const k in obj) { const f = findVideo(obj[k], depth + 1); if (f) return f; }
          }
          return "";
        }
        const paths = [
          KLING_BASE + "/v1/videos/text2video/" + encodeURIComponent(taskId),
          KLING_BASE + "/v1/videos/image2video/" + encodeURIComponent(taskId),
        ];
        let lastStatus = "";
        for (const url of paths) {
          try {
            const r = await fetch(url, { method: "GET", headers: { "Authorization": "Bearer " + klingKey } });
            let data; try { data = await r.json(); } catch (pe) { data = null; }
            if (!data) continue;
            const d = data.data || data;
            const status = (d.task_status || d.status || (data.data && data.data.task_status) || "").toString().toLowerCase();
            if (status) lastStatus = status;
            const vurl = findVideo(data, 0);
            if (vurl) return res.status(200).json({ status: "success", url: vurl });
            if (status === "failed" || status === "failure") return res.status(200).json({ error: "The video engine couldn't finish this one. (Any charge for failed jobs is typically refunded.)" });
          } catch (e) { /* try next path */ }
        }
        // still processing - pass the raw status back so the client can show what Kling reported
        return res.status(200).json({ status: "processing", raw: lastStatus || "no status returned" });
      }

      if (provider === "runway" && runwayKey) {
        try {
          const r = await fetch("https://api.runwayml.com/v1/tasks/" + encodeURIComponent(taskId), {
            method: "GET",
            headers: { "Authorization": "Bearer " + runwayKey, "X-Runway-Version": "2024-11-06" },
          });
          let data; try { data = await r.json(); } catch (pe) { data = null; }
          if (data) {
            const status = (data.status || "").toString().toUpperCase();
            if (status === "SUCCEEDED" && data.output && data.output.length) return res.status(200).json({ status: "success", url: data.output[0] });
            if (status === "FAILED") return res.status(200).json({ error: "The video engine couldn't finish this one." });
          }
        } catch (e) { /* fall through */ }
        return res.status(200).json({ status: "processing" });
      }

      return res.status(200).json({ status: "processing" });
    }

    // ===================== START: kick off a generation =====================
    const prompt = (body.prompt || "").toString().slice(0, 800);
    let image = (body.image || "").toString();
    const hasImage = image && image.length > 100;
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

    // PRIMARY: Kling (Singapore host, Bearer auth).
    if (klingKey) {
      try {
        const endpoint = hasImage
          ? KLING_BASE + "/v1/videos/image2video"
          : KLING_BASE + "/v1/videos/text2video";
        const payload = hasImage
          ? { image: imageBase64, prompt: prompt || "", duration: String(seconds), mode: "std" }
          : { prompt: prompt, duration: String(seconds), mode: "std" };
        const r = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + klingKey },
          body: JSON.stringify(payload),
        });
        let data; try { data = await r.json(); } catch (pe) { data = null; }
        if (data) {
          const d = data.data || data;
          const taskId = d.task_id || d.id || data.task_id || data.id;
          if (taskId) return res.status(200).json({ provider: "kling", mode: hasImage ? "image" : "text", taskId: taskId, status: "processing" });
          const vurl = d.video_url || (d.task_result && d.task_result.videos && d.task_result.videos[0] && d.task_result.videos[0].url);
          if (vurl) return res.status(200).json({ provider: "kling", url: vurl });
          if (!r.ok && !runwayKey) {
            const msg = (data.error && (data.error.message || data.error)) || data.message || ("HTTP " + r.status);
            return res.status(200).json({ error: "Kling: " + msg });
          }
        }
      } catch (e) {
        if (!runwayKey) return res.status(200).json({ error: "Kling service error: " + (e && e.message ? e.message : String(e)) });
      }
    }

    // SECONDARY: Runway (Bearer auth, natively image-to-video).
    if (runwayKey) {
      const rwBody = hasImage
        ? { promptImage: image, promptText: prompt || "", duration: seconds, model: "gen3a_turbo" }
        : { promptText: prompt, duration: seconds, model: "gen3a_turbo" };
      const r = await fetch("https://api.runwayml.com/v1/image_to_video", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + runwayKey, "X-Runway-Version": "2024-11-06" },
        body: JSON.stringify(rwBody),
      });
      let data; try { data = await r.json(); } catch (pe) { data = null; }
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
