// ============================================================================
//  /api/email — how The Spine delivers something on its own
// ============================================================================
//  Everything here has always needed the person to be holding the phone. A
//  bedtime story that arrives at seven, a weekly summary, a reminder that turns
//  up without being asked - none of it can exist without a way to send.
//  Resend gives 3,000 emails a month free, which is far more than we need.
//
//  DORMANT until RESEND_API_KEY is set in Vercel. With no key it returns
//  { notConnected: true } and nothing anywhere breaks.
//
//  DELIBERATELY NARROW. This route can only send to the address on a real
//  account in the database, never to an arbitrary address a caller supplies.
//  An open send endpoint is a spam relay, and ours would be sending from your
//  domain. So: accountId in, we look the address up ourselves.
//
//  Accepts { accountId, subject, text, html?, password? }
//  Returns { sent: true, id } | { notConnected: true } | { error }
// ============================================================================

import { createClient } from "@supabase/supabase-js";

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

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  {
    // Tight on purpose. Nobody legitimately sends themselves more than a few
    // emails an hour, and a loose limit here is a spam problem wearing your name.
    const rl = __rateLimit(req, "email", 12, 3600000);
    if (!rl.ok) return res.status(429).json({ error: "Too many emails - try again shortly.", retryAfter: rl.retryAfter });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) return res.status(200).json({ notConnected: true });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const accountId = String(body.accountId || "").trim();
    const subject = String(body.subject || "").slice(0, 200).trim();
    const text = String(body.text || "").slice(0, 60000);

    if (!accountId) return res.status(200).json({ error: "No account to send to." });
    if (!subject) return res.status(200).json({ error: "An email needs a subject." });
    if (!text.trim()) return res.status(200).json({ error: "Nothing to send." });

    // Look the address up ourselves. A caller never gets to name a recipient.
    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) return res.status(200).json({ error: "Accounts are not connected." });

    const sb = createClient(url, key);
    const { data: account } = await sb
      .from("accounts")
      .select("email, username")
      .eq("id", accountId)
      .maybeSingle();

    const to = account && account.email ? String(account.email).trim() : "";
    if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      return res.status(200).json({ error: "That account has no usable email address." });
    }

    const name = (account && account.username) ? String(account.username) : "";
    const html = typeof body.html === "string" && body.html.trim()
      ? body.html
      : '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#100F0D;max-width:600px;margin:0 auto;padding:28px 22px;">'
        + (name ? '<p style="margin:0 0 18px;color:#4E4944;">Hello ' + escapeHtml(name) + ',</p>' : '')
        + '<div style="white-space:pre-wrap;">' + escapeHtml(text) + '</div>'
        + '<p style="margin:26px 0 0;padding-top:16px;border-top:1px solid #E8E2D9;font-size:12px;color:#908880;">Sent by The Spine.</p>'
        + '</div>';

    const TRANSIENT = { 429: 1, 500: 1, 502: 1, 503: 1, 504: 1 };
    let response = null, lastErr = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
          body: JSON.stringify({ from, to: [to], subject, text, html }),
        });
        if (response.ok) break;
        if (!TRANSIENT[response.status]) break;
        lastErr = "upstream " + response.status;
      } catch (e) {
        lastErr = (e && e.message) || "network";
        response = null;
      }
      if (attempt < 2) await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
    if (!response) return res.status(200).json({ error: "Could not reach the mail service: " + lastErr, retry: true });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || (data && data.error)) {
      const msg = (data && data.error && (data.error.message || data.error)) || ("status " + response.status);
      return res.status(200).json({ error: "Email failed: " + String(msg).slice(0, 200) });
    }
    return res.status(200).json({ sent: true, id: (data && data.id) || null });
  } catch (e) {
    return res.status(200).json({ error: "Email failed: " + String((e && e.message) || e).slice(0, 200) });
  }
}
