const path = require("path");
const http = require("http");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const { prisma } = require("./prismaClient");

const app = express();
app.use(cors());
app.use(express.json());

const ollamaHost = process.env.OLLAMA_HOST || "http://localhost:11434";
const ollamaModel = process.env.OLLAMA_MODEL || "llama3";

const PORT = Number(process.env.PORT) || 3001;

function normalizeBaseUrl(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/\/+$/, "");
}

function resolveAiConfig(ai) {
  const provider = ai?.provider === "openai" ? "openai" : "ollama";

  if (provider === "openai") {
    const baseUrl = normalizeBaseUrl(ai?.openai?.baseUrl);
    const model =
      typeof ai?.openai?.model === "string" ? ai.openai.model.trim() : "";
    const apiKey =
      typeof ai?.openai?.apiKey === "string" ? ai.openai.apiKey.trim() : "";

    return {
      provider: "openai",
      baseUrl,
      model,
      apiKey,
    };
  }

  const host =
    typeof ai?.ollama?.host === "string" ? ai.ollama.host.trim() : "";
  const model =
    typeof ai?.ollama?.model === "string" ? ai.ollama.model.trim() : "";

  return {
    provider: "ollama",
    host: host || ollamaHost,
    model: model || ollamaModel,
  };
}

function validateOpenAiConfig(config) {
  if (!config.baseUrl || !config.model || !config.apiKey) {
    return "openai config requires baseUrl/model/apiKey";
  }
  return "";
}

function toDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeFeedback(text) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= 50) {
    return compact;
  }
  return compact.slice(0, 50);
}

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

function asyncHandler(handler) {
  return (req, res) => {
    Promise.resolve(handler(req, res)).catch((error) => {
      console.error(error);
      res.status(500).json({ error: "Internal Server Error" });
    });
  };
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.post(
  "/api/login",
  asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: "username and password are required" });
    }

    const existing = await prisma.user.findUnique({
      where: { username },
    });

    if (existing) {
      if (existing.password !== password) {
        return res.status(401).json({ error: "invalid credentials" });
      }

      return res.json({ user: { id: existing.id, username: existing.username } });
    }

    const created = await prisma.user.create({
      data: { username, password },
    });

    return res.json({ user: { id: created.id, username: created.username } });
  })
);

app.post(
  "/api/checkin",
  asyncHandler(async (req, res) => {
    const { userId, date, duration, content, ai } = req.body || {};
    const normalizedUserId = Number(userId);
    const normalizedDuration = Number(duration);
    const logDate = date || toDateString();
    const aiConfig = resolveAiConfig(ai);

    if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
      return res.status(400).json({ error: "userId must be a positive integer" });
    }

    if (!Number.isFinite(normalizedDuration) || normalizedDuration < 0) {
      return res.status(400).json({ error: "duration must be a non-negative number" });
    }

    if (!content) {
      return res.status(400).json({ error: "content is required" });
    }

    if (aiConfig.provider === "openai") {
      const error = validateOpenAiConfig(aiConfig);
      if (error) {
        return res.status(400).json({ error });
      }
    }

    const log = await prisma.studyLog.upsert({
      where: {
        userId_date: {
          userId: normalizedUserId,
          date: logDate,
        },
      },
      create: {
        userId: normalizedUserId,
        date: logDate,
        duration: normalizedDuration,
        content,
        aiFeedback: null,
      },
      update: {
        duration: normalizedDuration,
        content,
        aiFeedback: null,
      },
    });

    res.json(log);

    setImmediate(async () => {
      try {
        const feedback = await generateFeedback(content, aiConfig);
        if (!feedback) {
          return;
        }

        await prisma.studyLog.update({
          where: {
            userId_date: {
              userId: normalizedUserId,
              date: logDate,
            },
          },
          data: { aiFeedback: feedback },
        });
      } catch (error) {
        console.error("AI feedback error:", error);
      }
    });
  })
);

