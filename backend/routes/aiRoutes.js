const { Router } = require("express");
const { prisma } = require("../prismaClient");
const { asyncHandler } = require("../middleware/auth");
const { resolveAiConfig, validateOpenAiConfig, validateOpenAiAuth, pingAi, getOpenAiModelsCached, openAiModelsCache } = require("../utils/aiUtils");
const { chatOnce } = require("../utils/chatUtils");
const { parseJsonFromText, toTaskTitle } = require("../utils/stringUtils");

const router = Router();

router.post(
  "/ai/ping",
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

router.post(
  "/ai/models",
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

router.post(
  "/ai/tasks/decompose",
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

router.post(
  "/ai/review",
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

router.post(
  "/ai/flashcards",
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
      `请基于学习内容，生成 ${cardCount} 张"题卡"，用于答题复习（间隔重复）。`,
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

router.post(
  "/ai/report",
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

module.exports = router;
