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

function toDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function isDateInRange(dateStr, startKey, endKey) {
  if (!dateStr) return false;
  if (startKey && dateStr < startKey) return false;
  if (endKey && dateStr > endKey) return false;
  return true;
}

module.exports = {
  isValidDateString,
  isValidTimeString,
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
};
