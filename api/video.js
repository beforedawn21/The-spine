import { createHmac } from "node:crypto";
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
// Runway's developer API lives on api.dev.runwayml.com. This file called api.runwayml.com - the
// consumer site - so every Runway request went to the wrong host and could never return a task.
const RUNWAY_BASE = "https://api.dev.runwayml.com";
const RUNWAY_VERSION = "2024-11-06";

// KLING SIGNS ITS OWN REQUESTS. Kling's developer API authenticates with a short-lived token
// signed from an Access Key and a Secret Key (HS256), not with the raw key. Accepted, in order:
//   KLING_ACCESS_KEY + KLING_SECRET_KEY            - signed here, fresh for every request
//   KLING_API_KEY written as  AccessKey:SecretKey  - the same, in one variable
//   KLING_API_KEY on its own                       - sent as-is, for keys issued that way
const __b64u = (b) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
function klingAuth() {
  let ak = process.env.KLING_ACCESS_KEY || "", sk = process.env.KLING_SECRET_KEY || "";
  const one = String(process.env.KLING_API_KEY || "");
  if ((!ak || !sk) && /^[^:\s]+:[^:\s]+$/.test(one)) { ak = one.split(":")[0]; sk = one.split(":")[1]; }
  if (ak && sk) {
    const now = Math.floor(Date.now() / 1000);
    const head = __b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const body = __b64u(JSON.stringify({ iss: ak, exp: now + 1800, nbf: now - 5 }));
    const sig = createHmac("sha256", sk).update(head + "." + body).digest("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
    return "Bearer " + head + "." + body + "." + sig;
  }
  return one ? "Bearer " + one : "";
}
// Ratios each engine actually accepts. The app speaks 16:9 / 9:16 / 1:1.
const RW_I2V_RATIO = { "16:9": "1280:720", "9:16": "720:1280", "1:1": "960:960" };
const RW_T2V_RATIO = { "16:9": "1280:720", "9:16": "720:1280", "1:1": "1280:720" };

// ── Budget guard (self-contained, no import - an endpoint must never fail to load because a
//    helper file is missing). Ceilings sit far above human pace and it fails open, so a real
//    person is never blocked by it.
const __rlBuckets = globalThis.__spineRlBuckets || (globalThis.__spineRlBuckets = new Map());
function __rateLimit(req, name, limit, windowMs) {
  try {
    const now = Date.now();
    if (__rlBuckets.size > 5000) { for (const [k, v] of __rlBuckets) { if (v.resetAt <= now) __rlBuckets.delete(k); } }
    let ip = "";
    try { const xff = String(req.headers["x-forwarded-for"] || ""); ip = xff ? xff.split(",")[0].trim() : String(req.headers["x-real-ip"] || (req.socket && req.socket.remoteAddress) || ""); } catch (e) {}
    // If we cannot tell requests apart, DO NOT put everyone in one bucket - that turns a
    // safety measure into a site-wide outage. No identifiable caller means no limit.
    if (!ip || ip === "unknown") return { ok: true };
    const key = name + ":" + ip;
    const b = __rlBuckets.get(key);
    if (!b || b.resetAt <= now) { __rlBuckets.set(key, { count: 1, resetAt: now + windowMs }); return { ok: true }; }
    if (b.count < limit) { b.count++; return { ok: true }; }
    return { ok: false, retryAfter: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  } catch (e) { return { ok: true }; }
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
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  {
    const rl = __rateLimit(req, "video", 8, 3600000);
    if (!rl.ok) return res.status(429).json({ error: "Too many requests - try again shortly.", retryAfter: rl.retryAfter });
  }
  {
    const __sg = await __spendGuard(req, "video");
    req.__spineTier = __sg.tier;
    if (!__sg.ok) return res.status(429).json({ error: "You've reached today's limit for this. It refills within 24 hours.", limitReached: true, resetAt: __sg.resetAt || null });
  }

  // Everything each provider says is collected, so a failure can be explained rather than
  // guessed at. Never includes the key itself.
  const __tried = [];
  const klingKey = klingAuth();
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
            const r = await fetch(url, { method: "GET", headers: { "Authorization": klingAuth() } });
            let data; try { data = await r.json(); } catch (pe) { data = null; }
      try { __tried.push({ status: r.status, ok: r.ok,
        said: data ? JSON.stringify(data).slice(0, 300) : "(not JSON)" }); } catch (_) {}
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
          const r = await fetch(RUNWAY_BASE + "/v1/tasks/" + encodeURIComponent(taskId), {
            method: "GET",
            headers: { "Authorization": "Bearer " + runwayKey, "X-Runway-Version": RUNWAY_VERSION },
          });
          let data; try { data = await r.json(); } catch (pe) { data = null; }
      try { __tried.push({ status: r.status, ok: r.ok,
        said: data ? JSON.stringify(data).slice(0, 300) : "(not JSON)" }); } catch (_) {}
          if (data) {
            const status = (data.status || "").toString().toUpperCase();
            if (status === "SUCCEEDED" && data.output && data.output.length) return res.status(200).json({ status: "success", url: data.output[0] });
            if (status === "FAILED" || status === "CANCELLED") return res.status(200).json({ error: "The video engine couldn't finish this one." });
          }
        } catch (e) { /* fall through */ }
        return res.status(200).json({ status: "processing" });
      }

      return res.status(200).json({ status: "processing" });
    }

    // ===================== EXTEND: continue a finished Kling video into a longer scene =====================
    // Kling's video-extend takes a completed task's id and generates a continuation (~4-5s per call),
    // chainable until the total reaches ~3 minutes. Quality can drift on very long chains.
    if (action === "extend") {
      if (!klingKey) return res.status(200).json({ error: "Video extend needs the Kling engine, which isn't connected right now." });
      const srcTaskId = (body.taskId || body.videoId || "").toString();
      const prompt = (body.prompt || "").toString().slice(0, 800);
      if (!srcTaskId) return res.status(400).json({ error: "A finished video's taskId is required to extend it." });
      try {
        const r = await fetch(KLING_BASE + "/v1/videos/video-extend", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": klingAuth() },
          body: JSON.stringify({ video_id: srcTaskId, prompt: prompt }),
        });
        let data; try { data = await r.json(); } catch (pe) { data = null; }
      try { __tried.push({ status: r.status, ok: r.ok,
        said: data ? JSON.stringify(data).slice(0, 300) : "(not JSON)" }); } catch (_) {}
        const d = (data && (data.data || data)) || {};
        const newTask = d.task_id || d.id || (data && (data.task_id || data.id));
        if (newTask) return res.status(200).json({ provider: "kling", mode: "extend", taskId: newTask, status: "processing" });
        return res.status(200).json({ error: "The video couldn't be extended this time - please try again in a moment." });
      } catch (e) {
        return res.status(200).json({ error: "The video couldn't be extended just now." });
      }
    }

    const prompt = (body.prompt || "").toString().slice(0, 800);
    let image = (body.image || "").toString();
    const hasImage = image && image.length > 100;
    let imageBase64 = image;
    if (hasImage && image.indexOf(",") !== -1 && image.slice(0, 5) === "data:") {
      imageBase64 = image.slice(image.indexOf(",") + 1);
    }
    if (!prompt.trim() && !hasImage) return res.status(400).json({ error: "A prompt or an image is required." });

    // HARD CAP on length - video is the cost-explosion risk. Kling supports 5 or 10s per clip; extend chains further.
    const MAX_SECONDS = 15;
    let seconds = parseInt(body.seconds || 5, 10);
    if (isNaN(seconds) || seconds < 1) seconds = 5;
    if (seconds > MAX_SECONDS) seconds = MAX_SECONDS;
    // Kling accepts 5 or 10 per clip on every model we can reach. Anything longer is made
    // by chaining with extend, which is what the Extend button does - so snap here and let
    // the person keep going rather than silently throwing the extra seconds away.
    // Kling 3 takes any length from 3 to 15 seconds in one clip; older Kling models take 5 or 10.
    const wantSeconds = Math.max(3, seconds);
    const snapped = seconds <= 7 ? 5 : 10;
    seconds = snapped;

    // Kling's model names change as they ship new versions, and a name their API does not
    // recognise fails the whole request. So: newest first, and step back through the ladder
    // if it is rejected. A wrong guess can only cost one extra round trip - it can never
    // take video generation down.
    const KLING_LADDER = ["kling-v3", "kling-v2-6", "kling-v2-5-turbo", "kling-v2-1"];

    // Aspect ratio and a negative prompt were both accepted by the API and never sent.
    // Vertical matters more than anything here - this is a phone.
    const RATIOS = ["16:9", "9:16", "1:1"];
    const ratio = RATIOS.includes(String(body.ratio)) ? String(body.ratio) : "16:9";
    const negative = String(body.negative || "").slice(0, 400);

    // PRIMARY: Kling (Singapore host, Bearer auth).
    if (klingKey) {
      // Walk the ladder: newest model first, step back only if the API rejects the NAME.
      // Any other failure falls straight through to Runway as it always did.
      for (const klingModel of KLING_LADDER) {
      try {
        const endpoint = hasImage
          ? KLING_BASE + "/v1/videos/image2video"
          : KLING_BASE + "/v1/videos/text2video";
        const dur = String(klingModel === "kling-v3" ? wantSeconds : snapped);
        const payload = hasImage
          ? { model_name: klingModel, image: imageBase64, prompt: prompt || "", negative_prompt: negative, duration: dur, mode: "pro", aspect_ratio: ratio }
          : { model_name: klingModel, prompt: prompt, negative_prompt: negative, duration: dur, mode: "pro", aspect_ratio: ratio, sound: "on" };
        const r = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": klingAuth() },
          body: JSON.stringify(payload),
        });
        let data; try { data = await r.json(); } catch (pe) { data = null; }
      try { __tried.push({ status: r.status, ok: r.ok,
        said: data ? JSON.stringify(data).slice(0, 300) : "(not JSON)" }); } catch (_) {}
        if (data) {
          const d = data.data || data;
          const taskId = d.task_id || d.id || data.task_id || data.id;
          if (taskId) return res.status(200).json({ provider: "kling", mode: hasImage ? "image" : "text", taskId: taskId, status: "processing" });
          const vurl = d.video_url || (d.task_result && d.task_result.videos && d.task_result.videos[0] && d.task_result.videos[0].url);
          if (vurl) return res.status(200).json({ provider: "kling", url: vurl });
          // If the failure is about the MODEL NAME, try the next one down the ladder.
          // Anything else is a real failure and should not be retried three times.
          const raw = JSON.stringify(data).toLowerCase();
          const nameProblem = !r.ok && /model|not\s*found|unsupported|invalid.*name|unknown/.test(raw);
          if (nameProblem) continue;
          if (!r.ok && !runwayKey) {
            const msg = (data.error && (data.error.message || data.error)) || data.message || ("HTTP " + r.status);
            return res.status(200).json({ error: "Kling: " + msg });
          }
          if (!r.ok) break;   // a real failure - hand over to Runway
        }
      } catch (e) {
        if (!runwayKey) return res.status(200).json({ error: "Kling service error: " + (e && e.message ? e.message : String(e)) });
        break;
      }
      }
    }

    // SECONDARY: Runway. One key reaches several engines, so it walks them in turn:
    //   with a picture - Gen-4 Turbo, then Gen-4.5;
    //   words only     - Runway's text-to-video engine, and if that refuses, the film is started
    //                    the way a studio would: a key frame is painted first (free, on
    //                    Cloudflare when connected), then that frame is brought to life.
    if (runwayKey) {
      const RH = { "Content-Type": "application/json", "Authorization": "Bearer " + runwayKey, "X-Runway-Version": RUNWAY_VERSION };
      const rwSeconds = Math.min(10, Math.max(2, seconds));
      const rwPost = async (path, payload) => {
        try {
          const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 30000);
          const r = await fetch(RUNWAY_BASE + path, { method: "POST", headers: RH, body: JSON.stringify(payload), signal: ctl.signal });
          clearTimeout(t);
          let data; try { data = await r.json(); } catch (pe) { data = null; }
          try { __tried.push({ engine: "runway " + (payload.model || path), status: r.status, ok: r.ok, said: data ? JSON.stringify(data).slice(0, 300) : "(not JSON)" }); } catch (_) {}
          const id = data && (data.id || data.task_id);
          return id ? { taskId: id } : { failed: true };
        } catch (e) { return { failed: true }; }
      };
      const fromImage = async (img) => {
        for (const m of ["gen4_turbo", "gen4.5"]) {
          const got = await rwPost("/v1/image_to_video", { model: m, promptImage: img, promptText: prompt || "", ratio: RW_I2V_RATIO[ratio] || "1280:720", duration: rwSeconds });
          if (got.taskId) return got.taskId;
        }
        return null;
      };
      if (hasImage) {
        const id = await fromImage(image.slice(0, 5) === "data:" || /^https:\/\//.test(image) ? image : "data:image/png;base64," + image);
        if (id) return res.status(200).json({ provider: "runway", mode: "image", taskId: id, status: "processing" });
      } else {
        for (const m of ["gemini_omni_flash_1.1", "gemini_omni_flash"]) {
          const got = await rwPost("/v1/text_to_video", { model: m, promptText: prompt, ratio: RW_T2V_RATIO[ratio] || "1280:720", duration: Math.min(10, Math.max(3, seconds)) });
          if (got.taskId) return res.status(200).json({ provider: "runway", mode: "text", taskId: got.taskId, status: "processing" });
        }
        const acct = process.env.CLOUDFLARE_ACCOUNT_ID, cft = process.env.CLOUDFLARE_API_TOKEN;
        if (acct && cft) {
          try {
            const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 30000);
            const r = await fetch("https://api.cloudflare.com/client/v4/accounts/" + acct + "/ai/run/@cf/black-forest-labs/flux-1-schnell", {
              method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json", Authorization: "Bearer " + cft },
              body: JSON.stringify({ prompt: "Cinematic film still, " + prompt.slice(0, 1800), steps: 8 }),
            });
            clearTimeout(t);
            const j = r.ok ? await r.json() : null;
            const b64 = j && ((j.result && j.result.image) || j.image);
            __tried.push({ engine: "key frame (cloudflare)", status: r.status, ok: !!b64 });
            if (b64) {
              const id = await fromImage("data:image/jpeg;base64," + b64);
              if (id) return res.status(200).json({ provider: "runway", mode: "keyframe", taskId: id, status: "processing" });
            }
          } catch (e) { __tried.push({ engine: "key frame (cloudflare)", ok: false }); }
        }
      }
    }

    // IT SAID NOTHING USEFUL. "No video provider responded" appears when a key IS set but
    // the provider answered in a shape we did not expect - and it told you nothing about
    // which one, what status, or what it actually said. Now it does.
    return res.status(200).json({
      error: "No video provider responded.",
      tried: __tried.length ? __tried : ["no provider was attempted"],
      hint: __tried.length
        ? "The key is set but the provider did not return a task. The detail above is exactly what it sent back."
        : "Neither KLING_API_KEY nor RUNWAY_API_KEY produced a request - check the key names in Vercel.",
    });
  } catch (e) {
    return res.status(200).json({ error: "Video service error: " + (e && e.message ? e.message : String(e)) });
  }
}
