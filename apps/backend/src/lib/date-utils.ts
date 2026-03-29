/**
 * Date Utilities
 *
 * Helper functions for handling dates and timezones in the context of daily writing goals.
 * These utilities help determine the "current day" for a user based on their timezone
 * and configured reset hour.
 */

import { format, addDays } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { z } from "zod";

// ============================================================================
// Types
// ============================================================================

export interface DailyWordCount {
  date: string; // ISO date YYYY-MM-DD
  count: number;
}

export interface LabelWordCounts {
  [labelId: string]: {
    date: string; // Last date this label was counted
    count: number; // Word count for this label on that date
  };
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Base Zod schema for validating word count entries from JSONB storage
 *
 * This schema validates the common structure used across different
 * word count tracking contexts. It ensures each entry has a valid ISO date
 * string and a non-negative number for the word count.
 */
const WordCountEntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: "Date must be in YYYY-MM-DD format",
  }),
  count: z.number().int().nonnegative({ message: "Count must be non-negative" }),
});

/**
 * Zod schema for validating daily word count entries from JSONB storage
 *
 * This schema validates the structure of daily word count tracking data.
 * It ensures each entry has the correct shape with a valid ISO date string
 * and a non-negative number for the word count.
 */
const DailyWordCountEntrySchema = WordCountEntrySchema;

/**
 * Safely parse and validate daily word counts from unknown data
 *
 * This function validates that the input is a proper array where each element
 * conforms to the DailyWordCountEntrySchema. Invalid entries are filtered out,
 * and malformed structures result in an empty array.
 *
 * @param data - Unknown data (typically from JSONB column)
 * @returns Validated array of DailyWordCount entries
 *
 * @example
 * ```ts
 * // Valid data passes through
 * parseDailyWordCounts([{ date: "2025-01-15", count: 100 }]);
 * // Returns: [{ date: "2025-01-15", count: 100 }]
 *
 * // Invalid entries are filtered
 * parseDailyWordCounts([
 *   { date: "2025-01-15", count: 100 },
 *   { date: "invalid", count: -5 }, // Invalid
 * ]);
 * // Returns: [{ date: "2025-01-15", count: 100 }]
 *
 * // Malformed data returns empty array
 * parseDailyWordCounts(null);
 * parseDailyWordCounts("not an array");
 * parseDailyWordCounts({ foo: "bar" });
 * // Returns: []
 * ```
 */
export function parseDailyWordCounts(data: unknown): DailyWordCount[] {
  // Handle null/undefined
  if (data === null || data === undefined) {
    return [];
  }

  // Must be an array
  if (!Array.isArray(data)) {
    return [];
  }

  const result: DailyWordCount[] = [];

  for (const entry of data) {
    // Validate the entry structure
    const parsed = DailyWordCountEntrySchema.safeParse(entry);
    if (parsed.success) {
      result.push(parsed.data);
    }
    // Invalid entries are silently filtered - this is acceptable because:
    // 1. The data is non-critical (writing goal tracking)
    // 2. Silent filtering prevents cascading errors
    // 3. Valid entries are still preserved
  }

  return result;
}

/**
 * Zod schema for validating label word count entries from JSONB storage
 *
 * This schema validates the structure of per-label word count tracking data.
 * It ensures each entry has the correct shape with a valid ISO date string
 * and a non-negative number for the word count.
 */
const LabelWordCountEntrySchema = WordCountEntrySchema;

/**
 * Safely parse and validate label word counts from unknown data
 *
 * This function validates that the input is a proper object where each value
 * conforms to the LabelWordCountEntrySchema. Invalid entries are filtered out,
 * and malformed top-level structures result in an empty object.
 *
 * @param data - Unknown data (typically from JSONB column)
 * @returns Validated LabelWordCounts object
 *
 * @example
 * ```ts
 * // Valid data passes through
 * parseLabelWordCounts({ "label-1": { date: "2025-01-15", count: 100 } });
 * // Returns: { "label-1": { date: "2025-01-15", count: 100 } }
 *
 * // Invalid entries are filtered
 * parseLabelWordCounts({
 *   "label-1": { date: "2025-01-15", count: 100 },
 *   "label-2": { date: "invalid", count: -5 }, // Invalid
 * });
 * // Returns: { "label-1": { date: "2025-01-15", count: 100 } }
 *
 * // Malformed data returns empty object
 * parseLabelWordCounts(null);
 * parseLabelWordCounts("not an object");
 * parseLabelWordCounts([1, 2, 3]);
 * // Returns: {}
 * ```
 */
