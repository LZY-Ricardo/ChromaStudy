const { validateOpenAiConfig } = require("./aiUtils");
const { normalizeFeedback } = require("./stringUtils");

async function chatOnce(aiConfig, messages) {
  if (aiConfig.provider === "openai") {
    const error = validateOpenAiConfig(aiConfig);
    if (error) {
      throw new Error(error);
    }

    const response = await fetch(`${aiConfig.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${aiConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: aiConfig.model,
        stream: false,
        messages,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`openai request failed: ${response.status} ${body}`);
    }

    const data = await response.json();
    return String(data?.choices?.[0]?.message?.content ?? "");
  }

  const response = await fetch(`${aiConfig.host}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: aiConfig.model,
      stream: false,
      messages,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`ollama request failed: ${response.status} ${body}`);
  }

  const data = await response.json();
  return String(data?.message?.content ?? "");
}

async function generateFeedback(content, aiConfig) {
  if (!content) {
    return "";
  }

  const text = await chatOnce(aiConfig, [
    {
      role: "system",
      content: "你是一名幽默又鼓励人的学习教练。请用中文，50字以内点评。",
    },
    { role: "user", content },
  ]);

  return normalizeFeedback(text);
}

module.exports = {
  chatOnce,
  generateFeedback,
};
