// ════════════════════════════════════════════════════════════════
// Simple per-IP rate limiter for the API proxy routes.
//
// Purpose: stop someone who finds an endpoint (e.g. /api/image) from scripting
// it to drain your API budget. Limits are set well ABOVE normal human pace, so
// real users are never affected.
//
// Honest limitation: this is in-memory. Vercel runs multiple serverless
// instances and recycles them, so the counter isn't shared across every
// instance and resets on cold starts. That makes this a strong SPEED BUMP that
// stops casual hammering and simple scripts — not an absolute wall. For a hard,
// shared limit at scale, upgrade to Upstash Redis / Vercel KV later. This needs
// zero setup and meaningfully reduces the budget-drain risk today.
//
// Fail-OPEN by design: if anything in the limiter throws, the request is
// ALLOWED. Budget protection must never cause an app outage.
// ════════════════════════════════════════════════════════════════

const buckets = new Map(); // key -> { count, resetAt }
let lastSweep = 0;

function clientIp(req) {
  try {
    const xff = (req.headers["x-forwarded-for"] || "").toString();
    if (xff) return xff.split(",")[0].trim();
    return (req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown").toString();
  } catch (e) {
    return "unknown";
  }
}

// Returns { ok: true } or { ok: false, retryAfter: <seconds> }.
export function rateLimit(req, name, limit, windowMs) {
  try {
    const now = Date.now();

    // Occasionally sweep expired buckets so the Map can't grow forever.
    if (now - lastSweep > 60000) {
      lastSweep = now;
      for (const [k, v] of buckets) {
        if (v.resetAt <= now) buckets.delete(k);
      }
    }

    const key = name + ":" + clientIp(req);
    const b = buckets.get(key);
    if (!b || b.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { ok: true };
    }
    if (b.count < limit) {
      b.count++;
      return { ok: true };
    }
    return { ok: false, retryAfter: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  } catch (e) {
    // Fail open — never block a request because the limiter itself errored.
    return { ok: true };
  }
}
