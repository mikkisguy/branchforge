/**
 * Word Count Service Unit Tests
 *
 * Tests for word count tracking logic in the context of daily writing goals.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { trackWordsForLabel } from "../word-count.service.js";
import type { DialogueEntry } from "../word-count.service.js";
import type { Db } from "../../db/index.js";

// Mock date-utils functions
const mockGetTodayDateKey = vi.fn(() => "2025-01-15");
const mockCountWordsFromDialogue = vi.fn((dialogue: DialogueEntry[]) =>
  dialogue.reduce(
    (count, entry) => count + (entry.text?.split(/\s+/).length || 0),
    0
  )
);
const mockCalculateNetNewWords = vi.fn();
const mockUpdateTodayWordCount = vi.fn();
const mockParseLabelWordCounts = vi.fn(() => ({}));
const mockParseDailyWordCounts = vi.fn(() => []);

vi.mock("../../lib/date-utils.js", () => ({
  getTodayDateKey: (...args: unknown[]) => mockGetTodayDateKey(...args),
  countWordsFromDialogue: (...args: unknown[]) =>
    mockCountWordsFromDialogue(...args),
  calculateNetNewWords: (...args: unknown[]) =>
    mockCalculateNetNewWords(...args),
  updateTodayWordCount: (...args: unknown[]) =>
    mockUpdateTodayWordCount(...args),
  parseLabelWordCounts: (...args: unknown[]) =>
    mockParseLabelWordCounts(...args),
  parseDailyWordCounts: (...args: unknown[]) =>
    mockParseDailyWordCounts(...args),
}));

// Mock database
const mockUpdate = vi.fn();
const mockSelect = vi.fn();

const mockDb = {
  select: mockSelect,
  update: mockUpdate,
};

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(() => mockDb),
  userSettings: {},
}));

describe("WordCountService", () => {
  const userId = "user-123";
  const labelId = "label-123";

  const dialogue: DialogueEntry[] = [
    { speakerId: "char-1", text: "Hello world" },
    { speakerId: null, text: "This is narration." },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up mock select chain
    mockSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            then: vi.fn((cb: (value: unknown[]) => void) => {
              cb([]);
              return Promise.resolve([]);
            }),
          })),
        })),
      })),
    });

    // Set up mock update chain
    mockUpdate.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          then: vi.fn((cb: () => void) => {
            cb();
            return Promise.resolve();
          }),
        })),
      })),
    });
  });

  describe("trackWordsForLabel", () => {
    it("should not track words when user has no settings", async () => {
      // Mock empty result
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() =>
              Promise.resolve([
                // empty array - no settings
              ])
            ),
          })),
        })),
      });

      const result = await trackWordsForLabel({
        labelId,
        userId,
        dialogue,
      });

      expect(result.tracked).toBe(false);
      expect(result.wordsAdded).toBe(0);
      expect(mockCountWordsFromDialogue).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("should not track words when dailyWritingGoal is null", async () => {
      const settingsWithNullGoal = [
        {
          id: "settings-1",
          userId,
          dailyWritingGoal: null,
          dailyWordResetHour: 0,
          timezone: "UTC",
          dailyWordCounts: [],
          labelWordCounts: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve(settingsWithNullGoal)),
          })),
        })),
      });

      const result = await trackWordsForLabel({
        labelId,
        userId,
        dialogue,
      });

      expect(result.tracked).toBe(false);
      expect(result.wordsAdded).toBe(0);
      expect(mockCountWordsFromDialogue).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("should track words when dailyWritingGoal is set", async () => {
      const settingsWithGoal = [
        {
          id: "settings-1",
          userId,
          dailyWritingGoal: 500,
          dailyWordResetHour: 0,
          timezone: "UTC",
          dailyWordCounts: [],
          labelWordCounts: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve(settingsWithGoal)),
          })),
        })),
      });

      mockGetTodayDateKey.mockReturnValue("2025-01-15");
      mockCountWordsFromDialogue.mockReturnValue(6);
      mockCalculateNetNewWords.mockReturnValue({
        wordsToAdd: 6,
        updatedTracking: { [labelId]: { date: "2025-01-15", count: 6 } },
      });
      mockUpdateTodayWordCount.mockReturnValue([
        { date: "2025-01-15", count: 6 },
      ]);

      const result = await trackWordsForLabel({
        labelId,
        userId,
        dialogue,
      });

      expect(result.tracked).toBe(true);
      expect(result.wordsAdded).toBe(6);
      expect(mockCountWordsFromDialogue).toHaveBeenCalledWith(dialogue);
      expect(mockGetTodayDateKey).toHaveBeenCalledWith(0, "UTC");
      expect(mockParseLabelWordCounts).toHaveBeenCalledWith({});
      expect(mockCalculateNetNewWords).toHaveBeenCalledWith(
        {},
        labelId,
        "2025-01-15",
        6
      );
      expect(mockParseDailyWordCounts).toHaveBeenCalledWith([]);
      expect(mockUpdateTodayWordCount).toHaveBeenCalledWith(
        [],
        "2025-01-15",
        6
      );
      expect(mockUpdate).toHaveBeenCalled();
    });

    it("should handle negative word deltas (deleting words)", async () => {
      const settingsWithGoal = [
        {
          id: "settings-1",
          userId,
          dailyWritingGoal: 500,
          dailyWordResetHour: 0,
          timezone: "UTC",
          dailyWordCounts: [{ date: "2025-01-15", count: 100 }],
          labelWordCounts: { [labelId]: { date: "2025-01-15", count: 50 } },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve(settingsWithGoal)),
          })),
        })),
      });

      mockCalculateNetNewWords.mockReturnValue({
        wordsToAdd: -20,
        updatedTracking: { [labelId]: { date: "2025-01-15", count: 30 } },
      });
      mockUpdateTodayWordCount.mockReturnValue([
        { date: "2025-01-15", count: 80 },
      ]);

      const result = await trackWordsForLabel({
        labelId,
        userId,
        dialogue,
      });

      expect(result.tracked).toBe(true);
      expect(result.wordsAdded).toBe(-20);
      // Verify the parsed daily word counts were passed to updateTodayWordCount
      expect(mockParseDailyWordCounts).toHaveBeenCalledWith([
        { date: "2025-01-15", count: 100 },
      ]);
      expect(mockUpdateTodayWordCount).toHaveBeenCalled();
    });

    it("should use custom timezone and reset hour", async () => {
      const settingsWithCustomSettings = [
        {
          id: "settings-1",
          userId,
          dailyWritingGoal: 500,
          dailyWordResetHour: 4,
          timezone: "America/New_York",
          dailyWordCounts: [],
          labelWordCounts: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve(settingsWithCustomSettings)),
          })),
        })),
      });

      mockCalculateNetNewWords.mockReturnValue({
        wordsToAdd: 10,
        updatedTracking: {},
      });
      mockUpdateTodayWordCount.mockReturnValue([]);

      await trackWordsForLabel({
        labelId,
        userId,
        dialogue,
      });

      expect(mockGetTodayDateKey).toHaveBeenCalledWith(4, "America/New_York");
    });

    it("should accept custom database connection", async () => {
      const settingsWithGoal = [
        {
          id: "settings-1",
          userId,
          dailyWritingGoal: 500,
          dailyWordResetHour: 0,
          timezone: "UTC",
          dailyWordCounts: [],
          labelWordCounts: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      // Custom mock DB
      const customDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve(settingsWithGoal)),
            })),
          })),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              then: vi.fn((cb: () => void) => {
                cb();
                return Promise.resolve();
              }),
            })),
          })),
        }),
      } as unknown as Db;

      mockCalculateNetNewWords.mockReturnValue({
        wordsToAdd: 5,
        updatedTracking: {},
      });
      mockUpdateTodayWordCount.mockReturnValue([]);

      const result = await trackWordsForLabel({
        labelId,
        userId,
        dialogue,
        db: customDb,
      });

      expect(result.tracked).toBe(true);
      expect(mockSelect).not.toHaveBeenCalled(); // Should use custom DB, not mocked one
      expect(mockUpdate).not.toHaveBeenCalled(); // Should use custom DB, not mocked one
    });

    it("should parse and validate JSONB data before use", async () => {
      const settingsWithGoal = [
        {
          id: "settings-1",
          userId,
          dailyWritingGoal: 500,
          dailyWordResetHour: 0,
          timezone: "UTC",
          dailyWordCounts: [{ date: "2025-01-14", count: 200 }],
          labelWordCounts: { [labelId]: { date: "2025-01-14", count: 100 } },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve(settingsWithGoal)),
          })),
        })),
      });

      mockCalculateNetNewWords.mockReturnValue({
        wordsToAdd: 10,
        updatedTracking: {},
      });
      mockUpdateTodayWordCount.mockReturnValue([]);

      await trackWordsForLabel({
        labelId,
        userId,
        dialogue,
      });

      expect(mockParseLabelWordCounts).toHaveBeenCalledWith({
        [labelId]: { date: "2025-01-14", count: 100 },
      });
      expect(mockParseDailyWordCounts).toHaveBeenCalledWith([
        { date: "2025-01-14", count: 200 },
      ]);
    });
  });
});
