const { Router } = require("express");
const { prisma } = require("../prismaClient");
const { asyncHandler } = require("../middleware/auth");
const config = require("../config");
const { isValidDateString, resolveDateRange, toDateString } = require("../utils/dateUtils");
const { normalizeTaskPayload, buildTaskOccurrences, buildOccurrenceItem } = require("../utils/taskUtils");
const { refreshTaskReminders, cancelRemindersForOccurrence } = require("../utils/taskReminderUtils");

const router = Router();

router.get(
  "/tasks",
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

router.get(
  "/task-occurrences",
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
      lookbackDays: config.OCCURRENCE_LOOKBACK_DAYS,
      lookaheadDays: config.OCCURRENCE_LOOKAHEAD_DAYS,
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

router.post(
  "/tasks",
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const normalizedUserId = Number(req.auth?.userId);

    if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
      return res.status(401).json({ error: "unauthorized", code: "UNAUTHORIZED" });
    }

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

router.patch(
  "/tasks/:id",
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

router.patch(
  "/task-occurrences",
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

router.delete(
  "/tasks/:id",
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

module.exports = router;
