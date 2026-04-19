const { Router } = require("express");
const { prisma } = require("../prismaClient");
const { asyncHandler } = require("../middleware/auth");
const { resolveAiConfig, validateOpenAiConfig } = require("../utils/aiUtils");
const { toDateString } = require("../utils/dateUtils");
const { generateFeedback } = require("../utils/chatUtils");

const router = Router();

router.post(
  "/checkin",
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

router.get(
  "/study-logs/:date",
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

router.post(
  "/study-logs/:date/ai-feedback",
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

router.get(
  "/study-logs",
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

module.exports = router;
