const { prisma } = require("../prismaClient");
const config = require("../config");
const webpush = require("web-push");
const { parseStoredStringList, resolveDateRange, addDays, combineDateTime, isDateInRange } = require("./dateUtils");
const { buildTaskOccurrences, fetchOverridesForTask } = require("./taskUtils");
const { buildReminderPayload, parseSubscriptionRecord } = require("./pushUtils");

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
    lookaheadDays: config.REMINDER_LOOKAHEAD_DAYS,
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
  const cutoff = addDays(new Date(), -config.DONE_RETENTION_DAYS);
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

let reminderTickRunning = false;

async function sendDueReminders() {
  if (!config.PUSH_READY || reminderTickRunning) return;
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
            TTL: config.PUSH_TTL_SECONDS,
            urgency: config.PUSH_URGENCY,
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

module.exports = {
  cancelRemindersForOccurrence,
  refreshTaskReminders,
  refreshAllReminders,
  cleanupOldRecords,
  sendDueReminders,
};
