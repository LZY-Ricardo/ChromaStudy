function normalizeBaseUrl(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/\/+$/, "");
}

function clampErrorText(text, max = 300) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return normalized.slice(0, max);
}

function normalizeFeedback(text) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= 50) {
    return compact;
  }
  return compact.slice(0, 50);
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

module.exports = {
  normalizeBaseUrl,
  clampErrorText,
  normalizeFeedback,
  stripCodeFences,
  tryParseJson,
  parseJsonFromText,
  toTaskTitle,
};
