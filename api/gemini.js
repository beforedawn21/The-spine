// ============================================================================
//  /api/gemini — a second brain, free, with room to read whole documents
// ============================================================================
//  Google's free tier gives a 1,000,000 token context window and vision at no
//  cost, which is far more room than anything else here. That makes it the
//  right engine for one specific job: reading something LONG - a whole book, a
//  contract, a year of notes, a set of photographs - and answering about it.
//
//  It does NOT replace the reasoning centre. Core still runs on Anthropic.
//  This is a tool the pipes can reach for when the job is "read all of this".
//
//  DORMANT until GEMINI_API_KEY is set in Vercel. With no key it returns
//  { notConnected: true } and every caller carries on as if it were never here.
//
//  Accepts { prompt, system?, images?, model?, maxTokens? }
//  Returns { text } | { notConnected: true } | { error }
// ============================================================================

// Budget guard, self-contained so this route can never fail to load because a
// helper file is missing. Fails open, and never limits an unidentifiable caller
// rather than putting everyone in one bucket.
const __rlBuckets = globalThis.__spineRlBuckets || (globalThis.__spineRlBuckets = new Map());
function __rateLimit(req, name, limit, windowMs) {
  try {
    const now = Date.now();
    if (__rlBuckets.size > 5000) { for (const [k, v] of __rlBuckets) { if (v.resetAt <= now) __rlBuckets.delete(k); } }
    let ip = "";
    try {
      const xff = String(req.headers["x-forwarded-for"] || "");
      ip = xff ? xff.split(",")[0].trim() : String(req.headers["x-real-ip"] || (req.socket && req.socket.remoteAddress) || "");
    } catch (e) {}
    if (!ip || ip === "unknown") return { ok: true };
    const key = name + ":" + ip;
    const b = __rlBuckets.get(key);
    if (!b || b.resetAt <= now) { __rlBuckets.set(key, { count: 1, resetAt: now + windowMs }); return { ok: true }; }
    if (b.count < limit) { b.count++; return { ok: true }; }
    return { ok: false, retryAfter: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  } catch (e) { return { ok: true }; }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  {
    const rl = __rateLimit(req, "gemini", 60, 3600000);
    if (!rl.ok) return res.status(429).json({ error: "Too many requests - try again shortly.", retryAfter: rl.retryAfter });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(200).json({ notConnected: true });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const prompt = String(body.prompt || "").slice(0, 400000);
    if (!prompt.trim()) return res.status(200).json({ error: "Nothing to read." });

    const system = String(body.system || "").slice(0, 8000);
    // flash is fast and free; pro is available to callers that ask for it.
    const allowed = { "gemini-2.0-flash": 1, "gemini-2.5-flash": 1, "gemini-2.5-pro": 1 };
    const model = allowed[body.model] ? body.model : "gemini-2.5-flash";
    let maxTokens = 2048;
    if (typeof body.maxTokens === "number" && body.maxTokens > 0) {
      maxTokens = Math.min(Math.max(body.maxTokens, 256), 8192);
    }

    // Images arrive as data URLs from the browser and are sent inline.
    const parts = [{ text: prompt }];
    const images = Array.isArray(body.images) ? body.images.slice(0, 8) : [];
    for (const img of images) {
      try {
        const m = String(img).match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
        if (m) parts.push({ inline_data: { mime_type: m[1], data: m[2] } });
      } catch (e) {}
    }

    const payload = {
      contents: [{ role: "user", parts }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
    };
    if (system) payload.systemInstruction = { parts: [{ text: system }] };

    // Google returns 429 and 503 under load. Retry a transient failure rather
    // than handing the caller an error it cannot do anything about.
    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent";
    const TRANSIENT = { 429: 1, 500: 1, 502: 1, 503: 1, 504: 1 };
    let response = null, lastErr = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify(payload),
        });
        if (response.ok) break;
        if (!TRANSIENT[response.status]) break;
        lastErr = "upstream " + response.status;
      } catch (e) {
        lastErr = (e && e.message) || "network";
        response = null;
      }
      if (attempt < 2) await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
    }
    if (!response) return res.status(200).json({ error: "Gemini unreachable: " + lastErr, retry: true });

    const data = await response.json();
    if (data && data.error) {
      return res.status(200).json({ error: "Gemini: " + (data.error.message || "unknown").slice(0, 200) });
    }

    const cand = data && data.candidates && data.candidates[0];
    const text = ((cand && cand.content && cand.content.parts) || [])
      .map(p => (typeof p.text === "string" ? p.text : ""))
      .join("")
      .trim();

    if (!text) {
      // A blocked or empty answer should say so plainly rather than look like success.
      const why = (cand && cand.finishReason) || (data && data.promptFeedback && data.promptFeedback.blockReason) || "empty";
      return res.status(200).json({ error: "Gemini returned nothing (" + why + ")." });
    }
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(200).json({ error: "Gemini failed: " + String((e && e.message) || e).slice(0, 200) });
  }
}
