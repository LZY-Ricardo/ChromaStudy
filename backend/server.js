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

function validateOpenAiAuth(config) {
  if (!config.baseUrl || !config.apiKey) {
    return "openai config requires baseUrl/apiKey";
  }
  return "";
}

function clampErrorText(text, max = 300) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return normalized.slice(0, max);
}

const OPENAI_MODELS_CACHE_TTL_MS = 10 * 60 * 1000;
const openAiModelsCache = new Map();
const openAiModelsInflight = new Map();

function extractOpenAiModelIds(payload) {
  if (Array.isArray(payload?.data)) {
    return payload.data
      .map((item) => (typeof item?.id === "string" ? item.id.trim() : ""))
      .filter(Boolean);
  }
  if (Array.isArray(payload?.models)) {
    return payload.models
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }
  return [];
}

async function fetchOpenAiModelsFromProvider(aiConfig) {
  const error = validateOpenAiAuth(aiConfig);
  if (error) {
    throw new Error(error);
  }

  const response = await fetch(`${aiConfig.baseUrl}/models`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${aiConfig.apiKey}`,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`openai request failed: ${response.status} ${clampErrorText(body)}`);
  }

  const data = await response.json().catch(() => ({}));
  const ids = extractOpenAiModelIds(data);
  return Array.from(new Set(ids)).sort((a, b) => a.localeCompare(b));
}

async function getOpenAiModelsCached(aiConfig, { refresh = false } = {}) {
  const key = aiConfig.baseUrl;
  if (!key) {
    throw new Error("openai config requires baseUrl/apiKey");
  }

  if (refresh) {
    openAiModelsCache.delete(key);
  }

  const now = Date.now();
  const cached = openAiModelsCache.get(key);
  if (cached && now - cached.at < OPENAI_MODELS_CACHE_TTL_MS && Array.isArray(cached.models)) {
    return cached.models;
  }

  const inflight = openAiModelsInflight.get(key);
  if (inflight) {
    return inflight;
  }

  const promise = fetchOpenAiModelsFromProvider(aiConfig)
    .then((models) => {
      openAiModelsCache.set(key, { at: Date.now(), models });
      openAiModelsInflight.delete(key);
      return models;
    })
    .catch((error) => {
      openAiModelsInflight.delete(key);
      throw error;
    });

  openAiModelsInflight.set(key, promise);
  return promise;
}

async function pingAi(aiConfig) {
  if (aiConfig.provider === "openai") {
    const error = validateOpenAiConfig(aiConfig);
    if (error) {
      return { ok: false, error };
    }

    const response = await fetch(`${aiConfig.baseUrl}/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${aiConfig.apiKey}`,
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        ok: false,
        error: `openai request failed: ${response.status} ${clampErrorText(body)}`,
      };
    }

    const data = await response.json().catch(() => ({}));
    const models = Array.isArray(data?.data)
      ? data.data.map((item) => item?.id).filter(Boolean)
      : [];

    return {
      ok: true,
      provider: "openai",
      modelCount: models.length,
    };
  }

  const response = await fetch(`${aiConfig.host}/api/tags`, { method: "GET" });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return {
      ok: false,
      error: `ollama request failed: ${response.status} ${clampErrorText(body)}`,
    };
  }

  const data = await response.json().catch(() => ({}));
  const models = Array.isArray(data?.models)
    ? data.models.map((item) => item?.name).filter(Boolean)
    : [];

  return {
    ok: true,
    provider: "ollama",
    modelCount: models.length,
    hasModel: models.includes(aiConfig.model),
  };
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

function stripCodeFences(text) {
  return String(text || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

function tryParseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, value: null };
  }
}

function parseJsonFromText(text) {
  const cleaned = stripCodeFences(text);
  const direct = tryParseJson(cleaned);
  if (direct.ok) {
    return direct.value;
  }

  const arrayStart = cleaned.indexOf("[");
  const arrayEnd = cleaned.lastIndexOf("]");
  if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
    const candidate = cleaned.slice(arrayStart, arrayEnd + 1);
    const parsed = tryParseJson(candidate);
    if (parsed.ok) {
      return parsed.value;
    }
  }

  const objStart = cleaned.indexOf("{");
  const objEnd = cleaned.lastIndexOf("}");
  if (objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
    const candidate = cleaned.slice(objStart, objEnd + 1);
    const parsed = tryParseJson(candidate);
    if (parsed.ok) {
      return parsed.value;
    }
  }

  return null;
}

function toTaskTitle(text) {
  const title = String(text || "").replace(/\s+/g, " ").trim();
  if (!title) return "";
  return title.slice(0, 80);
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

app.get(
  "/api/users",
  asyncHandler(async (req, res) => {
    const users = await prisma.user.findMany({
      select: { id: true, username: true },
      orderBy: { id: "asc" },
    });

    return res.json(users);
  })
);

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
    const {
      userId,
      date,
      duration,
      content,
      ai,
      mode,
      generateFeedback: generateFeedbackOption,
    } = req.body || {};
    const normalizedUserId = Number(userId);
    const normalizedDuration = Number.parseInt(String(duration), 10);
    const logDate = date || toDateString();
    const aiConfig = resolveAiConfig(ai);
    const operationMode = mode === "increment" ? "increment" : "replace";
    const shouldGenerateFeedback =
      typeof generateFeedbackOption === "boolean"
        ? generateFeedbackOption
        : operationMode === "replace";

    if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
      return res.status(400).json({ error: "userId must be a positive integer" });
    }

    if (!Number.isInteger(normalizedDuration)) {
      return res.status(400).json({ error: "duration must be an integer" });
    }

    if (operationMode === "replace" && normalizedDuration < 0) {
      return res.status(400).json({ error: "duration must be a non-negative integer" });
    }

    if (operationMode === "increment" && normalizedDuration <= 0) {
      return res.status(400).json({ error: "duration must be a positive integer" });
    }

    const trimmedContent = typeof content === "string" ? content.trim() : "";
    if (operationMode === "replace" && !trimmedContent) {
      return res.status(400).json({ error: "content is required" });
    }

    if (aiConfig.provider === "openai" && shouldGenerateFeedback) {
      const error = validateOpenAiConfig(aiConfig);
      if (error) {
        return res.status(400).json({ error });
      }
    }

    let log;
    if (operationMode === "increment") {
      const existing = await prisma.studyLog.findUnique({
        where: {
          userId_date: {
            userId: normalizedUserId,
            date: logDate,
          },
        },
      });

      if (existing) {
        const nextContent = trimmedContent
          ? `${existing.content}\n${trimmedContent}`
          : existing.content;

        log = await prisma.studyLog.update({
          where: {
            userId_date: {
              userId: normalizedUserId,
              date: logDate,
            },
          },
          data: {
            duration: existing.duration + normalizedDuration,
            content: nextContent,
            ...(shouldGenerateFeedback ? { aiFeedback: null } : {}),
          },
        });
      } else {
        log = await prisma.studyLog.create({
          data: {
            userId: normalizedUserId,
            date: logDate,
            duration: normalizedDuration,
            content:
              trimmedContent || `番茄钟专注 ${normalizedDuration} 分钟`,
            aiFeedback: shouldGenerateFeedback ? null : "",
          },
        });
      }
    } else {
      log = await prisma.studyLog.upsert({
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
          content: trimmedContent,
          aiFeedback: null,
        },
        update: {
          duration: normalizedDuration,
          content: trimmedContent,
          aiFeedback: null,
        },
      });
    }

    res.json(log);

    if (!shouldGenerateFeedback) {
      return;
    }

    setImmediate(async () => {
      try {
        const feedback = await generateFeedback(log.content, aiConfig);
        await prisma.studyLog.update({
          where: {
            userId_date: {
              userId: normalizedUserId,
              date: logDate,
            },
          },
          data: { aiFeedback: feedback || "" },
        });
      } catch (error) {
        console.error("AI feedback error:", error);
        await prisma.studyLog
          .update({
            where: {
              userId_date: {
                userId: normalizedUserId,
                date: logDate,
              },
            },
            data: { aiFeedback: "" },
          })
          .catch(() => {});
      }
    });
  })
);

app.get(
  "/api/study-logs/:date",
  asyncHandler(async (req, res) => {
    const userId = Number(req.query.userId);
    const date = String(req.params.date || "").trim();

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "userId must be a positive integer" });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "date must be YYYY-MM-DD" });
    }

    const log = await prisma.studyLog.findUnique({
      where: {
        userId_date: {
          userId,
          date,
        },
      },
    });

    return res.json(log);
  })
);

app.post(
  "/api/study-logs/:date/ai-feedback",
  asyncHandler(async (req, res) => {
    const userId = Number(req.body?.userId);
    const date = String(req.params.date || "").trim();
    const aiConfig = resolveAiConfig(req.body?.ai);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "userId must be a positive integer" });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "date must be YYYY-MM-DD" });
    }

    if (aiConfig.provider === "openai") {
      const error = validateOpenAiConfig(aiConfig);
      if (error) {
        return res.status(400).json({ error });
      }
    }

    const log = await prisma.studyLog.findUnique({
      where: {
        userId_date: {
          userId,
          date,
        },
      },
    });

    if (!log) {
      return res.status(404).json({ error: "study log not found" });
    }

    let feedback = "";
    try {
      feedback = await generateFeedback(log.content, aiConfig);
    } catch (error) {
      console.error("AI feedback error:", error);
    }

    const updated = await prisma.studyLog.update({
      where: {
        userId_date: {
          userId,
          date,
        },
      },
      data: { aiFeedback: feedback || "" },
    });

    return res.json(updated);
  })
);

app.get(
  "/api/study-logs",
  asyncHandler(async (req, res) => {
    const userId = Number(req.query.userId);
    const from = typeof req.query.from === "string" ? req.query.from.trim() : "";
    const to = typeof req.query.to === "string" ? req.query.to.trim() : "";

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "userId must be a positive integer" });
    }

    if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      return res.status(400).json({ error: "from must be YYYY-MM-DD" });
    }

    if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return res.status(400).json({ error: "to must be YYYY-MM-DD" });
    }

    const dateFilter = {};
    if (from) {
      dateFilter.gte = from;
    }
    if (to) {
      dateFilter.lte = to;
    }

    const logs = await prisma.studyLog.findMany({
      where: {
        userId,
        ...(from || to ? { date: dateFilter } : {}),
      },
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
    const { userId, title, plannedDate } = req.body || {};
    const normalizedUserId = Number(userId);

    if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
      return res.status(400).json({ error: "userId must be a positive integer" });
    }

    if (!title) {
      return res.status(400).json({ error: "title is required" });
    }

    // 验证 plannedDate 格式（如果提供）
    let normalizedPlannedDate = null;
    if (plannedDate) {
      const dateStr = String(plannedDate).trim();
      if (dateStr && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return res.status(400).json({ error: "plannedDate must be YYYY-MM-DD format" });
      }
      normalizedPlannedDate = dateStr || null;
    }

    const task = await prisma.task.create({
      data: {
        userId: normalizedUserId,
        title,
        plannedDate: normalizedPlannedDate,
      },
    });

    return res.json(task);
  })
);

app.patch(
  "/api/tasks/:id",
  asyncHandler(async (req, res) => {
    const taskId = Number(req.params.id);
    const { title, isDone, plannedDate } = req.body || {};

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
    if (plannedDate !== undefined) {
      if (plannedDate === null || plannedDate === "") {
        updates.plannedDate = null;
      } else {
        const dateStr = String(plannedDate).trim();
        if (dateStr && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          return res.status(400).json({ error: "plannedDate must be YYYY-MM-DD format" });
        }
        updates.plannedDate = dateStr || null;
      }
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

app.delete(
  "/api/tasks/:id",
  asyncHandler(async (req, res) => {
    const taskId = Number(req.params.id);
    const userId = Number(req.query.userId);

    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(400).json({ error: "id must be a positive integer" });
    }

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "userId must be a positive integer" });
    }

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.userId !== userId) {
      return res.status(404).json({ error: "task not found" });
    }

    await prisma.task.delete({ where: { id: taskId } });
    return res.json({ ok: true });
  })
);

app.post(
  "/api/ai/ping",
  asyncHandler(async (req, res) => {
    const { ai } = req.body || {};
    const aiConfig = resolveAiConfig(ai);
    const result = await pingAi(aiConfig);
    if (!result.ok) {
      return res.status(502).json({ error: result.error || "ping failed" });
    }
    return res.json(result);
  })
);

app.post(
  "/api/ai/models",
  asyncHandler(async (req, res) => {
    const { ai, q, limit, refresh } = req.body || {};
    const aiConfig = resolveAiConfig(ai);
    if (aiConfig.provider !== "openai") {
      return res.status(400).json({ error: "provider must be openai" });
    }

    const error = validateOpenAiAuth(aiConfig);
    if (error) {
      return res.status(400).json({ error });
    }

    const query = typeof q === "string" ? q.trim().toLowerCase() : "";
    const parsedLimit = Number.parseInt(String(limit ?? ""), 10);
    const take = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 200) : 80;
    const shouldRefresh = refresh === true;

    let models;
    try {
      models = await getOpenAiModelsCached(aiConfig, { refresh: shouldRefresh });
    } catch (err) {
      return res.status(502).json({ error: String(err?.message || "models request failed") });
    }

    const filtered = query
      ? models.filter((id) => String(id).toLowerCase().includes(query))
      : models;

    const cachedAt = openAiModelsCache.get(aiConfig.baseUrl)?.at || 0;
    return res.json({
      models: filtered.slice(0, take),
      total: filtered.length,
      cachedAt,
    });
  })
);

app.post(
  "/api/ai/tasks/decompose",
  asyncHandler(async (req, res) => {
    const { goal, ai, constraints } = req.body || {};
    const userGoal = typeof goal === "string" ? goal.trim() : "";
    if (!userGoal) {
      return res.status(400).json({ error: "goal is required" });
    }

    const aiConfig = resolveAiConfig(ai);
    if (aiConfig.provider === "openai") {
      const error = validateOpenAiConfig(aiConfig);
      if (error) {
        return res.status(400).json({ error });
      }
    }

    const extraConstraints = typeof constraints === "string" ? constraints.trim() : "";
    const prompt = [
      `目标：${userGoal}`,
      extraConstraints ? `约束：${extraConstraints}` : "",
      "",
      "请把目标拆解为 5~10 个可执行任务，任务应具体、可在 30~60 分钟内完成。",
      "只输出 JSON（不要 Markdown/解释），格式为数组：",
      '[{"title":"...", "estimateMinutes":30}]',
    ]
      .filter(Boolean)
      .join("\n");

    const text = await chatOnce(aiConfig, [
      {
        role: "system",
        content: "你是学习规划助手。你只输出严格 JSON，不输出其它文本。",
      },
      { role: "user", content: prompt },
    ]);

    const parsed = parseJsonFromText(text);
    const rawTasks = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.tasks)
        ? parsed.tasks
        : null;

    if (!rawTasks) {
      return res.status(502).json({ error: "failed to parse tasks" });
    }

    const tasks = rawTasks
      .map((item, index) => {
        const title = toTaskTitle(item?.title ?? item);
        if (!title) return null;
        const estimateMinutes = Number.parseInt(String(item?.estimateMinutes ?? ""), 10);
        return {
          title,
          estimateMinutes: Number.isFinite(estimateMinutes) && estimateMinutes > 0 ? estimateMinutes : null,
          order: index + 1,
        };
      })
      .filter(Boolean)
      .slice(0, 20);

    if (tasks.length === 0) {
      return res.status(502).json({ error: "no tasks generated" });
    }

    return res.json({ tasks });
  })
);

app.post(
  "/api/ai/review",
  asyncHandler(async (req, res) => {
    const { userId, date, ai } = req.body || {};
    const normalizedUserId = Number(userId);
    const normalizedDate = typeof date === "string" ? date.trim() : "";

    if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
      return res.status(400).json({ error: "userId must be a positive integer" });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
      return res.status(400).json({ error: "date must be YYYY-MM-DD" });
    }

    const log = await prisma.studyLog.findUnique({
      where: {
        userId_date: {
          userId: normalizedUserId,
          date: normalizedDate,
        },
      },
    });

    if (!log || !log.duration || log.duration <= 0) {
      return res.status(400).json({ error: "study log is required" });
    }

    const aiConfig = resolveAiConfig(ai);
    if (aiConfig.provider === "openai") {
      const error = validateOpenAiConfig(aiConfig);
      if (error) {
        return res.status(400).json({ error });
      }
    }

    const prompt = [
      `日期：${log.date}`,
      `学习时长：${log.duration} 分钟`,
      "学习内容：",
      log.content,
      "",
      "请生成 3 个复盘问题（每题 <= 30 字），用于帮助我回顾与巩固。",
      "只输出 JSON：{\"questions\":[\"...\",\"...\",\"...\"]}",
    ].join("\n");

    const text = await chatOnce(aiConfig, [
      {
        role: "system",
        content: "你是学习教练。你只输出严格 JSON，不输出其它文本。",
      },
      { role: "user", content: prompt },
    ]);

    const parsed = parseJsonFromText(text);
    const questions = Array.isArray(parsed?.questions) ? parsed.questions : null;
    if (!questions) {
      return res.status(502).json({ error: "failed to parse questions" });
    }

    const normalized = questions
      .map((q) => String(q || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 5);

    if (normalized.length === 0) {
      return res.status(502).json({ error: "no questions generated" });
    }

    return res.json({ date: normalizedDate, questions: normalized });
  })
);

app.post(
  "/api/ai/flashcards",
  asyncHandler(async (req, res) => {
    const { userId, date, count, ai } = req.body || {};
    const normalizedUserId = Number(userId);
    const normalizedDate = typeof date === "string" ? date.trim() : "";
    const requestedCount = Number.parseInt(String(count ?? ""), 10);
    const cardCount =
      Number.isFinite(requestedCount) && requestedCount > 0
        ? Math.min(20, requestedCount)
        : 5;

    if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
      return res.status(400).json({ error: "userId must be a positive integer" });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
      return res.status(400).json({ error: "date must be YYYY-MM-DD" });
    }

    const log = await prisma.studyLog.findUnique({
      where: {
        userId_date: {
          userId: normalizedUserId,
          date: normalizedDate,
        },
      },
    });

    if (!log || !log.duration || log.duration <= 0 || !String(log.content || "").trim()) {
      return res.status(400).json({ error: "study log is required" });
    }

    const aiConfig = resolveAiConfig(ai);
    if (aiConfig.provider === "openai") {
      const error = validateOpenAiConfig(aiConfig);
      if (error) {
        return res.status(400).json({ error });
      }
    }

    const prompt = [
      `日期：${log.date}`,
      `学习时长：${log.duration} 分钟`,
      "学习内容：",
      log.content,
      "",
      `请基于学习内容，生成 ${cardCount} 张“题卡”，用于答题复习（间隔重复）。`,
      "要求：",
      "- 中文；题干<=30字，答案<=120字；尽量具体可检验，避免太泛的问题",
      "- 只输出严格 JSON（不要 Markdown/解释）",
      "输出格式：{\"cards\":[{\"type\":\"short_answer\",\"question\":\"...\",\"answer\":\"...\"}]}",
    ].join("\n");

    const text = await chatOnce(aiConfig, [
      {
        role: "system",
        content: "你是学习教练。你只输出严格 JSON，不输出其它文本。",
      },
      { role: "user", content: prompt },
    ]);

    const parsed = parseJsonFromText(text);
    const rawCards = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.cards)
        ? parsed.cards
        : null;

    if (!rawCards) {
      return res.status(502).json({ error: "failed to parse cards" });
    }

    const normalizeText = (value, maxLen) => {
      const text = String(value || "").replace(/\s+/g, " ").trim();
      if (!text) return "";
      if (text.length <= maxLen) return text;
      return text.slice(0, maxLen);
    };

    const cards = rawCards
      .map((item) => {
        const obj = item && typeof item === "object" ? item : null;
        const type =
          typeof obj?.type === "string" && obj.type.trim()
            ? obj.type.trim()
            : "short_answer";

        const question = normalizeText(obj?.question ?? obj?.front ?? obj?.q, 30);
        const answer = normalizeText(obj?.answer ?? obj?.back ?? obj?.a, 120);
        if (!question || !answer) return null;

        return {
          type,
          question,
          answer,
        };
      })
      .filter(Boolean)
      .slice(0, cardCount);

    if (cards.length === 0) {
      return res.status(502).json({ error: "no cards generated" });
    }

    return res.json({ date: normalizedDate, cards });
  })
);

app.post(
  "/api/ai/report",
  asyncHandler(async (req, res) => {
    const { userId, type, periodStart, periodEnd, ai } = req.body || {};
    const normalizedUserId = Number(userId);
    const reportType = type === "monthly" ? "monthly" : "weekly";
    const start = typeof periodStart === "string" ? periodStart.trim() : "";
    const end = typeof periodEnd === "string" ? periodEnd.trim() : "";

    if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
      return res.status(400).json({ error: "userId must be a positive integer" });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      return res.status(400).json({ error: "periodStart/periodEnd must be YYYY-MM-DD" });
    }

    const aiConfig = resolveAiConfig(ai);
    if (aiConfig.provider === "openai") {
      const error = validateOpenAiConfig(aiConfig);
      if (error) {
        return res.status(400).json({ error });
      }
    }

    const logs = await prisma.studyLog.findMany({
      where: {
        userId: normalizedUserId,
        date: { gte: start, lte: end },
      },
      orderBy: { date: "asc" },
    });

    const totalMinutes = logs.reduce((sum, log) => sum + (Number(log.duration) || 0), 0);
    const activeDays = logs.filter((log) => (Number(log.duration) || 0) > 0).length;
    const bestDay = logs.reduce(
      (best, log) => {
        const minutes = Number(log.duration) || 0;
        if (minutes > best.minutes) {
          return { date: log.date, minutes };
        }
        return best;
      },
      { date: "", minutes: 0 }
    );

    const prompt = [
      `报告类型：${reportType === "weekly" ? "周报" : "月报"}`,
      `周期：${start} ~ ${end}`,
      `总学习时长：${totalMinutes} 分钟`,
      `活跃天数：${activeDays}`,
      `最佳日：${bestDay.date || "—"}（${bestDay.minutes} 分钟）`,
      "",
      "请输出一段中文总结（<= 300 字），包含：亮点、可改进点、下周期建议（给出 2~3 条具体建议）。",
    ].join("\n");

    const text = await chatOnce(aiConfig, [
      { role: "system", content: "你是学习教练，语气鼓励但务实。只输出正文，不要标题编号以外的杂项。" },
      { role: "user", content: prompt },
    ]);

    const report = String(text || "").trim();
    if (!report) {
      return res.status(502).json({ error: "empty report" });
    }

    return res.json({
      type: reportType,
      periodStart: start,
      periodEnd: end,
      stats: { totalMinutes, activeDays, bestDay },
      report,
    });
  })
);

app.post("/api/chat", (req, res) => {
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