app.get(
  "/api/study-logs",
  asyncHandler(async (req, res) => {
    const userId = Number(req.query.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "userId must be a positive integer" });
    }

    const logs = await prisma.studyLog.findMany({
      where: { userId },
      orderBy: { date: "asc" },
    });

    return res.json(logs);
  })
);

app.get(
  "/api/tasks",
  asyncHandler(async (req, res) => {
    const userId = Number(req.query.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "userId must be a positive integer" });
    }

    const tasks = await prisma.task.findMany({
      where: { userId },
      orderBy: { id: "asc" },
    });

    return res.json(tasks);
  })
);

app.post(
  "/api/tasks",
  asyncHandler(async (req, res) => {
    const { userId, title } = req.body || {};
    const normalizedUserId = Number(userId);

    if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
      return res.status(400).json({ error: "userId must be a positive integer" });
    }

    if (!title) {
      return res.status(400).json({ error: "title is required" });
    }

    const task = await prisma.task.create({
      data: {
        userId: normalizedUserId,
        title,
      },
    });

    return res.json(task);
  })
);

app.patch(
  "/api/tasks/:id",
  asyncHandler(async (req, res) => {
    const taskId = Number(req.params.id);
    const { title, isDone } = req.body || {};

    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(400).json({ error: "id must be a positive integer" });
    }

    const updates = {};
    if (typeof title === "string") {
      updates.title = title;
    }
    if (typeof isDone === "boolean") {
      updates.isDone = isDone;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "no fields to update" });
    }

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: updates,
    });

    return res.json(updated);
  })
);

app.post("/api/chat", (req, res) => {
  console.log("[CHAT] Request received");
  const { messages, ai } = req.body || {};
  console.log("[CHAT] Messages count:", messages?.length);

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
  if (aiConfig.provider === "openai") {
    const error = validateOpenAiConfig(aiConfig);
    if (error) {
      return res.status(400).json({ error });
    }
  }

  // 检查响应是否可写
  const isWritable = () => {
    return !res.writableEnded && res.writable;
  };

  // 立即发送一个开始信号，保持连接活跃
  if (isWritable()) {
    console.log("[CHAT] Sending start signal");
    res.write(`event: start\ndata: {}\n\n`);
  }

  if (aiConfig.provider === "openai") {
    const controller = new AbortController();

    req.on("close", () => {
      console.log("[CHAT] Client closed connection detected");
      controller.abort();
    });

    const allMessages = [systemMessage, ...normalizedMessages];
    fetch(`${aiConfig.baseUrl}/chat/completions`, {
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
        if (!openaiRes.ok || !openaiRes.body) {
          const body = await openaiRes.text().catch(() => "");
          console.error("[CHAT] OpenAI error status:", openaiRes.status, body);
          if (isWritable()) {
            res.write(
              `event: error\ndata: ${JSON.stringify({ error: "openai_error" })}\n\n`
            );
            res.end();
          }
          return;
        }

        const reader = openaiRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!isWritable()) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const part of parts) {
            const lines = part.split("\n");
            for (const line of lines) {
              if (!line.startsWith("data:")) continue;
              const payload = line.replace(/^data:\s*/, "").trim();
              if (!payload) continue;
              if (payload === "[DONE]") {
                if (isWritable()) {
                  res.write("event: done\ndata: {}\n\n");
                  res.end();
                }
                return;
              }

              try {
                const parsed = JSON.parse(payload);
                const content = parsed?.choices?.[0]?.delta?.content ?? "";
                if (content) {
                  res.write(`data: ${JSON.stringify({ content })}\n\n`);
                }
              } catch (error) {
                console.log("[CHAT] OpenAI parse error:", error?.message);
              }
            }
          }
        }

        if (isWritable()) {
          res.write("event: done\ndata: {}\n\n");
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
          res.end();
        }
      });

    return;
  }

  req.on("close", () => {
    console.log("[CHAT] Client closed connection detected");
  });

  // 准备 Ollama 请求
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

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
