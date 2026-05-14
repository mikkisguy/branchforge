/**
 * Word Count Service
 *
 * Handles word count tracking for daily writing goals.
 * Provides functions for tracking word counts from label dialogue updates.
 */

import { getDb, type Db } from "../db/index.js";
import type { Transaction } from "../db/types.js";
import { userSettings } from "../db/schema/index.js";
import { eq } from "drizzle-orm";
import {
  getTodayDateKey,
  updateTodayWordCount,
  countWordsFromDialogue,
  calculateNetNewWords,
  parseLabelWordCounts,
  parseDailyWordCounts,
} from "../lib/date-utils.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Dialogue entry from the updateLabelDialogue request
 */
export interface DialogueEntry {
  speakerId: string | null;
  text: string;
}

/**
 * Options for tracking words for a label
 */
export interface TrackWordsOptions {
  /** The label being updated */
  labelId: string;
  /** The user who owns the label */
  userId: string;
  /** The dialogue content to count words from */
  dialogue: DialogueEntry[];
  /** Database connection or transaction (defaults to getDb()) */
  db?: Db | Transaction;
}

/**
 * Result of tracking words for a label
 */
export interface TrackWordsResult {
  /** Whether tracking was performed (false if user has no daily goal) */
  tracked: boolean;
  /** Number of words added to today's count (can be negative) */
  wordsAdded: number;
}

// ============================================================================
// Functions
// ============================================================================

/**
 * Track words for a label in the context of daily writing goals
 *
 * This function:
 * 1. Checks if the user has a daily writing goal enabled
 * 2. Counts words from the dialogue
 * 3. Calculates net new words using per-label tracking (to prevent double-counting)
 * 4. Updates daily word counts
 * 5. Saves both daily word counts and per-label tracking
 *
 * The caller should wrap this call in try/catch if tracking failures
 * should not abort the calling operation (e.g., dialogue save).
 *
 * @param options - Options for tracking words
 * @returns Result indicating whether tracking occurred and words added
 *
 * @example
 * ```ts
 * const result = await trackWordsForLabel({
 *   labelId: "label-123",
 *   userId: "user-456",
 *   dialogue: [
 *     { speakerId: "char-1", text: "Hello world" },
 *     { speakerId: null, text: "This is narration." },
 *   ],
 * });
 *
 * if (result.tracked) {
 *   console.log(`Added ${result.wordsAdded} words to today's count`);
 * }
 * ```
 */
export async function trackWordsForLabel(
  options: TrackWordsOptions
): Promise<TrackWordsResult> {
  const { labelId, userId, dialogue, db: providedDb } = options;
  const db = providedDb ?? getDb();

  // Execute in a transaction to prevent race conditions on concurrent updates.
  // Drizzle supports nested transactions via savepoints, so this is safe
  // even if providedDb is already a transaction.
  return db.transaction((tx: Transaction) =>
    trackWordsInternal(tx, labelId, userId, dialogue)
  );
}

/**
 * Internal helper: track words within a transaction context.
 * Uses row locking (for update) to prevent concurrent writes.
 */
async function trackWordsInternal(
  tx: Transaction,
  labelId: string,
  userId: string,
  dialogue: DialogueEntry[]
): Promise<TrackWordsResult> {
  // Get user settings with row lock to prevent concurrent updates
  const [settings] = await tx
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .for("update")
    .limit(1);

  // Only track if user has daily writing goal enabled
  if (!settings || settings.dailyWritingGoal === null) {
    return { tracked: false, wordsAdded: 0 };
  }

  const resetHour = settings.dailyWordResetHour ?? 0;
  const timezone = settings.timezone ?? "UTC";
  const todayDateKey = getTodayDateKey(resetHour, timezone);

  // Count words from saved dialogue
  const wordCount = countWordsFromDialogue(dialogue);

  // Calculate net new words using per-label tracking
  // This prevents double-counting when editing and re-saving the same content
  // Validate and sanitize the JSON data before use
  const labelWordCounts = parseLabelWordCounts(settings.labelWordCounts);

  const { wordsToAdd, updatedTracking } = calculateNetNewWords(
    labelWordCounts,
    labelId,
    todayDateKey,
    wordCount
  );

  const dailyWordCounts = parseDailyWordCounts(settings.dailyWordCounts);
  const updatedWordCounts = updateTodayWordCount(
    dailyWordCounts,
    todayDateKey,
    wordsToAdd
  );

  // Save both daily word counts and per-label tracking
  await tx
    .update(userSettings)
    .set({
      dailyWordCounts: updatedWordCounts,
      labelWordCounts: updatedTracking,
      updatedAt: new Date(),
    })
    .where(eq(userSettings.userId, userId));

  return { tracked: true, wordsAdded: wordsToAdd };
}
