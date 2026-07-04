// The Spine - music generation proxy (Suno via sunor.cc).
// Dormant until SUNO_API_KEY is set in Vercel. Fully fail-open: if the key is missing or the
// reseller is down/erroring, this returns a calm status and NEVER affects any other pipe.
//
// Suno generation is async and takes ~30-60s, which nears Vercel's 60s function cap, so this
// endpoint is TWO-STEP so no single request is held open that long:
//   POST { action:"start", prompt }        -> { taskId }        (kicks off the job)
//   POST { action:"poll",  taskId }        -> { status, audioUrl, title } | { status:"pending" }
//
// Auth: sunor.cc uses the  x-api-key: <KEY>  header (NOT Bearer).

const SUNO_BASE = "https://sunor.cc/api/v1";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.SUNO_API_KEY;
  if (!apiKey) return res.status(200).json({ notConnected: true });

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch (e) {
    return res.status(200).json({ error: "Bad request body." });
  }

  const headers = { "Content-Type": "application/json", "x-api-key": apiKey };
  const action = (body.action || "start").toString();

  try {
    // ---- STEP 1: start a generation task ----
    if (action === "start") {
      const prompt = (body.prompt || "").toString().slice(0, 2000);
      if (!prompt.trim()) return res.status(400).json({ error: "A music prompt is required." });

      const r = await fetch(SUNO_BASE + "/task", {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: "suno",
          task_type: "music",
          input: { gpt_description_prompt: prompt },
        }),
      });

      let data;
      try { data = await r.json(); } catch (pe) {
        return res.status(200).json({ error: "Music engine returned a non-JSON response (status " + r.status + ")." });
      }
      if (!r.ok) {
        const msg = (data && (data.error || data.detail || data.message)) || ("HTTP " + r.status);
        return res.status(200).json({ error: "Music engine: " + msg });
      }
      const taskId = data && data.data && (data.data.task_id || data.data.taskId || data.data.id);
      if (!taskId) return res.status(200).json({ error: "Music engine did not return a task id." });
      return res.status(200).json({ taskId: taskId });
    }

    // ---- STEP 2: poll a task for its result ----
    if (action === "poll") {
      const taskId = (body.taskId || "").toString();
      if (!taskId) return res.status(400).json({ error: "A taskId is required to poll." });

      const r = await fetch(SUNO_BASE + "/task/" + encodeURIComponent(taskId), { method: "GET", headers });
      let data;
      try { data = await r.json(); } catch (pe) {
        return res.status(200).json({ error: "Music engine returned a non-JSON response (status " + r.status + ")." });
      }
      if (!r.ok) {
        const msg = (data && (data.error || data.detail || data.message)) || ("HTTP " + r.status);
        return res.status(200).json({ error: "Music engine: " + msg });
      }

      const d = (data && data.data) || {};
      const status = (d.status || "pending").toString();

      if (status === "success") {
        // Suno succeeded - find the audio URL wherever sunor.cc nested it. Deep-search the whole
        // response so we're robust to their exact shape (field names/nesting vary).
        function findAudio(obj, depth) {
          if (!obj || depth > 6) return "";
          if (typeof obj === "string") {
            if (/^https?:\/\/.+\.(mp3|wav|m4a|ogg|flac)(\?|$)/i.test(obj)) return obj;
            return "";
          }
          if (Array.isArray(obj)) {
            for (const it of obj) { const f = findAudio(it, depth + 1); if (f) return f; }
            return "";
          }
          if (typeof obj === "object") {
            // Prefer explicit audio fields first.
            for (const k of ["audio_url", "audioUrl", "audio", "stream_audio_url", "source_audio_url"]) {
              if (typeof obj[k] === "string" && /^https?:\/\//i.test(obj[k])) return obj[k];
            }
            for (const k in obj) { const f = findAudio(obj[k], depth + 1); if (f) return f; }
          }
          return "";
        }
        let title = "";
        const out = d.output || d.result || d.clips || d.songs || d.data || d;
        if (Array.isArray(out) && out.length && out[0]) title = out[0].title || "";
        else if (out && typeof out === "object") title = out.title || "";
        const audioUrl = findAudio(data, 0);
        if (!audioUrl) return res.status(200).json({ status: "success", error: "Track finished but no audio URL was returned." });
        return res.status(200).json({ status: "success", audioUrl: audioUrl, title: title });
      }
      if (status === "failure" || status === "failed") {
        return res.status(200).json({ status: "failure", error: (d.error || "The music engine could not generate this track. (Credits for failed generations are refunded.)") });
      }
      // still working
      return res.status(200).json({ status: "pending" });
    }

    return res.status(400).json({ error: "Unknown action." });
  } catch (e) {
    // Fail-open: any error is contained here and reported; nothing else on the Spine is affected.
    return res.status(200).json({ error: "Music service error: " + (e && e.message ? e.message : String(e)) });
  }
}
