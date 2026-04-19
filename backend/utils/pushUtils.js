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

module.exports = {
  buildReminderPayload,
  parseSubscriptionRecord,
};
