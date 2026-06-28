// ════════════════════════════════════════════════════════════════
// /api/settings — server-side guard for the ONE global settings row.
//
// Why this exists: the settings row controls prices, limits, models and kill
// switches for the WHOLE app. If the browser can write it with the public key,
// anyone can reconfigure the platform. This route moves the WRITE behind the
// server (service key) and gates it with a server-side admin password, so the
// public key can READ settings (needed to run the app) but cannot WRITE them.
//
// Reads still happen client-side (safe). Only saveSettings routes here.
//
// Env required:
//   SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_KEY
//   ADMIN_PASSWORD  (the single admin password, server-side only)
// ════════════════════════════════════════════════════════════════
import { createClient } from "@supabase/supabase-js";
import { rateLimit } from "./_ratelimit.js";

const SETTINGS_KEY = "global";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Abuse protection: settings saves are admin-only and infrequent.
  const rl = rateLimit(req, "settings", 10, 60000);
  if (!rl.ok) {
    res.setHeader("Retry-After", String(rl.retryAfter));
    return res.status(429).json({ error: "Too many requests. Please wait a moment." });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const adminPasswords = String(process.env.ADMIN_PASSWORD || "").split(",").map(s => s.trim()).filter(Boolean);

    // Gate: caller must present one of the admin passwords. Compared server-side only.
    if (!adminPasswords.length || !body.password || !adminPasswords.includes(String(body.password))) {
      return res.status(403).json({ error: "Not authorized." });
    }

    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) {
      // Service key not configured yet — tell the client so it can fall back gracefully.
      return res.status(200).json({ notConnected: true });
    }
    const supabase = createClient(url, key);

    // value must be a JSON string of the settings object.
    let value = body.value;
    if (typeof value !== "string") {
      try { value = JSON.stringify(value); } catch (e) { return res.status(400).json({ error: "Bad settings payload." }); }
    }
    if (value.length > 100000) {
      return res.status(400).json({ error: "Settings payload too large." });
    }

    const { error } = await supabase
      .from("settings")
      .upsert({ key: SETTINGS_KEY, value, updated_at: new Date().toISOString() }, { onConflict: "key" });

    if (error) {
      return res.status(200).json({ error: error.message || "Could not save settings." });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(200).json({ error: "Settings service error: " + (e && e.message ? e.message : String(e)) });
  }
}
