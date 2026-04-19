import { describe, it, expect } from "vitest";
const {
  isValidDateString,
  isValidTimeString,
  normalizeOptionalString,
  normalizeDateValue,
  normalizeTimeValue,
  normalizeStringList,
  serializeStringList,
  parseStoredStringList,
  dateFromYmd,
  addDays,
  combineDateTime,
  toDateString,
  resolveDateRange,
  isDateInRange,
} = require("../../utils/dateUtils");

describe("dateUtils", () => {
  describe("isValidDateString", () => {
    it("accepts valid YYYY-MM-DD", () => {
      expect(isValidDateString("2026-01-15")).toBe(true);
      expect(isValidDateString("2026-12-31")).toBe(true);
    });
    it("rejects invalid formats", () => {
      expect(isValidDateString("")).toBe(false);
      expect(isValidDateString(null)).toBe(false);
      expect(isValidDateString("2026/01/15")).toBe(false);
      expect(isValidDateString("26-01-15")).toBe(false);
      expect(isValidDateString("abc")).toBe(false);
    });
  });

  describe("isValidTimeString", () => {
    it("accepts valid HH:mm", () => {
      expect(isValidTimeString("00:00")).toBe(true);
      expect(isValidTimeString("23:59")).toBe(true);
      expect(isValidTimeString("09:30")).toBe(true);
    });
    it("rejects invalid formats", () => {
      expect(isValidTimeString("")).toBe(false);
      expect(isValidTimeString("24:00")).toBe(false);
      expect(isValidTimeString("9:30")).toBe(false);
    });
  });

  describe("normalizeOptionalString", () => {
    it("returns trimmed string", () => {
      expect(normalizeOptionalString("  hello  ")).toBe("hello");
    });
    it("returns null for null/empty", () => {
      expect(normalizeOptionalString(null)).toBe(null);
      expect(normalizeOptionalString("")).toBe(null);
      expect(normalizeOptionalString("   ")).toBe(null);
    });
  });

  describe("normalizeDateValue", () => {
    it("returns valid date string", () => {
      expect(normalizeDateValue("2026-01-15")).toBe("2026-01-15");
    });
    it("returns null for invalid input", () => {
      expect(normalizeDateValue("not-a-date")).toBe(null);
      expect(normalizeDateValue("")).toBe(null);
    });
  });

  describe("normalizeTimeValue", () => {
    it("returns valid time string", () => {
      expect(normalizeTimeValue("14:30")).toBe("14:30");
    });
    it("returns null for invalid input", () => {
      expect(normalizeTimeValue("25:00")).toBe(null);
      expect(normalizeTimeValue("")).toBe(null);
    });
  });

  describe("normalizeStringList", () => {
    it("parses comma-separated string", () => {
      expect(normalizeStringList("a, b, c")).toEqual(["a", "b", "c"]);
    });
    it("handles array input", () => {
      expect(normalizeStringList(["a", "b"])).toEqual(["a", "b"]);
    });
    it("filters empty items", () => {
      expect(normalizeStringList("a, , b")).toEqual(["a", "b"]);
    });
    it("returns empty array for non-string/array", () => {
      expect(normalizeStringList(123)).toEqual([]);
    });
  });

  describe("serializeStringList / parseStoredStringList", () => {
    it("round-trips a list", () => {
      const list = ["a", "b", "c"];
      const stored = serializeStringList(list);
      expect(JSON.parse(stored)).toEqual(list);
      expect(parseStoredStringList(stored)).toEqual(list);
    });
    it("returns empty for empty array", () => {
      expect(serializeStringList([])).toBe(null);
    });
    it("returns empty for non-JSON plain string", () => {
      expect(parseStoredStringList("just-a-string")).toEqual([]);
    });
  });

  describe("dateFromYmd", () => {
    it("creates Date at midnight", () => {
      const d = dateFromYmd("2026-01-15");
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(0);
      expect(d.getDate()).toBe(15);
      expect(d.getHours()).toBe(0);
    });
    it("handles leap year", () => {
      const d = dateFromYmd("2024-02-29");
      expect(d.getMonth()).toBe(1);
      expect(d.getDate()).toBe(29);
    });
    it("returns null for invalid input", () => {
      expect(dateFromYmd("not-a-date")).toBe(null);
    });
  });

  describe("addDays", () => {
    it("adds days correctly", () => {
      const base = dateFromYmd("2026-01-31");
      const next = addDays(base, 1);
      expect(next.getMonth()).toBe(1);
      expect(next.getDate()).toBe(1);
    });
    it("handles month boundaries", () => {
      const base = dateFromYmd("2026-03-31");
      const next = addDays(base, 1);
      expect(next.getMonth()).toBe(3);
      expect(next.getDate()).toBe(1);
    });
  });

  describe("combineDateTime", () => {
    it("combines date and time", () => {
      const result = combineDateTime("2026-01-15", "14:30");
      expect(result.getHours()).toBe(14);
      expect(result.getMinutes()).toBe(30);
    });
    it("returns null for invalid input", () => {
      expect(combineDateTime("2026-01-15", "25:00")).toBe(null);
    });
  });

  describe("toDateString", () => {
    it("formats Date to YYYY-MM-DD", () => {
      const d = new Date(2026, 0, 5);
      expect(toDateString(d)).toBe("2026-01-05");
    });
    it("defaults to today", () => {
      expect(toDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe("resolveDateRange", () => {
    it("uses provided dates", () => {
      const range = resolveDateRange({ start: "2026-01-01", end: "2026-01-31" });
      expect(range.startKey).toBe("2026-01-01");
      expect(range.endKey).toBe("2026-01-31");
    });
    it("falls back to lookback/lookahead", () => {
      const range = resolveDateRange({ lookbackDays: 7, lookaheadDays: 7 });
      expect(range.startKey).toBeTruthy();
      expect(range.endKey).toBeTruthy();
    });
  });

  describe("isDateInRange", () => {
    it("returns true for date in range", () => {
      expect(isDateInRange("2026-01-15", "2026-01-01", "2026-01-31")).toBe(true);
    });
    it("returns false for date outside range", () => {
      expect(isDateInRange("2026-02-01", "2026-01-01", "2026-01-31")).toBe(false);
    });
    it("returns false for null date", () => {
      expect(isDateInRange(null, "2026-01-01", "2026-01-31")).toBe(false);
    });
  });
});