export function parseLabelWordCounts(data: unknown): LabelWordCounts {
  // Handle null/undefined
  if (data === null || data === undefined) {
    return {};
  }

  // Must be a plain object (not array, not primitive)
  if (typeof data !== "object" || Array.isArray(data)) {
    return {};
  }

  // Record<unknown, unknown> is the runtime type of objects after typeof check
  const obj = data as Record<string, unknown>;

  const result: LabelWordCounts = {};

  for (const [key, value] of Object.entries(obj)) {
    // Skip non-string keys (defensive)
    if (typeof key !== "string") {
      continue;
    }

    // Validate the entry structure
    const parsed = LabelWordCountEntrySchema.safeParse(value);
    if (parsed.success) {
      result[key] = parsed.data;
    }
    // Invalid entries are silently filtered - this is acceptable because:
    // 1. The data is non-critical (writing goal tracking)
    // 2. Silent filtering prevents cascading errors
    // 3. Valid entries are still preserved
  }

  return result;
}

// ============================================================================
// Functions
// ============================================================================

/**
 * Get today's date key in user's timezone (considering reset hour)
 *
 * This function determines what "today" means for a user based on their
 * timezone and configured daily reset hour. For example, if a user has
 * their reset hour set to 4 AM and it's currently 2 AM, we consider
 * them to still be on the "previous" day.
 *
 * @param resetHour - The hour (0-23) at which the day resets
 * @param userTimezone - The user's timezone (e.g., "America/New_York")
 * @returns The date key in YYYY-MM-DD format
 *
 * @example
 * ```ts
 * // User in New York, reset at 4 AM, current time is 2 AM on Jan 15
 * getTodayDateKey(4, "America/New_York") // Returns "2025-01-14"
 *
 * // User in New York, reset at 4 AM, current time is 5 AM on Jan 15
 * getTodayDateKey(4, "America/New_York") // Returns "2025-01-15"
 * ```
 */
export function getTodayDateKey(
  resetHour: number,
  userTimezone: string
): string {
  const now = new Date();
  const zonedNow = new TZDate(now, userTimezone);
  const hour = zonedNow.getHours();

  // If current hour < resetHour, we're still on "previous" writing day
  const adjustedDate = hour < resetHour ? addDays(zonedNow, -1) : zonedNow;
  return format(adjustedDate, "yyyy-MM-dd"); // YYYY-MM-DD
}

/**
 * Prune old entries from daily word counts, keeping only the last 7
 *
 * This function ensures we only keep the most recent 7 days of data.
 * Entries should already be sorted by date when stored.
 *
 * @param entries - Array of daily word count entries
 * @returns Array with at most 7 entries (most recent)
 *
 * @example
 * ```ts
 * const entries = [
 *   { date: "2025-01-10", count: 500 }, // This will be removed
 *   { date: "2025-01-11", count: 600 },
 *   { date: "2025-01-12", count: 700 },
 *   { date: "2025-01-13", count: 800 },
 *   { date: "2025-01-14", count: 900 },
 *   { date: "2025-01-15", count: 1000 },
 *   { date: "2025-01-16", count: 1100 },
 *   { date: "2025-01-17", count: 1200 },
 * ];
 * pruneOldEntries(entries); // Returns first 7 entries
 * ```
 */
export function pruneOldEntries(entries: DailyWordCount[]): DailyWordCount[] {
  return entries.slice(-7);
}

/**
 * Count total words from dialogue entries
 *
 * This is a simple word counting function that splits by whitespace.
 * It counts total activity (all words on every save), not net changes.
 * This rewards all writing effort including editing.
 *
 * @param dialogue - Array of dialogue entries with speaker and text
 * @returns Total word count
 *
 * @example
 * ```ts
 * const dialogue = [
 *   { speaker: "Alice", text: "Hello world" },
 *   { speaker: null, text: "This is narration." },
 * ];
 * countWordsFromDialogue(dialogue); // Returns 6
 * ```
 */
export function countWordsFromDialogue(
  dialogue: Array<{ speaker: string | null; text: string }>
): number {
  return dialogue.reduce((count, entry) => {
    const trimmed = entry.text?.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    return count + words;
  }, 0);
}

