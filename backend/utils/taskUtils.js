const { rrulestr } = require("rrule");
const { prisma } = require("../prismaClient");
const config = require("../config");
const {
  normalizeOptionalString,
  normalizeDateValue,
  normalizeTimeValue,
  normalizeStringList,
  normalizeTimeList,
  serializeStringList,
  parseStoredStringList,
  dateFromYmd,
  addDays,
  combineDateTime,
  toDateString,
  resolveDateRange,
  isDateInRange,
} = require("./dateUtils");

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

module.exports = {
  stripRRulePrefix,
  normalizeTaskPayload,
  buildRRuleFromTask,
  buildOccurrenceItem,
  buildTaskOccurrences,
  fetchOverridesForTask,
};
