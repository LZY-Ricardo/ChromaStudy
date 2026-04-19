import { describe, it, expect } from "vitest";
const {
  normalizeBaseUrl,
  clampErrorText,
  normalizeFeedback,
  stripCodeFences,
  tryParseJson,
  parseJsonFromText,
  toTaskTitle,
} = require("../../utils/stringUtils");

describe("stringUtils", () => {
  describe("normalizeBaseUrl", () => {
    it("trims and removes trailing slashes", () => {
      expect(normalizeBaseUrl("https://api.example.com/")).toBe("https://api.example.com");
      expect(normalizeBaseUrl("  https://api.example.com///  ")).toBe("https://api.example.com");
    });
    it("returns empty for non-string", () => {
      expect(normalizeBaseUrl(null)).toBe("");
      expect(normalizeBaseUrl(123)).toBe("");
    });
  });

  describe("clampErrorText", () => {
    it("trims and clamps long text", () => {
      const long = "a".repeat(400);
      expect(clampErrorText(long, 300).length).toBe(300);
    });
    it("returns short text as-is", () => {
      expect(clampErrorText("short")).toBe("short");
    });
  });

  describe("normalizeFeedback", () => {
    it("keeps short text", () => {
      expect(normalizeFeedback("不错！")).toBe("不错！");
    });
    it("trims to 50 chars", () => {
      expect(normalizeFeedback("a".repeat(100)).length).toBe(50);
    });
  });

  describe("stripCodeFences", () => {
    it("removes code fences", () => {
      expect(stripCodeFences("```json\n{ }\n```")).toBe("{ }");
    });
    it("handles empty/null", () => {
      expect(stripCodeFences(null)).toBe("");
    });
  });

  describe("tryParseJson", () => {
    it("parses valid JSON", () => {
      expect(tryParseJson('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    });
    it("returns error for invalid JSON", () => {
      expect(tryParseJson("not json")).toEqual({ ok: false, value: null });
    });
  });

  describe("parseJsonFromText", () => {
    it("parses clean JSON", () => {
      expect(parseJsonFromText('{"a":1}')).toEqual({ a: 1 });
    });
    it("extracts JSON from code fences", () => {
      const text = '```json\n[1,2,3]\n```';
      expect(parseJsonFromText(text)).toEqual([1, 2, 3]);
    });
    it("extracts JSON from markdown", () => {
      const text = 'Here is the result:\n[1,2,3]\nDone.';
      expect(parseJsonFromText(text)).toEqual([1, 2, 3]);
    });
    it("returns null for no JSON", () => {
      expect(parseJsonFromText("no json here")).toBeNull();
    });
  });

  describe("toTaskTitle", () => {
    it("trims and limits to 80 chars", () => {
      const long = "a".repeat(100);
      expect(toTaskTitle(long).length).toBe(80);
    });
    it("returns empty for falsy input", () => {
      expect(toTaskTitle("")).toBe("");
      expect(toTaskTitle(null)).toBe("");
    });
  });
});
