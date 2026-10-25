// ============================================================================
//  ASSIST  —  the free tiers, wired so they switch on when a key appears
//
//  Every one of these is free and needs no card. None of them is required: if a
//  key is absent the endpoint says so plainly and the caller carries on without
//  it, exactly like every other optional engine here.
//
//    GROQ_API_KEY         groq.com          fast answers - game characters
//    CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN   10,000 neurons a day - translation, and the
//                         backup for fast answers, voice, transcription, images and key frames
//    GEMINI_API_KEY       Google AI Studio  third brain for fast answers and translation
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

// ── SPEND GUARD (self-contained, like the rate limiter above) ───────────────────────────────
// The daily allowances lived only in /api/usage, which the APP chose to call first - so anyone
// calling this endpoint directly skipped them and spent on your account without limit. This
// endpoint now counts for itself, in the same race-proof database counter. The person is known
// only from their session token (never from an id they claim); without one, by their address.
// Ceilings are about twice each in-app allowance, so a real person always meets the friendly
// in-app limit first. Checking progress never counts. If the database cannot be reached it
// lets the request through, exactly as the rest of the system does.
const __SG_CAPS = {
  chat:       { anon: 30, acct: 600, pro: 1800 },
  image:      { anon: 6,  acct: 50,  pro: 150 },
  video:      { anon: 2,  acct: 12,  pro: 36 },
  music:      { anon: 2,  acct: 16,  pro: 48 },
  dub:        { anon: 4,  acct: 40,  pro: 120 },
  audiofx:    { anon: 4,  acct: 40,  pro: 120 },
  transcribe: { anon: 10, acct: 100, pro: 300 },
  search:     { anon: 20, acct: 200, pro: 600 },
  readurl:    { anon: 20, acct: 200, pro: 600 },
  assist:     { anon: 30, acct: 300, pro: 900 },
};
// New sb_secret_ keys go in apikey alone; legacy JWT keys in both headers. Right under either rule.
function __sgHeaders(k) { return /^eyJ/.test(k) ? { apikey: k, Authorization: "Bearer " + k } : { apikey: k }; }
async function __spendGuard(req, kind) {
  try {
    const url = String(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return { ok: true, tier: "anon" };
    let b = req.body; if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } } b = b || {};
    const act = String(b.action || b.op || "").toLowerCase();
    if (act === "poll" || act === "status" || act === "check") return { ok: true, tier: "anon" };
    const H = { ...__sgHeaders(key), "Content-Type": "application/json" };
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 4000);
    const rpc = async (fn, args) => {
      const r = await fetch(url + "/rest/v1/rpc/" + fn, { method: "POST", headers: H, body: JSON.stringify(args), signal: ctl.signal });
      if (!r.ok) throw new Error(fn + " " + r.status); return r.json();
    };
    const tok = String(req.headers["x-spine-session"] || "");
    let who = null, tier = "anon";
    if (/^[0-9a-f]{64}$/.test(tok)) {
      who = await rpc("spine_whoami", { p_token: tok });
      if (who) {
        tier = "acct";
        const r = await fetch(url + "/rest/v1/accounts?select=pro_until&id=eq." + encodeURIComponent(who), { headers: H, signal: ctl.signal });
        const a = r.ok ? (await r.json())[0] : null;
        if (a && a.pro_until && new Date(a.pro_until) > new Date()) tier = "pro";
      }
    }
    let ip = "";
    try { ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || String(req.headers["x-real-ip"] || ""); } catch (e) {}
    if (!who && !ip) { clearTimeout(timer); return { ok: true, tier }; }
    const cap = (__SG_CAPS[kind] || __SG_CAPS.chat)[tier];
    const rows = await rpc("usage_bump", { p_subject: who ? "acct:" + who : "ip:" + ip, p_kind: "srv:" + kind, p_lim: cap, p_win_hours: 24 });
    clearTimeout(timer);
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (row && row.allowed === false) return { ok: false, tier, resetAt: row.reset_at };
    return { ok: true, tier };
  } catch (e) { return { ok: true, tier: "anon" }; }
}

