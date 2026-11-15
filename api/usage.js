// ════════════════════════════════════════════════════════════════
// /api/usage — server-side usage limits that actually hold.
//
// Why this exists: the app's limits (free games/blueprints/images/chats) were
// counted in the browser (localStorage), so anyone could refresh, open a private
// window, or clear data to reset them. This route moves the count to the SERVER,
// keyed by ACCOUNT when signed in (airtight) or by IP when anonymous (a speed
// bump — shared wifi/carrier NAT means some anonymous users share a count, and a
// VPN gets a fresh one; that's the honest limit of IP-based gating). The real wall
// is the per-account path for signed-in users.
//
// How: one atomic SQL function (usage_bump) increments and checks in a single
// step, so two fast requests can't both slip past. A read-only peek (usage_peek)
// is used to show "X left, resets at…" without spending a use.
//
// FAIL-OPEN by design: if Supabase isn't configured, the table/functions aren't
// there yet, or anything throws, this returns { allowed: true, soft: true } so the
// app keeps working exactly as before. Limits simply switch on once STEP 1 (the
// SQL) and this file are both live. Enforcement must never cause an outage.
//
// Env required (same as the other routes):
//   SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_KEY
// ════════════════════════════════════════════════════════════════
import { PostgrestClient } from "@supabase/postgrest-js";
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from "@simplewebauthn/server";
// THE DATABASE, ADDRESSED THE WAY SUPABASE DOCUMENTS IT. Supabase's newer sb_secret_ keys must
// travel in the apikey header alone - never as a Bearer token - and the full supabase-js library
// sends the key both ways. Legacy keys (they start "eyJ") go in both headers, as before. Same
// .from() and .rpc() calls as supabase-js, so nothing below this changes.
function createClient(url, key) {
  const k = String(key || "");
  const headers = /^eyJ/.test(k) ? { apikey: k, Authorization: "Bearer " + k } : { apikey: k };
  return new PostgrestClient(String(url || "").replace(/\/$/, "") + "/rest/v1", { headers });
}

// The allowance table. These mirror the app's existing numbers. The app also
// sends its own limit/window (from admin settings) which overrides these; these
// are just safe server-side defaults so the endpoint is correct on its own.
const DEFAULTS = {
  // Every pipe is capped. Anonymous visitors get a real taste - more than most apps give -
  // then a nudge to make a free profile. Signed-up people get a genuinely generous allowance
  // that refills, deliberately more room than competing tools, while still bounded so the
  // expensive engines (Suno, Kling, Runway, ElevenLabs) can never be drained by a stranger.
  chat:      { anon: { lim: 5,   win: 9999 }, acct: { lim: 60, win: 3  } , pro: { lim: 180, win: 3 } }, // the main conversation - most generous
  text:      { anon: { lim: 5,   win: 9999 }, acct: { lim: 60, win: 3  } , pro: { lim: 180, win: 3 } },
  tool:      { anon: { lim: 2,   win: 9999 }, acct: { lim: 20, win: 4  } , pro: { lim: 60, win: 4 } },
  assistant: { anon: { lim: 3,   win: 9999 }, acct: { lim: 25, win: 4  } , pro: { lim: 75, win: 4 } },
  world:     { anon: { lim: 2,   win: 9999 }, acct: { lim: 12, win: 6  } , pro: { lim: 36, win: 6 } }, // heavy generation
  game:      { anon: { lim: 2,   win: 9999 }, acct: { lim: 15, win: 12 } , pro: { lim: 45, win: 12 } },
  // A long story game writes its next chapter while you play. Its own allowance, so a story
  // never stops half-way because of the per-game cap, but still a firm ceiling.
  chapter:   { anon: { lim: 3,   win: 9999 }, acct: { lim: 24, win: 12 } , pro: { lim: 72, win: 12 } },
  blueprint: { anon: { lim: 2,   win: 9999 }, acct: { lim: 12, win: 12 } , pro: { lim: 36, win: 12 } },
  web:       { anon: { lim: 2,   win: 9999 }, acct: { lim: 15, win: 12 } , pro: { lim: 45, win: 12 } },
  agent:     { anon: { lim: 1,   win: 9999 }, acct: { lim: 10, win: 12 } , pro: { lim: 30, win: 12 } }, // multi-step, many calls
  image:     { anon: { lim: 3,   win: 9999 }, acct: { lim: 25, win: 12 } , pro: { lim: 75, win: 12 } },
  // --- these cost real money per use, so they stay tighter ---
  music:     { anon: { lim: 1,   win: 9999 }, acct: { lim: 8,  win: 24 } , pro: { lim: 24, win: 24 } }, // Suno, per song
  video:     { anon: { lim: 1,   win: 9999 }, acct: { lim: 6,  win: 24 } , pro: { lim: 18, win: 24 } }, // Kling / Runway, per clip
  movie:     { anon: { lim: 1,   win: 9999 }, acct: { lim: 6,  win: 24 } , pro: { lim: 18, win: 24 } },
  dub:       { anon: { lim: 2,   win: 9999 }, acct: { lim: 20, win: 24 } , pro: { lim: 60, win: 24 } }, // ElevenLabs, per character
};

