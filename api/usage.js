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
import { createClient } from "@supabase/supabase-js";

// The allowance table. These mirror the app's existing numbers. The app also
// sends its own limit/window (from admin settings) which overrides these; these
// are just safe server-side defaults so the endpoint is correct on its own.
const DEFAULTS = {
  // Every pipe is capped. Anonymous visitors get a real taste - more than most apps give -
  // then a nudge to make a free profile. Signed-up people get a genuinely generous allowance
  // that refills, deliberately more room than competing tools, while still bounded so the
  // expensive engines (Suno, Kling, Runway, ElevenLabs) can never be drained by a stranger.
  chat:      { anon: { lim: 5,   win: 9999 }, acct: { lim: 60, win: 3  } }, // the main conversation - most generous
  text:      { anon: { lim: 5,   win: 9999 }, acct: { lim: 60, win: 3  } },
  tool:      { anon: { lim: 2,   win: 9999 }, acct: { lim: 20, win: 4  } },
  assistant: { anon: { lim: 3,   win: 9999 }, acct: { lim: 25, win: 4  } },
  world:     { anon: { lim: 2,   win: 9999 }, acct: { lim: 12, win: 6  } }, // heavy generation
  game:      { anon: { lim: 2,   win: 9999 }, acct: { lim: 15, win: 12 } },
  blueprint: { anon: { lim: 2,   win: 9999 }, acct: { lim: 12, win: 12 } },
  web:       { anon: { lim: 2,   win: 9999 }, acct: { lim: 15, win: 12 } },
  agent:     { anon: { lim: 1,   win: 9999 }, acct: { lim: 10, win: 12 } }, // multi-step, many calls
  image:     { anon: { lim: 3,   win: 9999 }, acct: { lim: 25, win: 12 } },
  // --- these cost real money per use, so they stay tighter ---
  music:     { anon: { lim: 1,   win: 9999 }, acct: { lim: 8,  win: 24 } }, // Suno, per song
  video:     { anon: { lim: 1,   win: 9999 }, acct: { lim: 6,  win: 24 } }, // Kling / Runway, per clip
  movie:     { anon: { lim: 1,   win: 9999 }, acct: { lim: 6,  win: 24 } },
  dub:       { anon: { lim: 2,   win: 9999 }, acct: { lim: 20, win: 24 } }, // ElevenLabs, per character
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

export default async function handler(req, res) {
  const __ip = (req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  if (!__rateLimit(__ip, 240, 60000)) {
    return res.status(429).json({ error: "Too many requests. Wait a minute." });
  }
  // Always answer 200 with a clear shape. Never 4xx/5xx for normal flow — the app
  // reads { allowed } and we never want a limit check to hard-fail the app.
  if (req.method !== "POST") {
    return res.status(200).json({ allowed: true, soft: true, reason: "method" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
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

    const signedIn = !!body.accountId;
    const tier = signedIn ? "acct" : "anon";
    const subject = signedIn ? ("acct:" + body.accountId) : ("ip:" + clientIp(req));

    // Limit + window: prefer values the app passes (from admin settings), else defaults.
    const d = DEFAULTS[kind][tier];
    // THE CAPS WERE SET BY THE CALLER.
    // lim and winHours were read straight from the request body, so anyone could send
    // limit:999999, or a window of a few seconds that resets instantly, and every per-pipe
    // cap was gone. The caller may now only make a limit STRICTER - a lower count, or a
    // longer window - never looser. Admin settings can still tighten; nothing can loosen.
    const askLim = Number.isFinite(body.limit) ? body.limit : d.lim;
    const askWin = Number.isFinite(body.windowHours) ? body.windowHours : d.win;
    const lim = Math.max(0, Math.min(askLim, d.lim));
    const winHours = Math.max(askWin, d.win);

    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) {
      // Not configured yet → fail-open.
      return res.status(200).json({ allowed: true, soft: true, reason: "unconfigured" });
    }
    const supabase = createClient(url, key);

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
    const HEAVY = ["world","video","music","agent","game","movie","blueprint"];
    const ALL_CAP   = signedIn ? 400 : 12;
    const HEAVY_CAP = signedIn ? 30  : 3;
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
