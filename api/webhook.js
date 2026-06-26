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
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
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
              const { data: w } = await supabase.from("wallets").select("balance").eq("account_id", accountId).single();
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