function clientIp(req) {
  try {
    const xff = (req.headers["x-forwarded-for"] || "").toString();
    if (xff) return xff.split(",")[0].trim();
    return (req.headers["x-real-ip"] || (req.socket && req.socket.remoteAddress) || "unknown").toString();
  } catch (e) {
    return "unknown";
  }
}

// NO LIMITER HERE AT ALL.
// Every paid route had one, this did not. This IS the budget gate - and it could be hammered, writing a database row every time.
const RL = new Map();
function __rateLimit(ip, max, windowMs) {
  const now = Date.now();
  const hit = RL.get(ip);
  if (!hit || now > hit.reset) { RL.set(ip, { n: 1, reset: now + windowMs }); return true; }
  if (hit.n >= max) return false;
  hit.n++; return true;
}

async function ping(body, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const dev = String(body.device || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 30);
  const days = {}; let n = 0;
  if (dev.length >= 8 && body.days && typeof body.days === "object") {
    for (const [d, evs] of Object.entries(body.days).slice(0, 40)) {
      if (!/^\d{4}-\d\d-\d\d$/.test(d) || !evs || typeof evs !== "object") continue;
      for (const [e, c] of Object.entries(evs).slice(0, 12)) {
        // only the downloaded-product counts this file writes - nothing else can be slipped in here
        if (!/^(Offline · )?Downloaded (game|tool|app|page|world|story|file)s? (opened|used)$|^Downloaded · (Game|Tool|App|Page|World|Story|File) (opened|used)$/.test(String(e))) continue;
        (days[d] = days[d] || {})[e] = Math.min(Math.max(parseInt(c, 10) || 1, 1), 200); n++;
      }
    }
  }
  if (!n) return res.status(200).json({ ok: false });
  console.log("[spine-ping] a downloaded Spine product was used", JSON.stringify(days));
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (url && key) {
    try { await createClient(url, key).rpc("track_usage_days", { p_token: "", p_device: "dl" + dev, p_days: days }); } catch (e) {}
  }
  return res.status(200).json({ ok: true, counted: n });
}


