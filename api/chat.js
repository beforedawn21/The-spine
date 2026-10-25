// The Spine — server-side AI proxy.
// Runs on Vercel (not the browser), so your API key stays secret.
// Accepts either a single { system, user } (legacy) or a full
// { system, messages:[{role,content}] } conversation for multi-turn chat.

// THE MOST EXPENSIVE ENDPOINT HAD NO LIMITER.
// Every other paid route has one; this did not. Anyone, with no account, could loop
// this until the API key was exhausted. 30 calls a minute per address.
const RL = new Map();
function __rateLimit(ip, max, windowMs) {
  const now = Date.now();
  const hit = RL.get(ip);
  if (!hit || now > hit.reset) { RL.set(ip, { n: 1, reset: now + windowMs }); return true; }
  if (hit.n >= max) return false;
  hit.n++; return true;
}

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
  const __ip = (req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  if (!__rateLimit(__ip, 30, 60000)) {
    return res.status(429).json({ error: "Too many requests. Wait a minute." });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  {
    const __sg = await __spendGuard(req, "chat");
    req.__spineTier = __sg.tier;
    if (!__sg.ok) return res.status(429).json({ error: "You've reached today's limit for this. It refills within 24 hours.", limitReached: true, resetAt: __sg.resetAt || null });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(200).json({
      content: [
        {
          type: "text",
          text: "(Preview mode — no API key is set on the server yet. Add ANTHROPIC_API_KEY in your Vercel project settings to switch live answers on.)",
        },
      ],
    });
  }

  try {
    const body = req.body || {};
    const system = body.system || "";

    // Build the messages array. Prefer a full conversation if provided.
    let messages;
    if (Array.isArray(body.messages) && body.messages.length) {
      // sanitize: only role + string content
      let cleaned = body.messages
        .filter((m) => m && m.content != null && (Array.isArray(m.content) ? m.content.length : String(m.content).trim() !== ""))
        .map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          // Keep array content (image/document blocks for vision) intact; else coerce to string.
          content: Array.isArray(m.content) ? m.content : String(m.content),
        }));
      // The Anthropic API requires messages to START with a user turn and to strictly
      // ALTERNATE user/assistant. A history window can start on an assistant turn, and
      // intent-redirects/placeholders can put two same-role turns in a row - either of
      // which makes the API reject the WHOLE request (so the 2nd question fails while the
      // 1st worked). Enforce a valid sequence here so multi-turn chat never breaks.
      while (cleaned.length && cleaned[0].role !== "user") cleaned.shift();
      const alt = [];
      for (const m of cleaned) {
        if (alt.length && alt[alt.length - 1].role === m.role) {
          alt[alt.length - 1] = m; // collapse consecutive same-role: keep the latest
        } else {
          alt.push(m);
        }
      }
      messages = alt.length ? alt : [{ role: "user", content: String(body.user || "(no input)") }];
    } else {
      messages = [{ role: "user", content: String(body.user || "(no input)") }];
    }
    // INPUT IS BILLED TOO. Nothing limited how much a caller could send, so one request could
    // carry close to a million tokens of input. Text is capped by tier (images and documents
    // are bounded by the 4.5 MB request limit). The longest real Spine request - a world brief,
    // Core's instructions and a long conversation - sits well inside the signed-in cap.
    {
      const tier = req.__spineTier || "anon";
      const CAP = tier === "anon" ? 120000 : 400000;              // characters, roughly 30k / 100k tokens
      const textOf = (c) => Array.isArray(c) ? c.map(x => (x && typeof x.text === "string") ? x.text : "").join("") : String(c || "");
      const total = String(system).length + messages.reduce((n, m) => n + textOf(m.content).length, 0);
      if (total > CAP) {
        return res.status(413).json({ error: tier === "anon"
          ? "That's longer than a visitor can send. Make a free account for much more room."
          : "That's too long to send in one go - try a shorter message or a smaller file." });
      }
    }

    // Keep cost bounded: cap history length server-side too.
    if (messages.length > 24) messages = messages.slice(-24);

    // Model is chosen by the app (cheaper model for free users, better for signed-in).
    const allowed = { "claude-sonnet-4-6": 1, "claude-haiku-4-5-20251001": 1 };
    const model = allowed[body.model] ? body.model : "claude-sonnet-4-6";

    // Output length. Most calls (chat, briefs) are fine with a lean cap.
    // Game generation needs much more room (a full game is thousands of tokens),
    // so the app can request a higher limit. Clamp to a safe ceiling.
    let maxTokens = 1200;
    if (typeof body.maxTokens === "number" && body.maxTokens > 0) {
      maxTokens = Math.min(Math.max(body.maxTokens, 256), 8000);
    }

    // Prompt caching: the system prompt is the same on every call in a conversation, so tell
    // Anthropic to cache it. Cheaper and noticeably faster on the second message onward. Free.
    // Cache the STABLE half of the system prompt only. Anything after the volatile marker - the
    // current time, and what we remember about this person - changes on every call. Caching it
    // meant two things went wrong at once: the model could be served a stale clock, and the cache
    // key never matched, so caching silently did nothing. Split, it finally works.
    let systemBlocks = system;
    if (typeof system === "string") {
      const MARK = "<<<SPINE_VOLATILE>>>";
      const cut = system.indexOf(MARK);
      if (cut > 0) {
        const stable = system.slice(0, cut).trim();
        const volatilePart = system.slice(cut + MARK.length).trim();
        systemBlocks = [];
        if (stable) {
          systemBlocks.push(
            stable.length > 1000
              ? { type: "text", text: stable, cache_control: { type: "ephemeral" } }
              : { type: "text", text: stable }
          );
        }
        if (volatilePart) systemBlocks.push({ type: "text", text: volatilePart });
      } else if (system.length > 1000) {
        systemBlocks = [{ type: "text", text: system, cache_control: { type: "ephemeral" } }];
      }
    }

    // ══════════════════════════════════════════════════════════════════════════════════════
    //  THE CORE'S BACKUPS
    //  The model the app asked for answers first, exactly as before. Only if it cannot:
    //    1. the other Claude models - Sonnet 5.5 first (newer, and cheaper than Sonnet 4.6),
    //       then whichever of Sonnet 4.6 / Haiku 4.5 was not asked for;
    //    2. if Anthropic as a whole cannot answer (down, out of credit, key refused):
    //       OpenAI GPT-6.1 Sol, then Google Gemini Flash, then Groq - whichever keys exist.
    //  A busy signal (429/529) or a network blip is retried once on the same model first. A
    //  model name Anthropic has retired moves straight to the next one, so a retirement can
    //  never silence the Core. Every backup gets the same instructions and conversation.
    // ══════════════════════════════════════════════════════════════════════════════════════
    const started = Date.now();
    const BUDGET = 165000;                                   // the function has 180s
    const left = (cap) => Math.max(0, Math.min(cap, BUDGET - (Date.now() - started)));
    const CLAUDE_LADDER = (model === "claude-haiku-4-5-20251001"
      ? [model, "claude-sonnet-5-5", "claude-sonnet-4-6"]
      : [model, "claude-sonnet-5-5", "claude-haiku-4-5-20251001"]).filter((m, k, a) => a.indexOf(m) === k);
    const TRANSIENT = { 429: 1, 500: 1, 502: 1, 503: 1, 504: 1, 529: 1 };
    const plainSystem = typeof system === "string" ? system.replace("<<<SPINE_VOLATILE>>>", "\n") : String(system || "");
    const textOf = (c) => Array.isArray(c) ? c.map(b => (b && b.type === "text") ? b.text : "").join("\n") : String(c || "");
    const firstErr = { data: null, status: 0 };

    async function claude(mdl, ms) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", signal: AbortSignal.timeout(ms),
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: mdl, max_tokens: maxTokens, system: systemBlocks, messages }),
      });
      let data = null; try { data = await r.json(); } catch (e) {}
      return { r, data };
    }
    // Returns {answer} | {stopAnthropic:true} | {next:true}
    async function tryClaudeLadder() {
      for (let k = 0; k < CLAUDE_LADDER.length; k++) {
        const mdl = CLAUDE_LADDER[k];
        for (let attempt = 0; attempt < 2; attempt++) {
          const ms = left(120000); if (ms < 8000) return { stopAnthropic: true };
          let got;
          try { got = await claude(mdl, ms); }
          catch (e) { if (attempt === 0) { await new Promise(z => setTimeout(z, 500)); continue; } break; }
          const { r, data } = got;
          if (r.ok && data && !data.error) return { answer: data, model: mdl };
          if (!firstErr.data) { firstErr.data = data; firstErr.status = r.status; }
          const said = JSON.stringify((data && data.error) || data || "").toLowerCase();
          if (r.status === 401 || r.status === 403 || /credit balance|billing|insufficient|permission/.test(said)) return { stopAnthropic: true };
          if (TRANSIENT[r.status] && attempt === 0) { await new Promise(z => setTimeout(z, 600)); continue; }
          break;                                             // retired name, bad request or still busy: next model
        }
      }
      return { stopAnthropic: true };
    }
    // The same conversation, in each other provider's words. Pictures go along where they can.
    const imgs = (m) => Array.isArray(m.content) ? m.content.filter(b => b && b.type === "image" && b.source && b.source.data) : [];
    async function openai() {
      const key = process.env.OPENAI_API_KEY; if (!key) return null;
      const oaMsgs = [{ role: "system", content: plainSystem }].concat(messages.map((m) => ({
        role: m.role,
        content: Array.isArray(m.content)
          ? [{ type: "text", text: textOf(m.content) || " " }].concat(imgs(m).map(b => ({ type: "image_url", image_url: { url: "data:" + (b.source.media_type || "image/jpeg") + ";base64," + b.source.data } })))
          : String(m.content),
      })));
      for (const mdl of ["gpt-6.1-sol", "gpt-4o"]) {
        const ms = left(110000); if (ms < 8000) return null;
        try {
          const r = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST", signal: AbortSignal.timeout(ms),
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
            body: JSON.stringify({ model: mdl, max_tokens: maxTokens, messages: oaMsgs }),
          });
          const d = await r.json().catch(() => null);
          const txt = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
          if (r.ok && txt) return { text: txt, by: "openai " + mdl };
          if (r.status === 401 || r.status === 429) return null;
        } catch (e) { /* next */ }
      }
      return null;
    }
    async function gemini() {
      const key = process.env.GEMINI_API_KEY; if (!key) return null;
      const contents = messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: textOf(m.content) || " " }].concat(imgs(m).map(b => ({ inline_data: { mime_type: b.source.media_type || "image/jpeg", data: b.source.data } }))),
      }));
      for (const mdl of ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-flash-latest"]) {
        const ms = left(90000); if (ms < 8000) return null;
        try {
          const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + mdl + ":generateContent", {
            method: "POST", signal: AbortSignal.timeout(ms),
            headers: { "Content-Type": "application/json", "x-goog-api-key": key },
            body: JSON.stringify({ contents, systemInstruction: { parts: [{ text: plainSystem }] }, generationConfig: { maxOutputTokens: maxTokens } }),
          });
          if (r.status === 404) continue;
          const d = await r.json().catch(() => null);
          const txt = d && d.candidates && d.candidates[0] && d.candidates[0].content && (d.candidates[0].content.parts || []).map(x => x.text || "").join("").trim();
          if (r.ok && txt) return { text: txt, by: "gemini " + mdl };
          return null;
        } catch (e) { return null; }
      }
      return null;
    }
    async function groq() {
      const key = process.env.GROQ_API_KEY; if (!key) return null;
      if (messages.some(m => imgs(m).length)) return null;      // it cannot see pictures
      const ms = left(60000); if (ms < 8000) return null;
      try {
        const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST", signal: AbortSignal.timeout(ms),
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
          body: JSON.stringify({ model: "llama-3.3-70b-versatile", max_tokens: Math.min(maxTokens, 8000),
            messages: [{ role: "system", content: plainSystem }].concat(messages.map(m => ({ role: m.role, content: textOf(m.content) || " " }))) }),
        });
        const d = await r.json().catch(() => null);
        const txt = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
        return r.ok && txt ? { text: txt, by: "groq llama-3.3-70b" } : null;
      } catch (e) { return null; }
    }
    async function answerWithBackups() {
      const c = await tryClaudeLadder();
      if (c.answer) return { data: c.answer, by: c.model };
      for (const other of [openai, gemini, groq]) {
        const o = await other();
        if (o) return { data: { content: [{ type: "text", text: o.text }] }, by: o.by };
      }
      return null;
    }

    // STREAMING: when the app asks for it, pipe Anthropic's server-sent events straight back so
    // words appear as they're written instead of after the whole answer finishes.
    if (body.stream === true) {
      let upstream = null;
      try {
        upstream = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST", signal: AbortSignal.timeout(60000),
          headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model, max_tokens: maxTokens, system: systemBlocks, messages, stream: true }),
        });
      } catch (e) { upstream = null; }
      if (!upstream || !upstream.ok || !upstream.body) {
        // Streaming could not start. Rather than handing the person an error, the answer comes
        // from the backups in one piece - no typing effect, but an answer.
        const errText = upstream ? await upstream.text().catch(() => "") : "unreachable";
        const got = await answerWithBackups().catch(() => null);
        const txt = got && (got.data.content || []).map(b => b.type === "text" ? b.text : "").join("").trim();
        if (txt) {
          res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache, no-transform");
          res.setHeader("X-Spine-Served-By", got.by);
          res.write("data: " + JSON.stringify({ type: "content_block_delta", delta: { text: txt } }) + "\n\n");
          res.write("data: [DONE]\n\n");
          res.end();
          return;
        }
        res.status(200).json({ error: { message: "stream_failed", detail: errText.slice(0, 200), retry: true } });
        return;
      }
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      const reader = upstream.body.getReader();
      const dec = new TextDecoder();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(dec.decode(value, { stream: true }));
        }
      } catch (e) {
        // fall through - whatever arrived already is kept
      }
      res.end();
      return;
    }

    const got = await answerWithBackups();
    if (got) {
      if (got.by !== model) res.setHeader("X-Spine-Served-By", got.by);
      return res.status(200).json(got.data);
    }
    if (firstErr.data) return res.status(200).json(firstErr.data);
    return res.status(200).json({ error: { message: "reasoning_unreachable", detail: "every engine failed", retry: true } });
  } catch (err) {
    return res.status(200).json({
      content: [
        {
          type: "text",
          text: "(The model couldn't be reached just now. Please try again.)",
        },
      ],
    });
  }
}