export default async function handler(req, res) {
  const ip = (req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  if (!__rateLimit(ip, 60, 60_000)) {
    return res.status(429).json({ error: "Too many requests. Wait a minute." });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  {
    const __sg = await __spendGuard(req, "assist");
    req.__spineTier = __sg.tier;
    if (!__sg.ok) return res.status(429).json({ error: "You've reached today's limit for this. It refills within 24 hours.", limitReached: true, resetAt: __sg.resetAt || null });
  }

  const body = req.body || {};
  const what = String(body.what || "");

  // THREE BRAINS FOR THE SMALL JOBS. Fast answers and translation each had one engine; if it
  // was down, the leg asking got nothing. Now each walks Groq, Cloudflare and Gemini in turn,
  // whichever are connected, and answers from the first that replies.
  const cfAcct = process.env.CLOUDFLARE_ACCOUNT_ID, cfTok = process.env.CLOUDFLARE_API_TOKEN;
  const groqKey = process.env.GROQ_API_KEY, geminiKey = process.env.GEMINI_API_KEY;
  async function groqText(prompt, maxTokens, temp, model) {
    if (!groqKey) return "";
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", signal: AbortSignal.timeout(12000),
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + groqKey },
        body: JSON.stringify({ model: model || "llama-3.3-70b-versatile", messages: [{ role: "user", content: prompt }], max_tokens: maxTokens, temperature: temp }),
      });
      if (!r.ok) return "";
      const j = await r.json();
      return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
    } catch (e) { return ""; }
  }
  async function cfText(prompt, maxTokens, temp) {
    if (!cfAcct || !cfTok) return "";
    try {
      const r = await fetch("https://api.cloudflare.com/client/v4/accounts/" + cfAcct + "/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
        method: "POST", signal: AbortSignal.timeout(12000),
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + cfTok },
        body: JSON.stringify({ messages: [{ role: "user", content: prompt }], max_tokens: maxTokens, temperature: temp }),
      });
      if (!r.ok) return "";
      const j = await r.json();
      const out = j && j.result && j.result.response;
      return typeof out === "string" ? out : "";
    } catch (e) { return ""; }
  }
  async function geminiText(prompt, maxTokens, temp) {
    if (!geminiKey) return "";
    for (const model of ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-flash-latest"]) {
      try {
        const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
          method: "POST", signal: AbortSignal.timeout(12000),
          headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: maxTokens, temperature: temp } }),
        });
        if (r.status === 404) continue;
        if (!r.ok) return "";
        const j = await r.json();
        const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
        return parts.map((x) => x.text || "").join("").trim();
      } catch (e) { return ""; }
    }
    return "";
  }
  async function anyText(prompt, maxTokens, temp, model) {
    return (await groqText(prompt, maxTokens, temp, model)) || (await cfText(prompt, maxTokens, temp)) || (await geminiText(prompt, maxTokens, temp));
  }
  const anyBrain = !!(groqKey || (cfAcct && cfTok) || geminiKey);

  try {
    // ── FAST ANSWERS. A chat model takes seconds; a game character has milliseconds.
    if (what === "fast") {
      if (!anyBrain) return res.status(200).json(off("Fast answers", "GROQ_API_KEY"));
      const prompt = String(body.prompt || "").slice(0, 2000);
      if (!prompt) return res.status(400).json({ error: "Nothing to answer." });
      const max = Math.min(400, body.maxTokens || 160);
      const model = /^[a-z0-9._\/-]{3,60}$/i.test(String(body.model || "")) ? String(body.model) : "";
      const text = await anyText(prompt, max, 0.8, model);
      if (!text) return res.status(200).json({ error: "The fast engine didn't answer." });
      return res.status(200).json({ text });
    }

    // ── TRANSLATION. Core has a language directive and no translator behind it.
    if (what === "translate") {
      if (!(cfAcct && cfTok) && !anyBrain) return res.status(200).json(off("Translation", "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN"));
      const text = String(body.text || "").slice(0, 4000);
      if (!text) return res.status(400).json({ error: "Nothing to translate." });
      const from = String(body.from || "english").slice(0, 40), to = String(body.to || "spanish").slice(0, 40);
      if (cfAcct && cfTok) {
        try {
          const r = await fetch("https://api.cloudflare.com/client/v4/accounts/" + cfAcct + "/ai/run/@cf/meta/m2m100-1.2b", {
            method: "POST", signal: AbortSignal.timeout(15000),
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + cfTok },
            body: JSON.stringify({ text, source_lang: from, target_lang: to }),
          });
          if (r.ok) {
            const j = await r.json();
            const out = j.result && j.result.translated_text;
            if (out) return res.status(200).json({ text: out });
          }
        } catch (e) { /* the language models below can translate too */ }
      }
      const out = await anyText("Translate the text between the markers from " + from + " to " + to + ". Reply with the translation only - no notes, no quotation marks.\n<<<\n" + text + "\n>>>", 1200, 0.2);
      if (!out) return res.status(200).json({ error: "Translation didn't come back." });
      return res.status(200).json({ text: out.replace(/^<<<\s*|\s*>>>$/g, "").trim() });
    }

    // ── EMAIL. A contact form that goes nowhere is worse than no form.
    if (what === "email") {
      // Email goes out from your own domain, so only a signed-in person may send it - never a
      // visitor, and never a stranger's Market tool running on someone else's phone.
      if ((req.__spineTier || "anon") === "anon") return res.status(403).json({ error: "Sign in to send email." });
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

    // ── MODELS. Poly Pizza has 10,400 CC0 models behind a free key; Poly Haven has fewer, keyless,
    // museum-grade ones. Either can answer, so a leg asking for "a lantern" is never left empty.
    if (what === "findmodel") {
      const key = process.env.POLY_PIZZA_KEY;
      const q = String(body.q || "").slice(0, 80);
      if (!q) return res.status(400).json({ error: "Nothing to look for." });
      if (key) {
        try {
          const r = await fetch("https://api.poly.pizza/v1.1/search/" + encodeURIComponent(q) + "?limit=3", {
            headers: { "x-auth-token": key }, signal: AbortSignal.timeout(10000),
          });
          if (r.ok) {
            const j = await r.json();
            const first = (j.results || j.items || [])[0];
            const url = first && (first.Download || first.download || first.url);
            if (url) return res.status(200).json({
              url, name: first.Title || first.title || q,
              credit: (first.Creator && (first.Creator.Username || first.Creator.username)) || "Poly Pizza",
              licence: first.Licence || first.license || "CC0",
            });
          }
        } catch (e) { /* Poly Haven below */ }
      }
      try {
        const r = await fetch("https://api.polyhaven.com/assets?t=models", { signal: AbortSignal.timeout(10000), headers: { "User-Agent": "TheSpine/1.0" } });
        const all = r.ok ? await r.json() : {};
        const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
        let best = null, bestScore = 0;
        for (const id of Object.keys(all || {})) {
          const a = all[id] || {};
          const hay = ((a.name || "") + " " + (a.tags || []).join(" ") + " " + (a.categories || []).join(" ") + " " + id).toLowerCase();
          let sc = 0; words.forEach((w) => { if (hay.indexOf(w) >= 0) sc++; });
          if (sc > bestScore) { bestScore = sc; best = id; }
        }
        if (best) {
          const f = await fetch("https://api.polyhaven.com/files/" + best, { signal: AbortSignal.timeout(10000), headers: { "User-Agent": "TheSpine/1.0" } });
          const files = f.ok ? await f.json() : null;
          const g = files && (files.gltf || files.glTF);
          const res1 = g && (g["1k"] || g["2k"] || Object.values(g)[0]);
          const url = res1 && ((res1.gltf && res1.gltf.url) || (Object.values(res1)[0] && Object.values(res1)[0].url));
          if (url) return res.status(200).json({ url, name: (all[best] && all[best].name) || best, credit: "Poly Haven", licence: "CC0" });
        }
      } catch (e) { /* nothing matched */ }
      if (!key) return res.status(200).json(off("The big model library", "POLY_PIZZA_KEY"));
      return res.status(200).json({ error: "Nothing matched." });
    }

    return res.status(400).json({ error: "Unknown request." });
  } catch (e) {
    return res.status(500).json({ error: "Something went wrong." });
  }
}
