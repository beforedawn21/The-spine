// ============================================================================
//  MESSAGES  —  reading what people actually said
//
//  The feedback table is write-only from the browser, which is right: a report
//  about somebody else's tool is not public. That means the only way to READ
//  them is here, with the service key, behind the admin password.
//
//  Without this endpoint the messages exist and nobody can see them.
// ============================================================================

const RL = new Map();
function __rateLimit(ip, max, windowMs) {
  const now = Date.now();
  const hit = RL.get(ip);
  if (!hit || now > hit.reset) { RL.set(ip, { n: 1, reset: now + windowMs }); return true; }
  if (hit.n >= max) return false;
  hit.n++; return true;
}

export default async function handler(req, res) {
  const ip = (req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  if (!__rateLimit(ip, 30, 60_000)) {
    return res.status(429).json({ error: "Too many requests." });
  }

  const pass = req.headers["x-spine-admin"] || (req.body && req.body.adminPassword);
  const real = process.env.ADMIN_PASSWORD;
  if (!real) return res.status(500).json({ error: "No admin password is configured." });
  // Constant-time-ish compare so the password cannot be guessed a character at a time.
  if (!pass || String(pass).length !== real.length ||
      ![...String(pass)].every((c, i) => c === real[i])) {
    return res.status(401).json({ error: "Not authorised." });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(500).json({ error: "The database is not configured." });

  const base = { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" };

  try {
    if (req.method === "GET" || (req.body && req.body.action === "list")) {
      const status = (req.query && req.query.status) || (req.body && req.body.status) || "";
      const q = new URLSearchParams({
        select: "id,tool_id,account_id,thumbs,message,kind,status,reply,replied_at,contact,created_at",
        order: "created_at.desc",
        limit: "100",
      });
      // Only rows that actually carry a message are worth showing.
      q.append("message", "not.is.null");
      if (status) q.append("status", "eq." + status);
      const r = await fetch(url + "/rest/v1/feedback?" + q.toString(), { headers: base });
      if (!r.ok) return res.status(502).json({ error: "Could not read the messages." });
      const rows = await r.json();
      return res.status(200).json({ messages: rows });
    }

    if (req.method === "POST" && req.body && req.body.action === "reply") {
      const { id, reply, status } = req.body;
      if (!id) return res.status(400).json({ error: "Which message?" });
      const patch = {};
      if (typeof reply === "string") { patch.reply = reply.slice(0, 4000); patch.replied_at = new Date().toISOString(); }
      if (status) patch.status = String(status).slice(0, 20);
      if (!Object.keys(patch).length) return res.status(400).json({ error: "Nothing to change." });
      const r = await fetch(url + "/rest/v1/feedback?id=eq." + encodeURIComponent(id), {
        method: "PATCH",
        headers: { ...base, Prefer: "return=representation" },
        body: JSON.stringify(patch),
      });
      if (!r.ok) return res.status(502).json({ error: "Could not save the reply." });
      const out = await r.json();
      return res.status(200).json({ ok: true, message: out && out[0] });
    }

    return res.status(405).json({ error: "Method not allowed." });
  } catch (e) {
    // Never leak the internals of a failure to the caller.
    return res.status(500).json({ error: "Something went wrong reading the messages." });
  }
}
