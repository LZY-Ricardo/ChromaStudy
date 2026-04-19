const path = require("path");
const http = require("http");
const crypto = require("crypto");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { prisma } = require("./prismaClient");
const { rrulestr } = require("rrule");
const { CronJob } = require("cron");
const webpush = require("web-push");
const forumRoutes = require("./forumRoutes");

const app = express();
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} ${req.url}`, { body: req.body });
  next();
});

const ollamaHost = process.env.OLLAMA_HOST || "http://localhost:11434";
const ollamaModel = process.env.OLLAMA_MODEL || "llama3";

const PORT = Number(process.env.PORT) || 3001;
const OCCURRENCE_LOOKBACK_DAYS = 30;
const OCCURRENCE_LOOKAHEAD_DAYS = 90;
const REMINDER_LOOKAHEAD_DAYS = 30;
const DONE_RETENTION_DAYS = 30;

const JWT_ISSUER = process.env.JWT_ISSUER || "chroma-study";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || "chroma-study-api";
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "dev-access-secret-change-me";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "dev-refresh-secret-change-me";
const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || "15m";
const REFRESH_TOKEN_TTL = process.env.REFRESH_TOKEN_TTL || "30d";
const BCRYPT_COST = Number(process.env.BCRYPT_COST) || 10;

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
const PUSH_READY = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
const PUSH_URGENCY = "normal";
const PUSH_TTL_SECONDS = 60 * 60;

if (PUSH_READY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

if (!process.env.JWT_ACCESS_SECRET || !process.env.JWT_REFRESH_SECRET) {
  console.warn(
    "[AUTH] JWT_ACCESS_SECRET/JWT_REFRESH_SECRET are not set. Using built-in dev defaults; do NOT use in production."
  );
}

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

function isValidDateString(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function isValidTimeString(value) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.trim());
}

function normalizeOptionalString(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function normalizeDateValue(value) {
  if (value === null || value === "") return null;
  if (!isValidDateString(value)) return null;
  return String(value).trim();
}

function normalizeTimeValue(value) {
  if (value === null || value === "") return null;
  const text = String(value).trim();
  if (!text) return null;
  return isValidTimeString(text) ? text : null;
}

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeTimeList(value) {
  const items = normalizeStringList(value);
  const normalized = [];
  const seen = new Set();
  for (const item of items) {
    if (!isValidTimeString(item)) {
      return { ok: false, list: [], error: `invalid time: ${item}` };
    }
    if (seen.has(item)) continue;
    seen.add(item);
    normalized.push(item);
  }
  return { ok: true, list: normalized, error: "" };
}

function serializeStringList(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  return JSON.stringify(list);
}

function parseStoredStringList(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item || "").trim()).filter(Boolean);
    }
  } catch {
    // ignore
  }
  return [];
}

function dateFromYmd(value) {
  if (!isValidDateString(value)) return null;
  const [year, month, day] = value.split("-").map((item) => Number(item));
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function combineDateTime(dateStr, timeStr) {
  const base = dateFromYmd(dateStr);
  if (!base || !isValidTimeString(timeStr)) return null;
  const [hours, minutes] = timeStr.split(":").map((item) => Number(item));
  base.setHours(hours, minutes, 0, 0);
  return base;
}

function resolveDateRange({ start, end, lookbackDays, lookaheadDays }) {
  const today = new Date();
  const startDate = dateFromYmd(start) || addDays(today, -(lookbackDays ?? 0));
  const endDate = dateFromYmd(end) || addDays(today, lookaheadDays ?? 0);
  if (startDate) startDate.setHours(0, 0, 0, 0);
  if (endDate) endDate.setHours(0, 0, 0, 0);
  return {
    startDate,
    endDate,
    startKey: startDate ? toDateString(startDate) : "",
    endKey: endDate ? toDateString(endDate) : "",
  };
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

function stripRRulePrefix(value) {
  return String(value || "").trim().replace(/^RRULE:/i, "").trim();
}

function normalizeTaskPayload(input, { requireTitle = false } = {}) {
  const data = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(input || {}, key);

  if (requireTitle || has("title")) {
    const title = typeof input?.title === "string" ? input.title.trim() : "";
    if (requireTitle && !title) {
      return { ok: false, error: "title is required", data: {} };
    }
    if (title) {
      data.title = title;
    }
  }

  if (has("description")) {
    data.description = normalizeOptionalString(input.description);
  }

  if (has("plannedDate")) {
    const normalized = normalizeDateValue(input.plannedDate);
    if (input.plannedDate && !normalized) {
      return { ok: false, error: "plannedDate must be YYYY-MM-DD format", data: {} };
    }
    data.plannedDate = normalized;
  }

  if (has("dueTime")) {
    const normalized = normalizeTimeValue(input.dueTime);
    if (input.dueTime && !normalized) {
      return { ok: false, error: "dueTime must be HH:mm format", data: {} };
    }
    data.dueTime = normalized;
  }

  if (has("priority")) {
    if (input.priority === null || input.priority === "") {
      data.priority = null;
    } else {
      const parsed = Number.parseInt(String(input.priority), 10);
      if (!Number.isFinite(parsed)) {
        return { ok: false, error: "priority must be a number", data: {} };
      }
      data.priority = parsed;
    }
  }

  if (has("category")) {
    data.category = normalizeOptionalString(input.category);
  }

  if (has("labels")) {
    const list = normalizeStringList(input.labels);
    data.labels = serializeStringList(list);
  }

  if (has("repeatRule")) {
    const value = normalizeOptionalString(input.repeatRule);
    data.repeatRule = value ? stripRRulePrefix(value) : null;
  }

  if (has("repeatStartDate")) {
    const normalized = normalizeDateValue(input.repeatStartDate);
    if (input.repeatStartDate && !normalized) {
      return { ok: false, error: "repeatStartDate must be YYYY-MM-DD format", data: {} };
    }
    data.repeatStartDate = normalized;
  }

  if (has("repeatTimeZone")) {
    data.repeatTimeZone = normalizeOptionalString(input.repeatTimeZone);
  }

  if (has("reminderTimes")) {
    const normalized = normalizeTimeList(input.reminderTimes);
    if (!normalized.ok) {
      return { ok: false, error: "reminderTimes must be HH:mm list", data: {} };
    }
    data.reminderTimes = serializeStringList(normalized.list);
  }

  return { ok: true, error: "", data };
}

function buildRRuleFromTask(task) {
  const ruleText = stripRRulePrefix(task?.repeatRule);
  const startDate = normalizeDateValue(task?.repeatStartDate || task?.plannedDate);
  if (!ruleText || !startDate) return null;
  const start = dateFromYmd(startDate);
  if (!start) return null;
  const dtstart = start.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  try {
    return rrulestr(`DTSTART:${dtstart}\nRRULE:${ruleText}`);
  } catch (error) {
    console.error("Invalid RRULE:", error?.message);
    return null;
  }
}

function buildOccurrenceItem(task, override, occurrenceDate, plannedDate, options = {}) {
  const labels = parseStoredStringList(override?.labels || task.labels);
  const reminderTimes = parseStoredStringList(task.reminderTimes);
  const isRecurring = Boolean(task.repeatRule);

  return {
    id: isRecurring ? `${task.id}:${occurrenceDate}` : task.id,
    taskId: task.id,
    occurrenceDate: occurrenceDate || null,
    plannedDate: plannedDate || null,
    title: override?.title ?? task.title,
    description: override?.description ?? task.description ?? "",
    dueTime: override?.dueTime ?? task.dueTime ?? null,
    priority: override?.priority ?? task.priority ?? null,
    category: override?.category ?? task.category ?? null,
    labels,
    reminderTimes,
    isDone: isRecurring ? Boolean(override?.isDone) : task.isDone,
    isRecurring,
    isCancelled: Boolean(override?.isCancelled),
    isRescheduled: Boolean(options.isRescheduled),
    repeatRule: task.repeatRule || null,
    repeatStartDate: task.repeatStartDate || null,
    repeatTimeZone: task.repeatTimeZone || null,
  };
}

function buildTaskOccurrences(task, overrides, rangeStart, rangeEnd) {
  if (!task.repeatRule) {
    if (!task.plannedDate) {
      return [buildOccurrenceItem(task, null, null, null)];
    }
    return [buildOccurrenceItem(task, null, task.plannedDate, task.plannedDate)];
  }

  const rule = buildRRuleFromTask(task);
  if (!rule) {
    if (!task.plannedDate) {
      return [buildOccurrenceItem(task, null, null, null)];
    }
    return [buildOccurrenceItem(task, null, task.plannedDate, task.plannedDate)];
  }

  const overrideMap = new Map(
    (Array.isArray(overrides) ? overrides : []).map((item) => [item.occurrenceDate, item])
  );
  const baseDates = rule.between(rangeStart, rangeEnd, true).map((date) => toDateString(date));
  const seen = new Set();
  const items = [];

  for (const date of baseDates) {
    if (seen.has(date)) continue;
    seen.add(date);
    const override = overrideMap.get(date);
    if (override?.isCancelled) {
      continue;
    }
    if (override?.overrideDate) {
      continue;
    }
    items.push(buildOccurrenceItem(task, override, date, date));
  }

  for (const override of overrideMap.values()) {
    if (!override?.overrideDate) continue;
    const overrideDate = normalizeDateValue(override.overrideDate);
    if (!overrideDate) continue;
    const dateObj = dateFromYmd(overrideDate);
    if (!dateObj) continue;
    if (dateObj < rangeStart || dateObj > rangeEnd) continue;
    items.push(buildOccurrenceItem(task, override, override.occurrenceDate, overrideDate, { isRescheduled: true }));
  }

  return items;
}

async function fetchOverridesForTask(taskId, startKey, endKey) {
  if (!taskId) return [];
  return prisma.taskOccurrenceOverride.findMany({
    where: {
      taskId,
      OR: [
        {
          occurrenceDate: {
            gte: startKey,
            lte: endKey,
          },
        },
        {
          overrideDate: {
            gte: startKey,
            lte: endKey,
          },
        },
      ],
    },
  });
}

function isDateInRange(dateStr, startKey, endKey) {
  if (!dateStr) return false;
  if (startKey && dateStr < startKey) return false;
  if (endKey && dateStr > endKey) return false;
  return true;
}

async function cancelRemindersForOccurrence(taskId, occurrenceDate) {
  if (!taskId || !occurrenceDate) return;
  await prisma.taskReminderInstance.updateMany({
    where: { taskId, occurrenceDate, status: "pending" },
    data: { status: "cancelled" },
  });
}

async function refreshTaskReminders(task) {
  const reminderTimes = parseStoredStringList(task?.reminderTimes);
  const now = new Date();

  await prisma.taskReminderInstance.deleteMany({
    where: {
      taskId: task.id,
      status: "pending",
      remindAt: { gte: now },
    },
  });

  if (reminderTimes.length === 0) {
    return;
  }

  const range = resolveDateRange({
    lookbackDays: 0,
    lookaheadDays: REMINDER_LOOKAHEAD_DAYS,
  });

  const overrides = await fetchOverridesForTask(task.id, range.startKey, range.endKey);
  const occurrences = buildTaskOccurrences(task, overrides, range.startDate, range.endDate);
  const data = [];

  for (const item of occurrences) {
    if (!item.plannedDate) continue;
    if (!isDateInRange(item.plannedDate, range.startKey, range.endKey)) continue;
    if (item.isDone || item.isCancelled) continue;

    for (const time of reminderTimes) {
      const remindAt = combineDateTime(item.plannedDate, time);
      if (!remindAt || remindAt <= now) continue;
      data.push({
        taskId: task.id,
        occurrenceDate: item.occurrenceDate || item.plannedDate,
        remindAt,
      });
    }
  }

  if (data.length > 0) {
    await prisma.taskReminderInstance.createMany({
      data,
    });
  }
}

async function refreshAllReminders() {
  const tasks = await prisma.task.findMany({
    where: {
      reminderTimes: { not: null },
    },
  });

  for (const task of tasks) {
    await refreshTaskReminders(task);
  }
}

async function cleanupOldRecords() {
  const cutoff = addDays(new Date(), -DONE_RETENTION_DAYS);
  await prisma.taskOccurrenceOverride.deleteMany({
    where: {
      doneAt: { lt: cutoff },
    },
  });
  await prisma.taskReminderInstance.deleteMany({
    where: {
      status: { not: "pending" },
      remindAt: { lt: cutoff },
    },
  });
}

function buildReminderPayload(task, occurrenceDate) {
  const dateLabel = occurrenceDate || "";
  const timeLabel = task?.dueTime ? ` ${task.dueTime}` : "";
  const suffix = dateLabel ? ` · ${dateLabel}${timeLabel}` : "";
  return JSON.stringify({
    title: "任务提醒",
    body: `${task?.title || "任务"}${suffix}`,
    taskId: task?.id,
    occurrenceDate,
    url: "/",
  });
}

function parseSubscriptionRecord(record) {
  if (!record?.endpoint || !record?.keys) return null;
  let parsed;
  try {
    parsed = JSON.parse(record.keys);
  } catch {
    return null;
  }
  if (!parsed?.p256dh || !parsed?.auth) return null;
  return {
    endpoint: record.endpoint,
    keys: {
      p256dh: parsed.p256dh,
      auth: parsed.auth,
    },
  };
}

let reminderTickRunning = false;

async function sendDueReminders() {
  if (!PUSH_READY || reminderTickRunning) return;
  reminderTickRunning = true;

  try {
    const now = new Date();
    const due = await prisma.taskReminderInstance.findMany({
      where: {
        status: "pending",
        remindAt: { lte: now },
      },
      include: {
        task: true,
      },
    });

    for (const reminder of due) {
      const task = reminder.task;
      if (!task) {
        await prisma.taskReminderInstance.update({
          where: { id: reminder.id },
          data: { status: "cancelled" },
        });
        continue;
      }

      if (task.repeatRule) {
        const override = await prisma.taskOccurrenceOverride.findUnique({
          where: {
            taskId_occurrenceDate: {
              taskId: task.id,
              occurrenceDate: reminder.occurrenceDate,
            },
          },
        });
        if (override?.isDone || override?.isCancelled) {
          await prisma.taskReminderInstance.update({
            where: { id: reminder.id },
            data: { status: "cancelled" },
          });
          continue;
        }
      } else if (task.isDone) {
        await prisma.taskReminderInstance.update({
          where: { id: reminder.id },
          data: { status: "cancelled" },
        });
        continue;
      }

      const subscriptions = await prisma.pushSubscription.findMany({
        where: { userId: task.userId },
      });

      if (subscriptions.length === 0) {
        await prisma.taskReminderInstance.update({
          where: { id: reminder.id },
          data: { status: "skipped", lastError: "no_subscription" },
        });
        continue;
      }

      const payload = buildReminderPayload(task, reminder.occurrenceDate);
      let delivered = false;
      let lastError = "";

      for (const record of subscriptions) {
        const subscription = parseSubscriptionRecord(record);
        if (!subscription) {
          await prisma.pushSubscription.delete({ where: { id: record.id } });
          continue;
        }

        try {
          await webpush.sendNotification(subscription, payload, {
            TTL: PUSH_TTL_SECONDS,
            urgency: PUSH_URGENCY,
          });
          delivered = true;
          await prisma.pushSubscription.update({
            where: { id: record.id },
            data: { lastUsedAt: new Date() },
          });
        } catch (error) {
          lastError = String(error?.message || "push_failed");
          const status = error?.statusCode || error?.status;
          if (status === 404 || status === 410) {
            await prisma.pushSubscription.delete({ where: { id: record.id } });
          }
        }
      }

      await prisma.taskReminderInstance.update({
        where: { id: reminder.id },
        data: {
          status: delivered ? "sent" : "failed",
          sentAt: delivered ? new Date() : null,
          lastError: delivered ? null : lastError || "push_failed",
        },
      });
    }
  } finally {
    reminderTickRunning = false;
  }
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
      console.error('Error details:', error.message);
      console.error('Stack:', error.stack);
      res.status(500).json({ error: "Internal Server Error", message: error.message });
    });
  };
}

function looksLikeBcryptHash(value) {
  return typeof value === "string" && /^\$2[aby]\$/.test(value);
}

async function hashPassword(password) {
  return bcrypt.hash(String(password), BCRYPT_COST);
}

async function verifyPassword(password, storedHashOrPlain) {
  const stored = String(storedHashOrPlain || "");
  if (looksLikeBcryptHash(stored)) {
    return bcrypt.compare(String(password), stored);
  }
  return String(password) === stored;
}

function normalizeUsername(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePassword(value) {
  return typeof value === "string" ? value : "";
}

function generateTokenId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString("hex");
}

function signAccessToken(user) {
  return jwt.sign(
    { type: "access", username: user.username },
    JWT_ACCESS_SECRET,
    {
      algorithm: "HS256",
      expiresIn: ACCESS_TOKEN_TTL,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      subject: String(user.id),
    }
  );
}

function signRefreshToken(user, tokenId) {
  return jwt.sign({ type: "refresh" }, JWT_REFRESH_SECRET, {
    algorithm: "HS256",
    expiresIn: REFRESH_TOKEN_TTL,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    subject: String(user.id),
    jwtid: tokenId,
  });
}

function createTokenPair(user) {
  const tokenId = generateTokenId();
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user, tokenId);

  const decoded = jwt.decode(refreshToken);
  const expSeconds = Number(decoded?.exp) || 0;
  const refreshExpiresAt = expSeconds ? new Date(expSeconds * 1000) : new Date(Date.now() + 30 * 86400 * 1000);

  return { accessToken, refreshToken, refreshTokenId: tokenId, refreshExpiresAt };
}

function extractBearerToken(value) {
  if (typeof value !== "string") return "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? String(match[1] || "").trim() : "";
}

function requireAccessToken(req, res, next) {
  const token = extractBearerToken(req.headers?.authorization);
  if (!token) {
    return res.status(401).json({ error: "missing access token", code: "MISSING_ACCESS_TOKEN" });
  }

  try {
    const payload = jwt.verify(token, JWT_ACCESS_SECRET, {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    if (payload?.type !== "access") {
      return res.status(401).json({ error: "invalid token type", code: "INVALID_ACCESS_TOKEN" });
    }

    const subject = typeof payload?.sub === "string" ? payload.sub : "";
    const userId = Number(subject);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ error: "invalid token subject", code: "INVALID_ACCESS_TOKEN" });
    }

    req.auth = {
      userId,
      username: typeof payload?.username === "string" ? payload.username : "",
    };

    return next();
  } catch (error) {
    if (error?.name === "TokenExpiredError") {
      return res.status(401).json({ error: "access token expired", code: "ACCESS_TOKEN_EXPIRED" });
    }
    if (error?.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "invalid access token", code: "INVALID_ACCESS_TOKEN" });
    }
    return res.status(401).json({ error: "unauthorized", code: "UNAUTHORIZED" });
  }
}

function ensureUserIdConsistency(req, res, next) {
  const authUserId = Number(req.auth?.userId);
  if (!Number.isInteger(authUserId) || authUserId <= 0) {
    return res.status(401).json({ error: "unauthorized", code: "UNAUTHORIZED" });
  }

  const candidates = [];
  if (req.query && Object.prototype.hasOwnProperty.call(req.query, "userId")) {
    candidates.push(Number(req.query.userId));
  }
  if (req.body && typeof req.body === "object" && Object.prototype.hasOwnProperty.call(req.body, "userId")) {
    candidates.push(Number(req.body.userId));
  }

  if (candidates.some((id) => Number.isInteger(id) && id > 0 && id !== authUserId)) {
    return res.status(403).json({ error: "forbidden", code: "USER_MISMATCH" });
  }

  return next();
}

const PUBLIC_API_PATHS = new Set([
  "/api/health",
  "/api/login",
  "/api/register",
  "/api/refresh",
  "/api/logout",
  "/api/push/vapid-public-key",
]);

app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    return next();
  }
  if (!req.path.startsWith("/api/")) {
    return next();
  }
  if (PUBLIC_API_PATHS.has(req.path)) {
    return next();
  }
  return requireAccessToken(req, res, () => ensureUserIdConsistency(req, res, next));
});

app.use("/api/forum", forumRoutes);

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.post(
  "/api/register",
  asyncHandler(async (req, res) => {
    console.log('[REGISTER] Request body:', req.body);
    const username = normalizeUsername(req.body?.username);
    const password = normalizePassword(req.body?.password);
    console.log('[REGISTER] Normalized - username:', username, 'password length:', password.length);

    if (!username || !password) {
      return res.status(400).json({ error: "username and password are required" });
    }

    if (username.length < 3 || username.length > 32) {
      return res.status(400).json({ error: "username must be 3-32 characters" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "password must be at least 6 characters" });
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return res.status(409).json({ error: "username already exists" });
    }

    const created = await prisma.user.create({
      data: { username, password: await hashPassword(password) },
    });

    const user = { id: created.id, username: created.username };
    const tokens = createTokenPair(user);

    await prisma.refreshToken.create({
      data: {
        tokenId: tokens.refreshTokenId,
        userId: user.id,
        expiresAt: tokens.refreshExpiresAt,
      },
    });

    return res.status(201).json({
      user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  })
);

app.post(
  "/api/login",
  asyncHandler(async (req, res) => {
    const username = normalizeUsername(req.body?.username);
    const password = normalizePassword(req.body?.password);

    if (!username || !password) {
      return res.status(400).json({ error: "username and password are required" });
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (!existing) {
      return res.status(401).json({ error: "invalid credentials" });
    }

    const ok = await verifyPassword(password, existing.password);
    if (!ok) {
      return res.status(401).json({ error: "invalid credentials" });
    }

    if (!looksLikeBcryptHash(existing.password)) {
      prisma.user
        .update({
          where: { id: existing.id },
          data: { password: await hashPassword(password) },
        })
        .catch(() => {});
    }

    const user = { id: existing.id, username: existing.username };
    const tokens = createTokenPair(user);

    await prisma.refreshToken.create({
      data: {
        tokenId: tokens.refreshTokenId,
        userId: user.id,
        expiresAt: tokens.refreshExpiresAt,
      },
    });

    return res.json({
      user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  })
);

app.post(
  "/api/refresh",
  asyncHandler(async (req, res) => {
    const refreshToken = typeof req.body?.refreshToken === "string" ? req.body.refreshToken.trim() : "";
    if (!refreshToken) {
      return res.status(400).json({ error: "refreshToken is required" });
    }

    let payload;
    try {
      payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET, {
        algorithms: ["HS256"],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });
    } catch (error) {
      if (error?.name === "TokenExpiredError") {
        return res.status(401).json({ error: "refresh token expired", code: "REFRESH_TOKEN_EXPIRED" });
      }
      return res.status(401).json({ error: "invalid refresh token", code: "INVALID_REFRESH_TOKEN" });
    }

    if (payload?.type !== "refresh") {
      return res.status(401).json({ error: "invalid token type", code: "INVALID_REFRESH_TOKEN" });
    }

    const subject = typeof payload?.sub === "string" ? payload.sub : "";
    const userId = Number(subject);
    const tokenId = typeof payload?.jti === "string" ? payload.jti : "";

    if (!Number.isInteger(userId) || userId <= 0 || !tokenId) {
      return res.status(401).json({ error: "invalid refresh token", code: "INVALID_REFRESH_TOKEN" });
    }

    const record = await prisma.refreshToken.findUnique({ where: { tokenId } });
    if (!record || record.userId !== userId) {
      return res.status(401).json({ error: "invalid refresh token", code: "INVALID_REFRESH_TOKEN" });
    }
    if (record.revokedAt) {
      return res.status(401).json({ error: "refresh token revoked", code: "REFRESH_TOKEN_REVOKED" });
    }
    if (record.expiresAt && record.expiresAt.getTime() <= Date.now()) {
      return res.status(401).json({ error: "refresh token expired", code: "REFRESH_TOKEN_EXPIRED" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true },
    });
    if (!user) {
      return res.status(401).json({ error: "invalid refresh token", code: "INVALID_REFRESH_TOKEN" });
    }

    const next = createTokenPair(user);

    await prisma.$transaction([
      prisma.refreshToken.update({
        where: { tokenId },
        data: {
          revokedAt: new Date(),
          replacedByTokenId: next.refreshTokenId,
        },
      }),
      prisma.refreshToken.create({
        data: {
          tokenId: next.refreshTokenId,
          userId,
          expiresAt: next.refreshExpiresAt,
        },
      }),
    ]);

    return res.json({
      user,
      accessToken: next.accessToken,
      refreshToken: next.refreshToken,
    });
  })
);

app.post(
  "/api/logout",
  asyncHandler(async (req, res) => {
    const refreshToken = typeof req.body?.refreshToken === "string" ? req.body.refreshToken.trim() : "";
    if (!refreshToken) {
      return res.json({ ok: true });
    }

    try {
      const payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET, {
        algorithms: ["HS256"],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });

      const tokenId = typeof payload?.jti === "string" ? payload.jti : "";
      if (tokenId) {
        await prisma.refreshToken.updateMany({
          where: { tokenId },
          data: { revokedAt: new Date() },
        });
      }
    } catch {
      // ignore invalid refresh tokens
    }

    return res.json({ ok: true });
  })
);

app.get(
  "/api/me",
  asyncHandler(async (req, res) => {
    const userId = Number(req.auth?.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ error: "unauthorized", code: "UNAUTHORIZED" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true },
    });

    if (!user) {
      return res.status(404).json({ error: "user not found" });
    }

    return res.json({ user });
  })
);

app.post(
  "/api/checkin",
  asyncHandler(async (req, res) => {
    const {
      date,
      duration,
      content,
      ai,
      mode,
      generateFeedback: generateFeedbackOption,
    } = req.body || {};
    const normalizedUserId = Number(req.auth?.userId);
    const normalizedDuration = Number.parseInt(String(duration), 10);
    const logDate = date || toDateString();
    const aiConfig = resolveAiConfig(ai);
    const operationMode = mode === "increment" ? "increment" : "replace";
    const shouldGenerateFeedback =
      typeof generateFeedbackOption === "boolean"
        ? generateFeedbackOption
        : operationMode === "replace";

    if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
      return res.status(401).json({ error: "unauthorized", code: "UNAUTHORIZED" });
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
    const userId = Number(req.auth?.userId);
    const date = String(req.params.date || "").trim();

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ error: "unauthorized", code: "UNAUTHORIZED" });
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
    const userId = Number(req.auth?.userId);
    const date = String(req.params.date || "").trim();
    const aiConfig = resolveAiConfig(req.body?.ai);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ error: "unauthorized", code: "UNAUTHORIZED" });
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
    const userId = Number(req.auth?.userId);
    const from = typeof req.query.from === "string" ? req.query.from.trim() : "";
    const to = typeof req.query.to === "string" ? req.query.to.trim() : "";

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ error: "unauthorized", code: "UNAUTHORIZED" });
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
    const userId = Number(req.auth?.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ error: "unauthorized", code: "UNAUTHORIZED" });
    }

    const tasks = await prisma.task.findMany({
      where: { userId },
      orderBy: { id: "asc" },
    });

    return res.json(tasks);
  })
);

app.get(
  "/api/task-occurrences",
  asyncHandler(async (req, res) => {
    const userId = Number(req.auth?.userId);
    const start = typeof req.query.start === "string" ? req.query.start.trim() : "";
    const end = typeof req.query.end === "string" ? req.query.end.trim() : "";

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ error: "unauthorized", code: "UNAUTHORIZED" });
    }

    if (start && !isValidDateString(start)) {
      return res.status(400).json({ error: "start must be YYYY-MM-DD format" });
    }
    if (end && !isValidDateString(end)) {
      return res.status(400).json({ error: "end must be YYYY-MM-DD format" });
    }

    const range = resolveDateRange({
      start,
      end,
      lookbackDays: OCCURRENCE_LOOKBACK_DAYS,
      lookaheadDays: OCCURRENCE_LOOKAHEAD_DAYS,
    });

    const tasks = await prisma.task.findMany({
      where: { userId },
      orderBy: { id: "asc" },
    });

    if (tasks.length === 0) {
      return res.json({ items: [] });
    }

    const taskIds = tasks.map((task) => task.id);
    const overrides = await prisma.taskOccurrenceOverride.findMany({
      where: {
        taskId: { in: taskIds },
        OR: [
          {
            occurrenceDate: {
              gte: range.startKey,
              lte: range.endKey,
            },
          },
          {
            overrideDate: {
              gte: range.startKey,
              lte: range.endKey,
            },
          },
        ],
      },
    });

    const overridesByTask = new Map();
    for (const override of overrides) {
      if (!override) continue;
      const list = overridesByTask.get(override.taskId) || [];
      list.push(override);
      overridesByTask.set(override.taskId, list);
    }

    const items = [];
    for (const task of tasks) {
      const taskOverrides = overridesByTask.get(task.id) || [];
      items.push(...buildTaskOccurrences(task, taskOverrides, range.startDate, range.endDate));
    }

    return res.json({ items });
  })
);

app.get(
  "/api/push/vapid-public-key",
  asyncHandler(async (req, res) => {
    if (!PUSH_READY) {
      return res.status(500).json({ error: "push is not configured" });
    }
    return res.json({ publicKey: VAPID_PUBLIC_KEY });
  })
);

app.post(
  "/api/push/subscribe",
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const userId = Number(req.auth?.userId);
    const subscription = payload.subscription || {};
    const endpoint = typeof subscription.endpoint === "string" ? subscription.endpoint.trim() : "";
    const keys = subscription.keys || {};

    if (!PUSH_READY) {
      return res.status(500).json({ error: "push is not configured" });
    }
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ error: "unauthorized", code: "UNAUTHORIZED" });
    }
    if (!endpoint || typeof keys?.p256dh !== "string" || typeof keys?.auth !== "string") {
      return res.status(400).json({ error: "invalid subscription" });
    }

    const record = await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        userId,
        endpoint,
        keys: JSON.stringify({ p256dh: keys.p256dh, auth: keys.auth }),
        expirationTime:
          subscription.expirationTime != null ? String(subscription.expirationTime) : null,
      },
      update: {
        userId,
        keys: JSON.stringify({ p256dh: keys.p256dh, auth: keys.auth }),
        expirationTime:
          subscription.expirationTime != null ? String(subscription.expirationTime) : null,
        lastUsedAt: new Date(),
      },
    });

    return res.json({ ok: true, id: record.id });
  })
);

app.post(
  "/api/push/unsubscribe",
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const userId = Number(req.auth?.userId);
    const endpoint =
      typeof payload.endpoint === "string"
        ? payload.endpoint.trim()
        : typeof payload.subscription?.endpoint === "string"
          ? payload.subscription.endpoint.trim()
          : "";

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ error: "unauthorized", code: "UNAUTHORIZED" });
    }
    if (!endpoint) {
      return res.status(400).json({ error: "endpoint is required" });
    }

    await prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    });

    return res.json({ ok: true });
  })
);

app.post(
  "/api/tasks",
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const normalizedUserId = Number(req.auth?.userId);

    if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
      return res.status(401).json({ error: "unauthorized", code: "UNAUTHORIZED" });
    }

    // 验证 plannedDate 格式（如果提供）
    const normalized = normalizeTaskPayload(payload, { requireTitle: true });
    if (!normalized.ok) {
      return res.status(400).json({ error: normalized.error });
    }

    const data = {
      userId: normalizedUserId,
      ...normalized.data,
    };

    if (data.repeatRule) {
      if (!data.repeatStartDate) {
        data.repeatStartDate = data.plannedDate || toDateString();
      }
      if (!data.plannedDate) {
        data.plannedDate = data.repeatStartDate;
      }
    }

    if (data.reminderTimes && !(data.plannedDate || data.repeatStartDate)) {
      return res
        .status(400)
        .json({ error: "reminderTimes requires plannedDate or repeatStartDate" });
    }

    const task = await prisma.task.create({ data });
    try {
      await refreshTaskReminders(task);
    } catch (error) {
      console.error("refreshTaskReminders failed:", error);
    }

    return res.json(task);
  })
);

app.patch(
  "/api/tasks/:id",
  asyncHandler(async (req, res) => {
    const taskId = Number(req.params.id);
    const userId = Number(req.auth?.userId);
    const payload = req.body || {};

    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(400).json({ error: "id must be a positive integer" });
    }

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ error: "unauthorized", code: "UNAUTHORIZED" });
    }

    const normalized = normalizeTaskPayload(payload);
    if (!normalized.ok) {
      return res.status(400).json({ error: normalized.error });
    }

    const updates = {
      ...normalized.data,
    };

    if (typeof payload.isDone === "boolean") {
      updates.isDone = payload.isDone;
    }

    const hasField = (key) => Object.prototype.hasOwnProperty.call(payload, key);
    const existing = await prisma.task.findUnique({ where: { id: taskId } });
    if (!existing || existing.userId !== userId) {
      return res.status(404).json({ error: "task not found" });
    }

    if (hasField("repeatRule")) {
      if (!updates.repeatRule) {
        updates.repeatRule = null;
        updates.repeatStartDate = null;
        updates.repeatTimeZone = null;
      } else if (!updates.repeatStartDate) {
        updates.repeatStartDate =
          existing.repeatStartDate || updates.plannedDate || existing.plannedDate || toDateString();
      }
    }

    if (updates.repeatRule && !updates.plannedDate && !existing.plannedDate) {
      updates.plannedDate = updates.repeatStartDate || toDateString();
    }

    if (
      updates.reminderTimes &&
      !(updates.plannedDate || existing.plannedDate || updates.repeatStartDate || existing.repeatStartDate)
    ) {
      return res
        .status(400)
        .json({ error: "reminderTimes requires plannedDate or repeatStartDate" });
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "no fields to update" });
    }

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: updates,
    });

    try {
      await refreshTaskReminders(updated);
    } catch (error) {
      console.error("refreshTaskReminders failed:", error);
    }

    return res.json(updated);
  })
);

app.patch(
  "/api/task-occurrences",
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const userId = Number(req.auth?.userId);
    const taskId = Number(payload.taskId);
    const occurrenceDate =
      typeof payload.occurrenceDate === "string" ? payload.occurrenceDate.trim() : "";
    const updatesPayload =
      payload.updates && typeof payload.updates === "object" ? payload.updates : null;

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ error: "unauthorized", code: "UNAUTHORIZED" });
    }
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(400).json({ error: "taskId must be a positive integer" });
    }
    if (!isValidDateString(occurrenceDate)) {
      return res.status(400).json({ error: "occurrenceDate must be YYYY-MM-DD format" });
    }
    if (!updatesPayload) {
      return res.status(400).json({ error: "updates is required" });
    }

    const task = await prisma.task.findFirst({
      where: { id: taskId, userId },
    });
    if (!task) {
      return res.status(404).json({ error: "task not found" });
    }
    if (!task.repeatRule) {
      return res.status(400).json({ error: "task is not recurring" });
    }

    const normalized = normalizeTaskPayload(updatesPayload);
    if (!normalized.ok) {
      return res.status(400).json({ error: normalized.error });
    }

    const hasField = (key) => Object.prototype.hasOwnProperty.call(updatesPayload, key);
    const overrideData = {};

    if (hasField("title")) {
      overrideData.title = normalized.data.title ?? null;
    }
    if (hasField("description")) {
      overrideData.description = normalized.data.description ?? null;
    }
    if (hasField("dueTime")) {
      overrideData.dueTime = normalized.data.dueTime ?? null;
    }
    if (hasField("priority")) {
      overrideData.priority = normalized.data.priority ?? null;
    }
    if (hasField("category")) {
      overrideData.category = normalized.data.category ?? null;
    }
    if (hasField("labels")) {
      overrideData.labels = normalized.data.labels ?? null;
    }
    if (hasField("plannedDate")) {
      const plannedDate = normalized.data.plannedDate ?? null;
      overrideData.overrideDate =
        plannedDate && plannedDate !== occurrenceDate ? plannedDate : null;
    }
    if (typeof updatesPayload.isDone === "boolean") {
      overrideData.isDone = updatesPayload.isDone;
      overrideData.doneAt = updatesPayload.isDone ? new Date() : null;
    }
    if (typeof updatesPayload.isCancelled === "boolean") {
      overrideData.isCancelled = updatesPayload.isCancelled;
    }

    const meaningfulKeys = [
      "title",
      "description",
      "dueTime",
      "priority",
      "category",
      "labels",
      "overrideDate",
    ];
    const hasMeaningful = meaningfulKeys.some(
      (key) => overrideData[key] !== null && overrideData[key] !== undefined
    );
    const hasStatus = overrideData.isDone === true || overrideData.isCancelled === true;

    const where = { taskId_occurrenceDate: { taskId, occurrenceDate } };
    const existing = await prisma.taskOccurrenceOverride.findUnique({ where });

    if (!hasMeaningful && !hasStatus) {
      if (existing) {
        await prisma.taskOccurrenceOverride.delete({ where });
        try {
          await refreshTaskReminders(task);
        } catch (error) {
          console.error("refreshTaskReminders failed:", error);
        }
      }

      return res.json({
        item: buildOccurrenceItem(task, null, occurrenceDate, occurrenceDate),
      });
    }

    const saved = existing
      ? await prisma.taskOccurrenceOverride.update({
          where,
          data: overrideData,
        })
      : await prisma.taskOccurrenceOverride.create({
          data: {
            taskId,
            occurrenceDate,
            ...overrideData,
          },
        });

    if (overrideData.isDone === true || overrideData.isCancelled === true) {
      await cancelRemindersForOccurrence(taskId, occurrenceDate);
    }

    try {
      await refreshTaskReminders(task);
    } catch (error) {
      console.error("refreshTaskReminders failed:", error);
    }

    const plannedDate = saved.overrideDate || occurrenceDate;
    return res.json({
      item: buildOccurrenceItem(task, saved, occurrenceDate, plannedDate, {
        isRescheduled: Boolean(saved.overrideDate),
      }),
    });
  })
);

app.delete(
  "/api/tasks/:id",
  asyncHandler(async (req, res) => {
    const taskId = Number(req.params.id);
    const userId = Number(req.auth?.userId);

    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(400).json({ error: "id must be a positive integer" });
    }

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ error: "unauthorized", code: "UNAUTHORIZED" });
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
    const { date, ai } = req.body || {};
    const normalizedUserId = Number(req.auth?.userId);
    const normalizedDate = typeof date === "string" ? date.trim() : "";

    if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
      return res.status(401).json({ error: "unauthorized", code: "UNAUTHORIZED" });
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
    const { date, count, ai } = req.body || {};
    const normalizedUserId = Number(req.auth?.userId);
    const normalizedDate = typeof date === "string" ? date.trim() : "";
    const requestedCount = Number.parseInt(String(count ?? ""), 10);
    const cardCount =
      Number.isFinite(requestedCount) && requestedCount > 0
        ? Math.min(20, requestedCount)
        : 5;

    if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
      return res.status(401).json({ error: "unauthorized", code: "UNAUTHORIZED" });
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
    const { type, periodStart, periodEnd, ai } = req.body || {};
    const normalizedUserId = Number(req.auth?.userId);
    const reportType = type === "monthly" ? "monthly" : "weekly";
    const start = typeof periodStart === "string" ? periodStart.trim() : "";
    const end = typeof periodEnd === "string" ? periodEnd.trim() : "";

    if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
      return res.status(401).json({ error: "unauthorized", code: "UNAUTHORIZED" });
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

    // 立即发送一个空注释来保持连接活跃
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

if (PUSH_READY) {
  CronJob.from({
    cronTime: "* * * * *",
    onTick: () => {
      sendDueReminders().catch((error) => console.error("reminder tick failed", error));
    },
    start: true,
  });
} else {
  console.warn("Push is not configured. Reminder delivery disabled.");
}

CronJob.from({
  cronTime: "10 0 * * *",
  onTick: () => {
    refreshAllReminders().catch((error) => console.error("reminder refresh failed", error));
  },
  start: true,
});

CronJob.from({
  cronTime: "20 0 * * *",
  onTick: () => {
    cleanupOldRecords().catch((error) => console.error("cleanup failed", error));
  },
  start: true,
});

setTimeout(() => {
  refreshAllReminders().catch((error) => console.error("reminder warmup failed", error));
}, 2000);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