// YOUR SPINE CALENDAR (batch 16). Apple Calendar / Google Calendar subscribe to
// /api/usage?cal=<the person's private code> and fetch it every few hours. The code is checked in
// the database (only its fingerprint is stored there); a wrong code gets an empty 404.
const __icsEsc = (s) => String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/[,;]/g, (m) => "\\" + m).replace(/\r?\n/g, "\\n");
const __icsDate = (d) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
function __fold(line) { // RFC 5545: lines over 75 octets continue on the next line after a space
  const out = []; let cur = "", n = 0;
  for (const ch of line) { const b = Buffer.byteLength(ch); if (n + b > 74) { out.push(cur); cur = " "; n = 1; } cur += ch; n += b; }
  out.push(cur); return out.join("\r\n");
}
export function buildIcs(feed, site) {
  const now = __icsDate(Date.now()); const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//The Spine//Calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:The Spine", "X-WR-CALDESC:Events your Spine tools saved, and your scheduled Spine jobs", "REFRESH-INTERVAL;VALUE=DURATION:PT4H", "X-PUBLISHED-TTL:PT4H"];
  for (const e of (feed && feed.items) || []) {
    if (!e || !e.start || isNaN(new Date(e.start))) continue;
    L.push("BEGIN:VEVENT", "UID:" + e.id + "@thespine.cloud", "DTSTAMP:" + now, "DTSTART:" + __icsDate(e.start), "DTEND:" + __icsDate(e.end || e.start), "SUMMARY:" + __icsEsc(e.title || "Event"));
    if (e.details) L.push("DESCRIPTION:" + __icsEsc(e.details));
    if (e.location) L.push("LOCATION:" + __icsEsc(e.location));
    if (e.remind != null) L.push("BEGIN:VALARM", "TRIGGER:-PT" + Math.max(0, Math.round(e.remind)) + "M", "ACTION:DISPLAY", "DESCRIPTION:" + __icsEsc(e.title || "Event"), "END:VALARM");
    L.push("END:VEVENT");
  }
  for (const j of (feed && feed.schedules) || []) {
    if (!j || !j.next || isNaN(new Date(j.next))) continue;
    const st = new Date(j.next);
    L.push("BEGIN:VEVENT", "UID:sched-" + j.id + "@thespine.cloud", "DTSTAMP:" + now, "DTSTART:" + __icsDate(st), "DTEND:" + __icsDate(st.getTime() + 900000),
      "RRULE:FREQ=" + (j.cadence === "weekly" ? "WEEKLY" : "DAILY"), "SUMMARY:" + __icsEsc("Spine job: " + String(j.prompt || "").slice(0, 80)),
      "DESCRIPTION:" + __icsEsc("Your scheduled Spine job runs about now. Open it: " + site + "/?open=schedules"), "URL:" + site + "/?open=schedules", "END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.map(__fold).join("\r\n") + "\r\n";
}
async function calendarFeed(req, res) {
  const code = String((req.query && req.query.cal) || new URL(req.url || "/", "https://x").searchParams.get("cal") || "");
  res.setHeader("Cache-Control", "private, max-age=900");
  if (!/^c[0-9a-f]{48}$/.test(code)) return res.status(404).send("Not found.");
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return res.status(503).send("Not set up.");
  let feed = null;
  try {
    const hdr = /^eyJ/.test(key) ? { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" } : { apikey: key, "Content-Type": "application/json" };
    const r = await fetch(String(url).replace(/\/$/, "") + "/rest/v1/rpc/spine_cal_feed", { method: "POST", headers: hdr, body: JSON.stringify({ p_code: code }), signal: AbortSignal.timeout(8000) });
    if (r.ok) feed = await r.json();
  } catch (e) { feed = null; }
  if (!feed) return res.status(404).send("Not found.");
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "thespine.cloud");
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", 'inline; filename="the-spine.ics"');
  return res.status(200).send(buildIcs(feed, "https://" + host.replace(/[^A-Za-z0-9.:-]/g, "")));
}


// FACE ID / FINGERPRINT SIGN-IN (batch 16). The phone makes a passkey in its own secure chip; this
// server checks every answer with the official WebAuthn rules (SimpleWebAuthn) and the database keeps
// only the PUBLIC half. A good answer opens the same kind of session a password does.
async function __svc(fn, args) {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("not set up");
  const hdr = /^eyJ/.test(key) ? { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" } : { apikey: key, "Content-Type": "application/json" };
  const r = await fetch(String(url).replace(/\/$/, "") + "/rest/v1/rpc/" + fn, { method: "POST", headers: hdr, body: JSON.stringify(args), signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error("db " + r.status);
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
function __site(req) { // the address the person is on: the passkey is tied to it
  let o; try { o = new URL(String(req.headers.origin || "")); } catch (e) { return null; }
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim().split(":")[0].toLowerCase();
  if (!host || o.hostname.toLowerCase() !== host) return null;
  if (o.protocol !== "https:" && !(o.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(o.hostname))) return null;
  return { rpID: o.hostname, origin: o.origin };
}
const __b64u = (u8) => Buffer.from(u8).toString("base64url");
export async function passkey(body, req, res) {
  const ip = (req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  if (!__rateLimit("pk:" + ip, 30, 60000)) return res.status(200).json({ error: "Too many tries - wait a minute." });
  const site = __site(req); if (!site) return res.status(200).json({ error: "Face ID sign-in only works on The Spine's own address." });
  const op = String(body.op || "");
  try {
    if (op === "pk-reg-options") {
      const me = await __svc("spine_pk_account", { p_token: String(body.token || "") }); if (!me) return res.status(200).json({ error: "Please sign in again first." });
      const options = await generateRegistrationOptions({ rpName: "The Spine", rpID: site.rpID, userName: me.username, userDisplayName: me.username,
        userID: new Uint8Array(Buffer.from(String(me.id).replace(/-/g, ""), "hex")), attestationType: "none",
        excludeCredentials: (me.creds || []).map((id) => ({ id })), authenticatorSelection: { residentKey: "required", userVerification: "preferred" } });
      const cid = await __svc("spine_pk_challenge_put", { p_account: me.id, p_kind: "reg", p_challenge: options.challenge });
      if (!cid) return res.status(200).json({ error: "Busy - try again in a minute." });
      return res.status(200).json({ options, challengeId: cid });
    }
    if (op === "pk-reg-verify") {
      const me = await __svc("spine_pk_account", { p_token: String(body.token || "") }); if (!me) return res.status(200).json({ error: "Please sign in again first." });
      const ch = await __svc("spine_pk_challenge_take", { p_id: String(body.challengeId || ""), p_kind: "reg" });
      if (!ch || ch.account !== me.id) return res.status(200).json({ error: "That took too long - try again." });
      const v = await verifyRegistrationResponse({ response: body.response, expectedChallenge: ch.challenge, expectedOrigin: site.origin, expectedRPID: site.rpID, requireUserVerification: false });
      if (!v.verified) return res.status(200).json({ error: "Face ID didn't confirm it." });
      const c = v.registrationInfo.credential;
      const saved = await __svc("spine_pk_save", { p_account: me.id, p_cred: c.id, p_key: __b64u(c.publicKey), p_counter: c.counter || 0, p_transports: c.transports || null, p_name: String(body.name || "").slice(0, 60) });
      return res.status(200).json(saved ? { ok: true } : { error: "That passkey is already set up (or you have 10 already)." });
    }
    if (op === "pk-auth-options") {
      const options = await generateAuthenticationOptions({ rpID: site.rpID, userVerification: "preferred" });
      const cid = await __svc("spine_pk_challenge_put", { p_account: null, p_kind: "auth", p_challenge: options.challenge });
      if (!cid) return res.status(200).json({ error: "Busy - try again in a minute." });
      return res.status(200).json({ options, challengeId: cid });
    }
    if (op === "pk-auth-verify") {
      const resp = body.response || {}; const credId = String(resp.id || "");
      const ch = await __svc("spine_pk_challenge_take", { p_id: String(body.challengeId || ""), p_kind: "auth" });
      if (!ch) return res.status(200).json({ error: "That took too long - try again." });
      if (!/^[A-Za-z0-9_-]{16,1400}$/.test(credId)) return res.status(200).json({ error: "This phone's passkey isn't one The Spine knows." });
      const k = await __svc("spine_pk_get", { p_cred: credId }); if (!k) return res.status(200).json({ error: "This phone's passkey isn't one The Spine knows - it may have been removed. Sign in with your password." });
      const v = await verifyAuthenticationResponse({ response: resp, expectedChallenge: ch.challenge, expectedOrigin: site.origin, expectedRPID: site.rpID, requireUserVerification: false,
        credential: { id: credId, publicKey: new Uint8Array(Buffer.from(k.key, "base64url")), counter: Number(k.counter || 0), transports: k.transports || undefined } });
      if (!v.verified) return res.status(200).json({ error: "Face ID didn't confirm it." });
      const rows = await __svc("spine_pk_session", { p_cred: credId, p_counter: v.authenticationInfo.newCounter || 0 });
      const d = Array.isArray(rows) ? rows[0] : rows; if (!d || !d.token) return res.status(200).json({ error: "Couldn't sign you in - try your password." });
      return res.status(200).json({ ok: true, session: d });
    }
  } catch (e) { return res.status(200).json({ error: /not set up/.test(String(e && e.message)) ? "Face ID sign-in isn't set up yet." : "Face ID sign-in didn't work - try again, or use your password." }); }
  return res.status(200).json({ error: "Unknown." });
}

export default async function handler(req, res) {
  const __ip = (req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  if (!__rateLimit(__ip, 240, 60000)) {
    return res.status(429).json({ error: "Too many requests. Wait a minute." });
  }
  // Always answer 200 with a clear shape. Never 4xx/5xx for normal flow — the app
  // reads { allowed } and we never want a limit check to hard-fail the app.
  if (req.method === "GET" && ((req.query && req.query.cal) || /[?&]cal=/.test(String(req.url || "")))) return await calendarFeed(req, res);
  if (req.method !== "POST") {
    return res.status(200).json({ allowed: true, soft: true, reason: "method" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    // A SPINE PRODUCT WAS USED OUTSIDE THE APP (batch 15). A game, tool or page someone downloaded
    // counts each time it is opened and used - even offline, kept on that phone until it is back
    // online - and sends only that: the kind of product, the day, and whether it was offline.
    // Never who, never what is in it. It shows in Vercel's logs and in Brain Stem's insights.
    if (body.op === "ping") return await ping(body, res);
    if (/^pk-/.test(String(body.op || ""))) return await passkey(body, req, res);
    const kind = String(body.kind || "").toLowerCase();
    if (!DEFAULTS[kind]) {
      // Anything we did not name explicitly is still capped - an unnamed pipe used to sail
      // straight through, which meant the most expensive engines had no limit at all.
      DEFAULTS[kind] = { anon: { lim: 2, win: 9999 }, acct: { lim: 12, win: 12 } };
    }

    // Admins are never limited - but "I am an admin" has to be proved, not merely claimed.
    // This used to accept {admin:true} from anyone, which defeated every cap in one field.
    if (body.admin === true) {
      const adminPasswords = String(process.env.ADMIN_PASSWORD || "").split(",").map(s => s.trim()).filter(Boolean);
      if (adminPasswords.length && adminPasswords.includes(String(body.password || ""))) {
        return res.status(200).json({ allowed: true, used: 0, limit: 0, remaining: Infinity, admin: true });
      }
      // Unproved claim: fall through and cap them like anyone else.
    }

    // IT CRASHED FOR EVERY SIGNED-IN PERSON. The Pro check read `subject` and `supabase` before
    // either existed, which throws - and the catch at the bottom turns any error into "allowed".
    // So no account was ever limited and Pro was never detected. The connection now comes first,
    // and the person comes from their session token, never from an id in the request.
    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) {
      // Not configured yet → fail-open.
      return res.status(200).json({ allowed: true, soft: true, reason: "unconfigured" });
    }
    const supabase = createClient(url, key);
    const tok = String(req.headers["x-spine-session"] || body.token || "");
    let who = null, isPro = false, isAdmin = false;
    if (/^[0-9a-f]{64}$/.test(tok)) {
      try {
        const r = await supabase.rpc("spine_whoami", { p_token: tok });
        who = r && r.data ? String(r.data) : null;
        if (who) {
          const { data: acct } = await supabase.from("accounts").select("pro_until,is_admin").eq("id", who).maybeSingle();
          isPro = !!(acct && acct.pro_until && new Date(acct.pro_until) > new Date());
          isAdmin = !!(acct && acct.is_admin);
        }
      } catch (e) { who = null; isPro = false; }   // if we cannot prove it, they are a visitor
    }
    if (isAdmin) return res.status(200).json({ allowed: true, used: 0, limit: 0, remaining: Infinity, admin: true });
    const signedIn = !!who;
    const tier = isPro ? "pro" : (signedIn ? "acct" : "anon");
    const subject = signedIn ? ("acct:" + who) : ("ip:" + clientIp(req));

    // Limit + window: prefer values the app passes (from admin settings), else defaults.
    // If a pipe has no pro row for any reason, fall back to acct rather than crash.
    const d = DEFAULTS[kind][tier] || DEFAULTS[kind].acct || DEFAULTS[kind].anon;
    // THE CAPS WERE SET BY THE CALLER.
    // lim and winHours were read straight from the request body, so anyone could send
    // limit:999999, or a window of a few seconds that resets instantly, and every per-pipe
    // cap was gone. The caller may now only make a limit STRICTER - a lower count, or a
    // longer window - never looser. Admin settings can still tighten; nothing can loosen.
    const askLim = Number.isFinite(body.limit) ? body.limit : d.lim;
    const askWin = Number.isFinite(body.windowHours) ? body.windowHours : d.win;
    const lim = Math.max(0, Math.min(askLim, d.lim));
    const winHours = Math.max(askWin, d.win);

    // peek mode: just report remaining, don't spend a use (for display).
    if (body.peek === true) {
      const { data, error } = await supabase.rpc("usage_peek", {
        p_subject: subject, p_kind: kind, p_win_hours: winHours,
      });
      if (error || !data || !data.length) {
        return res.status(200).json({ allowed: true, soft: true, reason: "peek-miss" });
      }
      const used = data[0].used || 0;
      return res.status(200).json({
        allowed: used < lim, used, limit: lim,
        remaining: Math.max(0, lim - used), resetAt: data[0].reset_at,
      });
    }

    // A CEILING ACROSS EVERYTHING.
    // Each pipe had its own cap and nothing added them up, so one free account maxing every
    // pipe for a day cost about $29. Two combined counters, using the same atomic function,
    // so no new SQL is needed: one for all generation, one for the engines that cost real
    // money. Checked BEFORE the per-pipe count, so a refusal here spends nothing.
    const HEAVY = ["world","video","music","agent","game","movie","blueprint","prototype"];
    const ALL_CAP   = isPro ? 1200 : (signedIn ? 400 : 12);
    const HEAVY_CAP = isPro ? 90   : (signedIn ? 30  : 3);
    try {
      const a = await supabase.rpc("usage_bump", { p_subject: subject, p_kind: "__all", p_lim: ALL_CAP, p_win_hours: 24 });
      if (a && a.data && a.data.length && a.data[0].allowed === false) {
        return res.status(200).json({ allowed: false, used: a.data[0].used, limit: ALL_CAP,
          remaining: 0, resetAt: a.data[0].reset_at, reason: "daily-ceiling" });
      }
      if (HEAVY.includes(kind)) {
        const h = await supabase.rpc("usage_bump", { p_subject: subject, p_kind: "__heavy", p_lim: HEAVY_CAP, p_win_hours: 24 });
        if (h && h.data && h.data.length && h.data[0].allowed === false) {
          return res.status(200).json({ allowed: false, used: h.data[0].used, limit: HEAVY_CAP,
            remaining: 0, resetAt: h.data[0].reset_at, reason: "daily-heavy-ceiling" });
        }
      }
    } catch (e) { /* fail-open, as everything else here does */ }

    // bump mode: atomic check + increment.
    const { data, error } = await supabase.rpc("usage_bump", {
      p_subject: subject, p_kind: kind, p_lim: lim, p_win_hours: winHours,
    });
    if (error || !data || !data.length) {
      // Function missing or errored → fail-open.
      return res.status(200).json({ allowed: true, soft: true, reason: "bump-miss" });
    }
    const row = data[0];
    return res.status(200).json({
      allowed: !!row.allowed,
      used: row.used,
      limit: row.lim,
      remaining: Math.max(0, (row.lim || 0) - (row.used || 0)),
      resetAt: row.reset_at,
    });
  } catch (e) {
    // Anything unexpected → fail-open so the app never breaks.
    return res.status(200).json({ allowed: true, soft: true, reason: "error" });
  }
}
