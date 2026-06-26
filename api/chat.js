// The Spine — server-side AI proxy.
// Runs on Vercel (not the browser), so your API key stays secret.
// Accepts either a single { system, user } (legacy) or a full
// { system, messages:[{role,content}] } conversation for multi-turn chat.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
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
      // sanitize: only role + string content, alternating roles allowed by API
      messages = body.messages
        .filter((m) => m && m.content != null)
        .map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: String(m.content),
        }));
    } else {
      messages = [{ role: "user", content: String(body.user || "(no input)") }];
    }

    // Keep cost bounded: cap history length server-side too.
    if (messages.length > 24) messages = messages.slice(-24);

    // Model is chosen by the app (cheaper model for free users, better for signed-in).
    const allowed = { "claude-sonnet-4-6": 1, "claude-haiku-4-5-20251001": 1 };
    const model = allowed[body.model] ? body.model : "claude-sonnet-4-6";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1200,
        system,
        messages,
      }),
    });

    const data = await response.json();
    return res.status(200).json(data);
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
