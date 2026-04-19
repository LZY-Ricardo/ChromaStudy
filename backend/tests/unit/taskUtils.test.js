import { describe, it, expect } from "vitest";
const { normalizeTaskPayload, stripRRulePrefix, buildOccurrenceItem, buildRRuleFromTask, buildTaskOccurrences } = require("../../utils/taskUtils");

describe("taskUtils", () => {
  describe("stripRRulePrefix", () => {
    it("removes RRULE: prefix", () => {
      expect(stripRRulePrefix("RRULE:FREQ=WEEKLY")).toBe("FREQ=WEEKLY");
    });
    it("handles lowercase prefix", () => {
      expect(stripRRulePrefix("rrule:FREQ=DAILY")).toBe("FREQ=DAILY");
    });
    it("handles string without prefix", () => {
      expect(stripRRulePrefix("FREQ=WEEKLY")).toBe("FREQ=WEEKLY");
    });
  });

  describe("normalizeTaskPayload", () => {
    it("normalizes a full task payload", () => {
      const result = normalizeTaskPayload({
        title: "  Learn React  ",
        description: "Study hooks",
        priority: 3,
        category: "dev",
        labels: ["react", "hooks"],
      });
      expect(result.ok).toBe(true);
      expect(result.data.title).toBe("Learn React");
      expect(result.data.priority).toBe(3);
    });
    it("requires title when specified", () => {
      const result = normalizeTaskPayload({}, { requireTitle: true });
      expect(result.ok).toBe(false);
      expect(result.error).toBe("title is required");
    });
    it("validates plannedDate format", () => {
      const result = normalizeTaskPayload({ plannedDate: "not-a-date" });
      expect(result.ok).toBe(false);
      expect(result.error).toContain("plannedDate");
    });
    it("validates dueTime format", () => {
      const result = normalizeTaskPayload({ dueTime: "25:00" });
      expect(result.ok).toBe(false);
      expect(result.error).toContain("dueTime");
    });
    it("strips RRULE prefix from repeatRule", () => {
      const result = normalizeTaskPayload({ repeatRule: "RRULE:FREQ=WEEKLY" });
      expect(result.ok).toBe(true);
      expect(result.data.repeatRule).toBe("FREQ=WEEKLY");
    });
  });

  describe("buildOccurrenceItem", () => {
    it("builds a non-recurring item", () => {
      const task = { id: 1, title: "Task", description: "Desc", dueTime: "10:00", priority: 1, category: "work", labels: '["a"]', isDone: false, repeatRule: null };
      const item = buildOccurrenceItem(task, null, "2026-01-15", "2026-01-15");
      expect(String(item.id)).toBe("1");
      expect(item.title).toBe("Task");
      expect(item.isRecurring).toBe(false);
      expect(item.labels).toEqual(["a"]);
    });
    it("builds a recurring item with override", () => {
      const task = { id: 1, title: "Task", description: "", dueTime: null, priority: null, category: null, labels: null, isDone: false, repeatRule: "FREQ=WEEKLY" };
      const override = { title: "Updated Task", isDone: true };
      const item = buildOccurrenceItem(task, override, "2026-01-15", "2026-01-15");
      expect(item.id).toBe("1:2026-01-15");
      expect(item.title).toBe("Updated Task");
      expect(item.isDone).toBe(true);
      expect(item.isRecurring).toBe(true);
    });
  });

  describe("buildTaskOccurrences", () => {
    it("returns single item for non-recurring task", () => {
      const task = { id: 1, title: "Task", description: "", dueTime: null, priority: null, category: null, labels: null, isDone: false, repeatRule: null, plannedDate: "2026-01-15" };
      const items = buildTaskOccurrences(task, [], dateFromYmd("2026-01-01"), dateFromYmd("2026-01-31"));
      expect(items).toHaveLength(1);
      expect(items[0].plannedDate).toBe("2026-01-15");
    });
    it("returns single item for non-recurring task without plannedDate", () => {
      const task = { id: 1, title: "Task", description: "", dueTime: null, priority: null, category: null, labels: null, isDone: false, repeatRule: null };
      const items = buildTaskOccurrences(task, [], dateFromYmd("2026-01-01"), dateFromYmd("2026-01-31"));
      expect(items).toHaveLength(1);
      expect(items[0].plannedDate).toBeNull();
    });
  });

  describe("buildRRuleFromTask", () => {
    it("returns null for non-recurring task", () => {
      expect(buildRRuleFromTask({ repeatRule: null })).toBeNull();
    });
    it("returns null for invalid RRULE", () => {
      expect(buildRRuleFromTask({ repeatRule: "INVALID", plannedDate: "2026-01-01" })).toBeNull();
    });
  });
});

function dateFromYmd(value) {
  const [year, month, day] = value.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  d.setHours(0, 0, 0, 0);
  return d;
}
