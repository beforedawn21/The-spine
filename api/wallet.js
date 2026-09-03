// ════════════════════════════════════════════════════════════════
// /api/wallet — server-authoritative wallet. The browser proposes DELTAS
// (spend/earn); the SERVER is the source of truth: it reads the real balance,
// applies the delta with safety caps, writes it with the service key, logs the
// ledger, and returns the new authoritative balance. The client then syncs to
// that returned value, so a forged local balance can never persist.
//
// Operations (POST body):
//   { op:"read",  accountId }
//       -> { balance }
//   { op:"delta", accountId, amount (+earn / -spend), reason }
//       -> { balance }   (server recomputes; amount clamped & capped)
//   { op:"set",   accountId, amount, password }   (ADMIN ONLY)
//       -> { balance }   (owner sets an absolute value; requires ADMIN_PASSWORD)
//
// Env required: SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_KEY,
//               ADMIN_PASSWORD (only for op:"set").
// ════════════════════════════════════════════════════════════════
import { createClient } from "@supabase/supabase-js";

import { rateLimit } from "./_ratelimit.js";
const DELTA_CAP = 10000;      // max absolute change per single call (anti-abuse)
const MAX_BALANCE = 100000000; // absolute ceiling, sanity
// Earn reasons the server will accept for positive deltas. Spending (negative) is always allowed
// (you can only spend what you have). Positive deltas must name a known earn reason.
const EARN_REASONS = {
  "feedback": 1, "marketplace": 1, "outcome": 1, "refund": 1, "reward": 1,
  "pool": 1, "bonus": 1, "team-refund": 1,
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Budget guard: stop a script hammering this route. Ceilings sit far above human pace,
  // and the limiter fails open, so a real person is never blocked by it.
  {
    const rl = rateLimit(req, "wallet", 120, 3600000);
    if (!rl.ok) return res.status(429).json({ error: "Too many requests - try again shortly.", retryAfter: rl.retryAfter });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const op = body.op;
    const accountId = body.accountId;

    if (!accountId || typeof accountId !== "string" || accountId.startsWith("local-") || accountId === "guest") {
      return res.status(200).json({ notConnected: true }); // guest/local: client keeps its own state
    }

    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return res.status(200).json({ notConnected: true }); // not configured yet

    const supabase = createClient(url, key);

    // Read current authoritative balance (default 0 if no row).
    let { data: w } = await supabase.from("wallets").select("balance").eq("account_id", accountId).maybeSingle();
    let current = (w && typeof w.balance === "number") ? w.balance : 0;

    if (op === "read") {
      return res.status(200).json({ balance: current });
    }

    if (op === "set") {
      // Admin-only absolute set (owner's "Set my credits" / "Max out").
      const adminPasswords = String(process.env.ADMIN_PASSWORD || "").split(",").map(s => s.trim()).filter(Boolean);
      if (!adminPasswords.length || !adminPasswords.includes(String(body.password || ""))) {
        return res.status(403).json({ error: "Not authorized." });
      }
      let target = Math.round(Number(body.amount));
      if (!isFinite(target)) return res.status(400).json({ error: "Bad amount." });
      target = Math.max(0, Math.min(MAX_BALANCE, target));
      await supabase.from("wallets").upsert({ account_id: accountId, balance: target, updated_at: new Date().toISOString() }, { onConflict: "account_id" });
      return res.status(200).json({ balance: target });
    }

    if (op === "delta") {
      let amount = Math.round(Number(body.amount));
      if (!isFinite(amount) || amount === 0) return res.status(200).json({ balance: current });
      const reason = String(body.reason || "").toLowerCase();

      // ══ EARNING IS NO LONGER SOMETHING A BROWSER CAN ASK FOR ══
      // This route used to accept {op:"delta", amount:10000, reason:"reward"} from anyone, with no
      // password, no origin check and no rate limit - which meant unlimited free credits could be
      // minted into any account. Spending is safe to accept from the app (it only ever costs the
      // person their own balance). Adding credit now requires the admin password, so genuine earns
      // must come from a trusted caller - the Stripe webhook, or the owner.
      if (amount > 0) {
        const adminPasswords = String(process.env.ADMIN_PASSWORD || "").split(",").map(s => s.trim()).filter(Boolean);
        const authorised = adminPasswords.length && adminPasswords.includes(String(body.password || ""));
        if (!authorised) {
          return res.status(200).json({ balance: current, rejected: "earning must be authorised server-side" });
        }
        if (!EARN_REASONS[reason]) {
          return res.status(200).json({ balance: current, rejected: "unknown earn reason" });
        }
      }
      // Cap the per-call change so a forged client can't jump the balance.
      if (amount > DELTA_CAP) amount = DELTA_CAP;
      if (amount < -DELTA_CAP) amount = -DELTA_CAP;
      let next = current + amount;
      next = Math.max(0, Math.min(MAX_BALANCE, next)); // clamp: never negative, never over ceiling
      // Read-modify-write loses updates when two requests overlap: both read the same balance and
      // the second overwrites the first, so several parallel spends only cost the person once.
      // Only write if the balance is still what we read; if it moved, re-read and retry.
      let wrote = false;
      for (let attempt = 0; attempt < 4 && !wrote; attempt++) {
        const q = supabase.from("wallets").update({ balance: next, updated_at: new Date().toISOString() }).eq("account_id", accountId);
        const { data: upd, error: uerr } = await (w ? q.eq("balance", current).select("balance") : Promise.resolve({ data: null, error: null }));
        if (!w) {
          // no row yet - create it once
          const { error: ierr } = await supabase.from("wallets").insert({ account_id: accountId, balance: next });
          wrote = !ierr;
          if (!wrote) { const { data: rr } = await supabase.from("wallets").select("balance").eq("account_id", accountId).maybeSingle(); if (rr) { current = rr.balance; next = Math.max(0, Math.min(MAX_BALANCE, current + amount)); w = rr; } }
          continue;
        }
        if (!uerr && upd && upd.length) { wrote = true; break; }
        const { data: fresh } = await supabase.from("wallets").select("balance").eq("account_id", accountId).maybeSingle();
        if (!fresh) break;
        current = fresh.balance;
        next = Math.max(0, Math.min(MAX_BALANCE, current + amount));
      }
      if (!wrote) return res.status(200).json({ balance: current, rejected: "balance changed, try again" });
      // Best-effort ledger log (don't fail the wallet op if the ledger insert hiccups).
      try {
        await supabase.from("ledger").insert({
          account_id: accountId,
          label: (body.label || (amount > 0 ? "Earned: " + reason : "Spent")),
          direction: amount > 0 ? "in" : "out",
          amount: Math.abs(amount),
        });
      } catch (e) {}
      return res.status(200).json({ balance: next });
    }

    return res.status(400).json({ error: "Unknown op." });
  } catch (e) {
    return res.status(200).json({ error: "Wallet service error: " + (e && e.message ? e.message : String(e)) });
  }
}
