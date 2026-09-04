// The Spine — image generation proxy.
// Dormant until OPENAI_API_KEY is set in Vercel (just like chat.js needed its key).
// Accepts { prompt, model, size }. Returns { url } or { b64 } for the generated image.

// ── Budget guard (self-contained, no import - an endpoint must never fail to load because a
//    helper file is missing). Ceilings sit far above human pace and it fails open, so a real
//    person is never blocked by it.
const __rlBuckets = globalThis.__spineRlBuckets || (globalThis.__spineRlBuckets = new Map());
function __rateLimit(req, name, limit, windowMs) {
  try {
    const now = Date.now();
    if (__rlBuckets.size > 5000) { for (const [k, v] of __rlBuckets) { if (v.resetAt <= now) __rlBuckets.delete(k); } }
    let ip = "unknown";
    try { const xff = String(req.headers["x-forwarded-for"] || ""); ip = xff ? xff.split(",")[0].trim() : String(req.headers["x-real-ip"] || (req.socket && req.socket.remoteAddress) || "unknown"); } catch (e) {}
    const key = name + ":" + ip;
    const b = __rlBuckets.get(key);
    if (!b || b.resetAt <= now) { __rlBuckets.set(key, { count: 1, resetAt: now + windowMs }); return { ok: true }; }
    if (b.count < limit) { b.count++; return { ok: true }; }
    return { ok: false, retryAfter: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  } catch (e) { return { ok: true }; }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  {
    const rl = __rateLimit(req, "image", 20, 3600000);
    if (!rl.ok) return res.status(429).json({ error: "Too many requests - try again shortly.", retryAfter: rl.retryAfter });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // No key yet — return a clear, friendly "not connected" signal the app can handle.
    return res.status(200).json({ notConnected: true });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const prompt = (body.prompt || "").toString().slice(0, 1000);
    if (!prompt.trim()) {
      return res.status(400).json({ error: "A prompt is required." });
    }

    // Allowlist the two tiers; default to the cheap one.
    const allowed = { "gpt-image-1-mini": 1, "gpt-image-1": 1 };
    const model = allowed[body.model] ? body.model : "gpt-image-1-mini";
    const size = ["1024x1024", "1024x1536", "1536x1024", "auto"].includes(body.size) ? body.size : "1024x1024";

    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey,
      },
      body: JSON.stringify({ model, prompt, size, n: 1 }),
    });

    const data = await response.json();
    if (data && data.error) {
      return res.status(200).json({ error: data.error.message || "Image generation failed." });
    }

    const first = (data.data && data.data[0]) || {};
    // Prefer b64 (permanent) over url (OpenAI image URLs EXPIRE ~1hr, breaking saved images).
    if (first.b64_json) return res.status(200).json({ b64: first.b64_json });
    if (first.url) return res.status(200).json({ url: first.url });
    return res.status(200).json({ error: "No image returned." });
  } catch (e) {
    return res.status(200).json({ error: "Image service error: " + (e && e.message ? e.message : String(e)) });
  }
}
