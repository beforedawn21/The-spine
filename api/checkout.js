// The Spine — Stripe checkout session creator.
// Dormant until STRIPE_SECRET_KEY is set in Vercel.
// Accepts { kind, accountId } where kind = 'pro' | 'credits_small' | 'pack_images' etc.
// Returns { url } (redirect to Stripe) or { notConnected }.

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return res.status(200).json({ notConnected: true });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const kind = (body.kind || "").toString();
    const accountId = (body.accountId || "").toString();
    const origin = req.headers.origin || "https://thespine.cloud";

    // Catalog — prices in cents. Subscriptions vs one-time packs.
    const catalog = {
      pro:           { mode: "subscription", amount: 999,  name: "Spine Pro (monthly)", recurring: true },
      pack_chats:    { mode: "payment",      amount: 199,  name: "+100 chats" },
      pack_images:   { mode: "payment",      amount: 299,  name: "+20 images" },
      pack_videos:   { mode: "payment",      amount: 499,  name: "+5 videos" },
      credits_10:    { mode: "payment",      amount: 1000, name: "10,000 credits" },
    };
    const item = catalog[kind];
    if (!item) return res.status(400).json({ error: "Unknown purchase type." });

    // Build the Stripe Checkout Session via REST (no SDK needed).
    const params = new URLSearchParams();
    params.append("mode", item.mode);
    params.append("success_url", origin + "/?paid=success&kind=" + kind);
    params.append("cancel_url", origin + "/?paid=cancel");
    params.append("client_reference_id", accountId || "guest");
    params.append("metadata[kind]", kind);
    params.append("metadata[accountId]", accountId || "guest");
    params.append("line_items[0][quantity]", "1");
    params.append("line_items[0][price_data][currency]", "usd");
    params.append("line_items[0][price_data][product_data][name]", item.name);
    params.append("line_items[0][price_data][unit_amount]", String(item.amount));
    if (item.recurring) params.append("line_items[0][price_data][recurring][interval]", "month");

    const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + stripeKey, "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const data = await r.json();
    if (data && data.error) return res.status(200).json({ error: data.error.message || "Stripe error." });
    if (data && data.url) return res.status(200).json({ url: data.url });
    return res.status(200).json({ error: "Could not create checkout." });
  } catch (e) {
    return res.status(200).json({ error: "Checkout error: " + (e && e.message ? e.message : String(e)) });
  }
}
