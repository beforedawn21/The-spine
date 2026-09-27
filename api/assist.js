// ============================================================================
//  ASSIST  —  the free tiers, wired so they switch on when a key appears
//
//  Every one of these is free and needs no card. None of them is required: if a
//  key is absent the endpoint says so plainly and the caller carries on without
//  it, exactly like every other optional engine here.
//
//    GROQ_API_KEY         groq.com          fast answers - game characters
//    CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN   10,000 requests a day
//    RESEND_API_KEY       resend.com        3,000 emails a month
//    POLY_PIZZA_KEY       poly.pizza        10,400 CC0 models
// ============================================================================

const RL = new Map();
function __rateLimit(ip, max, windowMs) {
  const now = Date.now();
  const hit = RL.get(ip);
  if (!hit || now > hit.reset) { RL.set(ip, { n: 1, reset: now + windowMs }); return true; }
  if (hit.n >= max) return false;
  hit.n++; return true;
}
const off = (what, where) =>
  ({ error: what + " isn't connected. Add " + where + " in Vercel to switch it on.", missingKey: true });

export default async function handler(req, res) {
  const ip = (req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  if (!__rateLimit(ip, 60, 60_000)) {
    return res.status(429).json({ error: "Too many requests. Wait a minute." });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const body = req.body || {};
  const what = String(body.what || "");

  try {
    // ── FAST ANSWERS. A chat model takes seconds; a game character has milliseconds.
    if (what === "fast") {
      const key = process.env.GROQ_API_KEY;
      if (!key) return res.status(200).json(off("Fast answers", "GROQ_API_KEY"));
      const prompt = String(body.prompt || "").slice(0, 2000);
      if (!prompt) return res.status(400).json({ error: "Nothing to answer." });
      const c = new AbortController(); const t = setTimeout(() => c.abort(), 12000);
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", signal: c.signal,
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify({
          model: body.model || "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: prompt }],
          max_tokens: Math.min(400, body.maxTokens || 160), temperature: 0.8,
        }),
      }).catch(() => null);
      clearTimeout(t);
      if (!r || !r.ok) return res.status(200).json({ error: "The fast engine didn't answer." });
      const j = await r.json();
      return res.status(200).json({ text: (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "" });
    }

    // ── TRANSLATION. Core has a language directive and no translator behind it.
    if (what === "translate") {
      const acct = process.env.CLOUDFLARE_ACCOUNT_ID, tok = process.env.CLOUDFLARE_API_TOKEN;
      if (!acct || !tok) return res.status(200).json(off("Translation", "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN"));
      const text = String(body.text || "").slice(0, 4000);
      if (!text) return res.status(400).json({ error: "Nothing to translate." });
      const r = await fetch("https://api.cloudflare.com/client/v4/accounts/" + acct + "/ai/run/@cf/meta/m2m100-1.2b", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok },
        body: JSON.stringify({ text, source_lang: body.from || "english", target_lang: body.to || "spanish" }),
      }).catch(() => null);
      if (!r || !r.ok) return res.status(200).json({ error: "Translation didn't come back." });
      const j = await r.json();
      return res.status(200).json({ text: (j.result && j.result.translated_text) || "" });
    }

    // ── EMAIL. A contact form that goes nowhere is worse than no form.
    if (what === "email") {
      const key = process.env.RESEND_API_KEY;
      if (!key) return res.status(200).json(off("Email", "RESEND_API_KEY"));
      const to = String(body.to || "").slice(0, 120);
      const subject = String(body.subject || "From your Spine site").slice(0, 160);
      const text = String(body.text || "").slice(0, 8000);
      if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return res.status(400).json({ error: "That isn't an email address." });
      if (!text) return res.status(400).json({ error: "Nothing to send." });
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify({ from: process.env.RESEND_FROM || "The Spine <onboarding@resend.dev>", to: [to], subject, text }),
      }).catch(() => null);
      if (!r || !r.ok) return res.status(200).json({ error: "The email didn't send." });
      return res.status(200).json({ ok: true });
    }

    // ── MODELS. Poly Haven is keyless but small; Poly Pizza has 10,400 CC0 models.
    if (what === "findmodel") {
      const key = process.env.POLY_PIZZA_KEY;
      if (!key) return res.status(200).json(off("The big model library", "POLY_PIZZA_KEY"));
      const q = String(body.q || "").slice(0, 80);
      if (!q) return res.status(400).json({ error: "Nothing to look for." });
      const r = await fetch("https://api.poly.pizza/v1.1/search/" + encodeURIComponent(q) + "?limit=3", {
        headers: { "x-auth-token": key },
      }).catch(() => null);
      if (!r || !r.ok) return res.status(200).json({ error: "The model library didn't answer." });
      const j = await r.json();
      const first = (j.results || j.items || [])[0];
      if (!first) return res.status(200).json({ error: "Nothing matched." });
      return res.status(200).json({
        url: first.Download || first.download || first.url || null,
        name: first.Title || first.title || q,
        credit: (first.Creator && (first.Creator.Username || first.Creator.username)) || "Poly Pizza",
        licence: first.Licence || first.license || "CC0",
      });
    }

    return res.status(400).json({ error: "Unknown request." });
  } catch (e) {
    return res.status(500).json({ error: "Something went wrong." });
  }
}