/**
 * Update or create today's word count entry
 *
 * Adds the word count to today's entry, or creates a new entry if today
 * doesn't exist in the array. Also prunes old entries.
 *
 * @param entries - Existing daily word count entries
 * @param todayDateKey - Today's date key (YYYY-MM-DD)
 * @param wordsToAdd - Number of words to add to today's count
 * @returns Updated array of daily word count entries
 *
 * @example
 * ```ts
 * const entries = [
 *   { date: "2025-01-14", count: 500 },
 *   { date: "2025-01-15", count: 600 },
 * ];
 * updateTodayWordCount(entries, "2025-01-15", 200);
 * // Returns [{ date: "2025-01-14", count: 500 }, { date: "2025-01-15", count: 800 }]
 * ```
 */
export function updateTodayWordCount(
  entries: DailyWordCount[],
  todayDateKey: string,
  wordsToAdd: number
): DailyWordCount[] {
  const todayIndex = entries.findIndex((e) => e.date === todayDateKey);

  let newEntries: DailyWordCount[];
  if (todayIndex >= 0) {
    // Update existing entry
    newEntries = [...entries];
    newEntries[todayIndex] = {
      date: todayDateKey,
      count: newEntries[todayIndex].count + wordsToAdd,
    };
  } else {
    // Add new entry for today
    newEntries = [...entries, { date: todayDateKey, count: wordsToAdd }];
  }

  // Prune to keep only last 7 days
  return pruneOldEntries(newEntries);
}

/**
 * Calculate net new words to count for a label, using per-label tracking
 *
 * This prevents double-counting by tracking the last counted word count for each label.
 * Only positive differences (growth) are counted - editing the same content won't inflate
 * the daily total.
 *
 * @param labelWordCounts - Existing per-label word count tracking
 * @param labelId - The label being saved
 * @param todayDateKey - Today's date key (YYYY-MM-DD)
 * @param currentWordCount - Current total word count for the label
 * @returns Object with wordsToAdd and updated labelWordCounts
 *
 * @example
 * ```ts
 * const tracking = { "label-1": { date: "2025-01-15", count: 100 } };
 * const result = calculateNetNewWords(tracking, "label-1", "2025-01-15", 150);
 * // Returns { wordsToAdd: 50, updatedTracking: { "label-1": { date: "2025-01-15", count: 150 } } }
 *
 * // Saving same content again - no new words
 * const result2 = calculateNetNewWords(result.updatedTracking, "label-1", "2025-01-15", 150);
 * // Returns { wordsToAdd: 0, updatedTracking: { "label-1": { date: "2025-01-15", count: 150 } } }
 *
 * // Deleting words - doesn't subtract
 * const result3 = calculateNetNewWords(result2.updatedTracking, "label-1", "2025-01-15", 120);
 * // Returns { wordsToAdd: 0, updatedTracking: { "label-1": { date: "2025-01-15", count: 120 } } }
 * ```
 */
export function calculateNetNewWords(
  labelWordCounts: LabelWordCounts,
  labelId: string,
  todayDateKey: string,
  currentWordCount: number
): { wordsToAdd: number; updatedTracking: LabelWordCounts } {
  const previous = labelWordCounts[labelId];
  let wordsToAdd: number;

  if (!previous) {
    // First time tracking this label - don't count existing content
    // Only track the baseline for future growth
    wordsToAdd = 0;
  } else {
    // Count only positive growth (whether same day or different day)
    // This prevents re-counting existing content and rewards only new words
    const diff = currentWordCount - previous.count;
    wordsToAdd = Math.max(0, diff);
  }

  // Update the tracking for this label
  const updatedTracking: LabelWordCounts = {
    ...labelWordCounts,
    [labelId]: {
      date: todayDateKey,
      count: currentWordCount,
    },
  };

  // Cleanup: Remove entries older than 7 days
  // Parse today's date to compare
  const todayDate = new Date(todayDateKey);
  const sevenDaysAgo = new Date(todayDate);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  for (const [key, value] of Object.entries(updatedTracking)) {
    const entryDate = new Date(value.date);
    if (entryDate < sevenDaysAgo) {
      delete updatedTracking[key];
    }
  }

  return { wordsToAdd, updatedTracking };
}
