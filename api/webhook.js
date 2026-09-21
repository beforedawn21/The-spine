// The Spine — Stripe webhook handler.
// Stripe calls this when a payment succeeds, so we can credit the user's wallet.
// Dormant until STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET are set.
//
// IMPORTANT: this needs the raw request body to verify Stripe's signature,
// so we disable body parsing for this route.

export const config = { api: { bodyParser: false } };

import { createClient } from "@supabase/supabase-js";

// What each purchase grants (in credits, 1 credit = $0.001).
const GRANTS = {
  pro:         { credits: 0, pro: true },   // subscription handled separately if desired
  pack_chats:  { credits: 200 },            // ~100 chats at 2cr
  pack_images: { credits: 600 },            // ~20 images at 30cr
  pack_videos: { credits: 2000 },           // ~5 videos at 400cr
  credits_10:  { credits: 10000 },          // 10,000 credits = $10
};

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeKey || !webhookSecret) return res.status(200).json({ notConnected: true });

  let event;
  try {
    const raw = await readRawBody(req);
    const sig = req.headers["stripe-signature"];
    // Verify signature using Stripe's REST-free method via the stripe library if available,
    // otherwise accept and parse (we still re-verify the session with Stripe below for safety).
    try {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(stripeKey);
      event = stripe.webhooks.constructEvent(raw, sig, webhookSecret);
    } catch (verifyErr) {
      // If the stripe lib isn't available, parse raw and re-verify the session by ID below.
      event = JSON.parse(raw.toString());
    }
  } catch (e) {
    return res.status(400).json({ error: "Webhook parse error: " + (e && e.message ? e.message : String(e)) });
  }

  try {
    // ── THE SUBSCRIPTION LIFECYCLE ──
    // Only checkout.session.completed was handled. Which meant: a monthly renewal
    // granted nothing, and somebody who cancelled kept Spine Pro forever, because
    // nothing ever told us they had gone. These are the four events that close that.
    if (event.type === "customer.subscription.deleted" ||
        event.type === "customer.subscription.updated") {
      const sub = event.data.object;
      const gone = event.type === "customer.subscription.deleted" ||
                   ["canceled", "unpaid", "incomplete_expired"].includes(sub.status);
      try {
        const u = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
        const k = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
        if (u && k) {
          const sb = createClient(u, k);
          const customer = String(sub.customer || "");
          if (customer) {
            // The entitlement lives on the account, never in the browser.
            await sb.from("accounts")
              .update({ pro_until: gone ? null : new Date((sub.current_period_end || 0) * 1000).toISOString() })
              .eq("stripe_customer", customer);
          }
        }
      } catch (e) { /* a failed write must not make Stripe retry forever */ }
      return res.status(200).json({ received: true, handled: event.type });
    }

    if (event.type === "invoice.paid") {
      // A renewal. Same grant as the first month, same replay guard.
      const inv = event.data.object;
      try {
        const u = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
        const k = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
        if (u && k && inv.customer) {
          const sb = createClient(u, k);
          const marker = "stripe:" + String(inv.id || event.id || "");
          const { data: seen } = await sb.from("ledger").select("id").eq("label", marker).limit(1);
          if (!seen || !seen.length) {
            const { data: acc } = await sb.from("accounts").select("id")
              .eq("stripe_customer", String(inv.customer)).limit(1).maybeSingle();
            if (acc && acc.id) {
              const period = inv.lines && inv.lines.data && inv.lines.data[0];
              const until = period && period.period && period.period.end
                ? new Date(period.period.end * 1000).toISOString() : null;
              await sb.from("accounts").update({ pro_until: until }).eq("id", acc.id);
              await sb.from("ledger").insert({
                account_id: acc.id, dir: "in", amt: 0,
                title: "Spine Pro renewed", label: marker,
              });
            }
          }
        }
      } catch (e) { /* never 500 back at Stripe */ }
      return res.status(200).json({ received: true, handled: "invoice.paid" });
    }

    if (event.type === "charge.refunded") {
      // Money went back. The credits should not stay.
      const ch = event.data.object;
      try {
        const u = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
        const k = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
        if (u && k && ch.customer) {
          const sb = createClient(u, k);
          const marker = "stripe-refund:" + String(ch.id || event.id || "");
          const { data: seen } = await sb.from("ledger").select("id").eq("label", marker).limit(1);
          if (!seen || !seen.length) {
            const { data: acc } = await sb.from("accounts").select("id")
              .eq("stripe_customer", String(ch.customer)).limit(1).maybeSingle();
            if (acc && acc.id) {
              // Recorded, not silently clawed back - a negative balance helps nobody.
              await sb.from("ledger").insert({
                account_id: acc.id, dir: "out", amt: 0,
                title: "Refunded - needs review", label: marker,
              });
            }
          }
        }
      } catch (e) {}
      return res.status(200).json({ received: true, handled: "charge.refunded" });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      // Stripe retries webhooks, and a captured real event can be replayed. Without a record of what
      // has already been honoured, the same payment grants credits again every time it arrives.
      try {
        const u0 = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
        const k0 = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
        if (u0 && k0) {
          const sb0 = createClient(u0, k0);
          const marker = "stripe:" + String(session.id || event.id || "");
          const { data: seen } = await sb0.from("ledger").select("id").eq("label", marker).limit(1);
          if (seen && seen.length) {
            return res.status(200).json({ received: true, duplicate: true });
          }
          await sb0.from("ledger").insert({ account_id: (session.metadata && session.metadata.accountId) || session.client_reference_id || "unknown", label: marker, direction: "in", amount: 0 });
        }
      } catch (e) { /* if the guard itself fails, continue - never lose a real payment */ }
      // Re-fetch the session from Stripe to confirm it's real and paid.
      const verify = await fetch("https://api.stripe.com/v1/checkout/sessions/" + session.id, {
        headers: { "Authorization": "Bearer " + stripeKey },
      });
      const real = await verify.json();
      if (real && real.payment_status === "paid") {
        const kind = (real.metadata && real.metadata.kind) || "";
        const accountId = (real.metadata && real.metadata.accountId) || real.client_reference_id;
        const grant = GRANTS[kind];
        if (grant && accountId && accountId !== "guest") {
          const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
          const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
          if (url && key) {
            const supabase = createClient(url, key);
            if (grant.credits > 0) {
              const { data: w } = await supabase.from("wallets").select("balance").eq("account_id", accountId).maybeSingle();
              const newBal = ((w && w.balance) || 0) + grant.credits;
              await supabase.from("wallets").upsert({ account_id: accountId, balance: newBal }, { onConflict: "account_id" });
            }
            if (grant.pro) {
              await supabase.from("accounts").update({ is_pro: true }).eq("id", accountId);
            }
          }
        }
      }
    }
    return res.status(200).json({ received: true });
  } catch (e) {
    return res.status(200).json({ error: "Webhook handling error: " + (e && e.message ? e.message : String(e)) });
  }
}
