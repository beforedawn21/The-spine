// The Spine — server-side AI proxy.
// This runs on Vercel (not in the browser), so your API key stays secret.
// The front-end calls /api/chat; this function calls Anthropic and returns the answer.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // No key set yet — return a clear message instead of crashing.
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
    const { system, user } = req.body || {};

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: system || "",
        messages: [{ role: "user", content: user || "(no input)" }],
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

