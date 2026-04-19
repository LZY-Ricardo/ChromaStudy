const { Router } = require("express");
const http = require("http");
const { resolveAiConfig, validateOpenAiConfig } = require("../utils/aiUtils");

const router = Router();

router.post("/chat", (req, res) => {
  console.log("[CHAT] Request received");
  const { messages, ai } = req.body || {};
  console.log("[CHAT] Messages count:", messages?.length);
  console.log("[CHAT] AI config:", JSON.stringify(ai));

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages is required" });
  }

  const normalizedMessages = messages
    .filter(
      (message) =>
        message &&
        typeof message.content === "string" &&
        message.content.trim().length > 0
    )
    .map((message) => ({
      role: message.role || "user",
      content: message.content,
    }));

  if (normalizedMessages.length === 0) {
    return res.status(400).json({ error: "messages is required" });
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  if (res.flushHeaders) {
    res.flushHeaders();
  }

  const systemMessage = {
    role: "system",
    content: "你是一名专业的学习教练，语气幽默且富有鼓励性。",
  };

  const aiConfig = resolveAiConfig(ai);
  console.log("[CHAT] Resolved AI config:", JSON.stringify(aiConfig));
  if (aiConfig.provider === "openai") {
    const error = validateOpenAiConfig(aiConfig);
    if (error) {
      console.error("[CHAT] OpenAI config error:", error);
      return res.status(400).json({ error });
    }
  }

  const isWritable = () => {
    return !res.writableEnded && res.writable;
  };

  if (aiConfig.provider === "openai") {
    const controller = new AbortController();
    let streamStarted = false;
    let responseEnded = false;

    const onClientClose = () => {
      if (responseEnded || res.writableEnded) {
        console.log("[CHAT] Client connection closed normally (stream completed)");
        return;
      }
      if (!streamStarted) {
        console.log("[CHAT] Client closed connection prematurely (before stream started)");
      } else {
        console.log("[CHAT] Client closed connection during stream");
      }
      controller.abort();
    };

    res.on("close", onClientClose);

    const allMessages = [systemMessage, ...normalizedMessages];
    const fetchUrl = `${aiConfig.baseUrl}/chat/completions`;
    console.log("[CHAT] Fetching OpenAI at:", fetchUrl);

    if (isWritable()) {
      res.write(": keep-alive\n\n");
      if (res.flush) res.flush();
    }
    console.log("[CHAT] Request body:", JSON.stringify({
      model: aiConfig.model,
      stream: true,
      messages: allMessages,
    }).substring(0, 200) + "...");

    fetch(fetchUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${aiConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: aiConfig.model,
        stream: true,
        messages: allMessages,
      }),
      signal: controller.signal,
    })
      .then(async (openaiRes) => {
        console.log("[CHAT] OpenAI response status:", openaiRes.status);
        if (!openaiRes.ok || !openaiRes.body) {
          const body = await openaiRes.text().catch(() => "");
          console.error("[CHAT] OpenAI error status:", openaiRes.status, body);
          if (isWritable()) {
            res.write(
              `event: error\ndata: ${JSON.stringify({ error: "openai_error" })}\n\n`
            );
            responseEnded = true;
            res.end();
          }
          return;
        }

        console.log("[CHAT] Starting to read OpenAI stream...");
        streamStarted = true;
        const reader = openaiRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let contentChunkCount = 0;
        const splitSseEvents = (input) => {
          const parts = input.split(/\r?\n\r?\n/);
          const rest = parts.pop() || "";
          return { parts, rest };
        };

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!isWritable()) break;

          buffer += decoder.decode(value, { stream: true });
          const { parts, rest } = splitSseEvents(buffer);
          buffer = rest;

          for (const part of parts) {
            const lines = part.split("\n");
            for (const line of lines) {
              if (!line.startsWith("data:")) continue;
              const payload = line.replace(/^data:\s*/, "").trim();
              if (!payload) continue;
              if (payload === "[DONE]") {
                console.log("[CHAT] OpenAI stream completed, total chunks:", contentChunkCount);
                if (isWritable()) {
                  res.write("event: done\ndata: {}\n\n");
                  responseEnded = true;
                  res.end();
                }
                return;
              }

              try {
                const parsed = JSON.parse(payload);
                const content = parsed?.choices?.[0]?.delta?.content ?? "";
                if (content) {
                  contentChunkCount++;
                  res.write(`data: ${JSON.stringify({ content })}\n\n`);
                }
              } catch (error) {
                console.log("[CHAT] OpenAI parse error:", error?.message);
              }
            }
          }
        }

        console.log("[CHAT] OpenAI stream ended, total chunks:", contentChunkCount);
        if (isWritable()) {
          res.write("event: done\ndata: {}\n\n");
          responseEnded = true;
          res.end();
        }
      })
      .catch((error) => {
        if (error?.name === "AbortError") {
          return;
        }
        console.error("[CHAT] OpenAI request error:", error);
        if (isWritable()) {
          res.write(`event: error\ndata: ${JSON.stringify({ error: "request_failed" })}\n\n`);
          responseEnded = true;
          res.end();
        }
      });

    return;
  }

  req.on("close", () => {
    console.log("[CHAT] Client closed connection detected");
  });

  const ollamaUrl = new URL(`${aiConfig.host}/api/chat`);
  const ollamaBody = JSON.stringify({
    model: aiConfig.model,
    stream: true,
    messages: [systemMessage, ...normalizedMessages],
  });

  console.log("[CHAT] Calling Ollama at:", ollamaUrl.href);

  const ollamaOptions = {
    hostname: ollamaUrl.hostname,
    port: parseInt(ollamaUrl.port) || 11434,
    path: ollamaUrl.pathname,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(ollamaBody),
    },
    timeout: 120000,
    agent: false,
  };

  const ollamaReq = http.request(ollamaOptions, (ollamaRes) => {
    console.log("[CHAT] Ollama response status:", ollamaRes.statusCode);

    if (ollamaRes.statusCode !== 200) {
      console.error("[CHAT] Ollama error status:", ollamaRes.statusCode);
      if (isWritable()) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: "ollama_error" })}\n\n`);
        res.end();
      }
      return;
    }

    let buffer = "";
    let chunkCount = 0;

    ollamaRes.on("data", (chunk) => {
      console.log("[CHAT] Ollama chunk received:", chunk.length, "bytes, writable:", isWritable());
      if (!isWritable()) return;

      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          const content = parsed?.message?.content ?? "";
          if (content) {
            chunkCount++;
            console.log("[CHAT] Sending to client chunk:", chunkCount, content);
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        } catch (e) {
          console.log("[CHAT] Parse error:", e.message);
        }
      }
    });

    ollamaRes.on("end", () => {
      console.log("[CHAT] Ollama stream ended, total chunks:", chunkCount);
      if (isWritable()) {
        res.write("event: done\ndata: {}\n\n");
        res.end();
      }
    });

    ollamaRes.on("error", (err) => {
      console.error("[CHAT] Ollama stream error:", err);
      if (isWritable()) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: "stream_error" })}\n\n`);
        res.end();
      }
    });
  });

  ollamaReq.on("error", (err) => {
    console.error("[CHAT] Ollama request error:", err);
    if (isWritable()) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: "request_failed" })}\n\n`);
      res.end();
    }
  });

  ollamaReq.on("timeout", () => {
    console.error("[CHAT] Ollama request timeout");
    ollamaReq.destroy();
    if (isWritable()) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: "timeout" })}\n\n`);
      res.end();
    }
  });

  ollamaReq.write(ollamaBody);
  ollamaReq.end();
});

module.exports = router;
