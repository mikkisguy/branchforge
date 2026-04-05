import { describe, expect, it } from "vitest";
import {
  calculateNetNewWords,
  updateTodayWordCount,
  type DailyWordCount,
  type LabelWordCounts,
} from "../date-utils.js";

describe("calculateNetNewWords", () => {
  it("returns positive delta when label grows", () => {
    const tracking: LabelWordCounts = {
      "label-1": { date: "2026-04-04", count: 10 },
    };

    const result = calculateNetNewWords(
      tracking,
      "label-1",
      "2026-04-04",
      15
    );

    expect(result.wordsToAdd).toBe(5);
    expect(result.updatedTracking["label-1"]?.count).toBe(15);
  });

  it("returns negative delta when label shrinks", () => {
    const tracking: LabelWordCounts = {
      "label-1": { date: "2026-04-04", count: 15 },
    };

    const result = calculateNetNewWords(
      tracking,
      "label-1",
      "2026-04-04",
      10
    );

    expect(result.wordsToAdd).toBe(-5);
    expect(result.updatedTracking["label-1"]?.count).toBe(10);
  });

  it("keeps baseline behavior for first-time label", () => {
    const result = calculateNetNewWords({}, "label-1", "2026-04-04", 20);

    expect(result.wordsToAdd).toBe(0);
    expect(result.updatedTracking["label-1"]?.count).toBe(20);
  });

  it("resets baseline on date rollover", () => {
    const tracking: LabelWordCounts = {
      "label-1": { date: "2026-04-03", count: 10 },
    };

    const result = calculateNetNewWords(
      tracking,
      "label-1",
      "2026-04-04",
      20
    );

    expect(result.wordsToAdd).toBe(0);
    expect(result.updatedTracking["label-1"]?.count).toBe(20);
    expect(result.updatedTracking["label-1"]?.date).toBe("2026-04-04");
  });
});

describe("updateTodayWordCount", () => {
  it("applies positive and negative deltas to existing day", () => {
    const entries: DailyWordCount[] = [{ date: "2026-04-04", count: 100 }];

    const afterAdd = updateTodayWordCount(entries, "2026-04-04", 12);
    const afterSubtract = updateTodayWordCount(afterAdd, "2026-04-04", -7);

    expect(afterAdd[0]?.count).toBe(112);
    expect(afterSubtract[0]?.count).toBe(105);
  });

  it("does not go below zero", () => {
    const entries: DailyWordCount[] = [{ date: "2026-04-04", count: 3 }];

    const updated = updateTodayWordCount(entries, "2026-04-04", -10);

    expect(updated[0]?.count).toBe(0);
  });

  it("does not create new day entry for non-positive delta", () => {
    const entries: DailyWordCount[] = [{ date: "2026-04-03", count: 50 }];

    const updated = updateTodayWordCount(entries, "2026-04-04", -4);

    expect(updated).toHaveLength(1);
    expect(updated[0]?.date).toBe("2026-04-03");
  });

  it("creates new day entry for positive delta", () => {
    const entries: DailyWordCount[] = [{ date: "2026-04-03", count: 50 }];

    const updated = updateTodayWordCount(entries, "2026-04-04", 10);

    expect(updated).toHaveLength(2);
    const newEntry = updated.find((e) => e.date === "2026-04-04");
    expect(newEntry).toBeDefined();
    expect(newEntry?.count).toBe(10);
  });
});
