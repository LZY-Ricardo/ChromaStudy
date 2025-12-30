const path = require("path");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const { Ollama } = require("ollama");
const { prisma } = require("./prismaClient");

const app = express();
app.use(cors());
app.use(express.json());

const ollamaHost = process.env.OLLAMA_HOST || "http://localhost:11434";
const ollamaModel = process.env.OLLAMA_MODEL || "llama3";
const ollama = new Ollama({ host: ollamaHost });

const PORT = Number(process.env.PORT) || 3001;

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

async function generateFeedback(content) {
  if (!content) {
    return "";
  }

  const response = await ollama.chat({
    model: ollamaModel,
    messages: [
      {
        role: "system",
        content:
          "You are a humorous, encouraging study coach. Reply in concise Chinese within 50 characters.",
      },
      { role: "user", content },
    ],
  });

  return normalizeFeedback(response?.message?.content ?? "");
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
    const { userId, date, duration, content } = req.body || {};
    const normalizedUserId = Number(userId);
    const normalizedDuration = Number(duration);
    const logDate = date || toDateString();

    if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
      return res.status(400).json({ error: "userId must be a positive integer" });
    }

    if (!Number.isFinite(normalizedDuration) || normalizedDuration < 0) {
      return res.status(400).json({ error: "duration must be a non-negative number" });
    }

    if (!content) {
      return res.status(400).json({ error: "content is required" });
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
        const feedback = await generateFeedback(content);
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

app.post("/api/chat", async (req, res) => {
  const { messages } = req.body || {};

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

  let stream;
  let closed = false;
  const closeStream = () => {
    if (closed) {
      return;
    }
    closed = true;
    if (stream?.abort) {
      stream.abort();
    }
  };

  req.on("close", closeStream);

  try {
    stream = await ollama.chat({
      model: ollamaModel,
      messages: [systemMessage, ...normalizedMessages],
      stream: true,
    });

    for await (const chunk of stream) {
      if (closed) {
        break;
      }
      const content = chunk?.message?.content ?? "";
      if (!content) {
        continue;
      }
      res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }

    if (!closed) {
      res.write("event: done\ndata: {}\n\n");
      res.end();
    }
  } catch (error) {
    console.error("Chat stream error:", error);
    if (!closed) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: "stream_failed" })}\n\n`);
      res.end();
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
