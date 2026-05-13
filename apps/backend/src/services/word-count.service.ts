/**
 * Word Count Service
 *
 * Handles word count tracking for daily writing goals.
 * Provides functions for tracking word counts from label dialogue updates.
 */

import type { NodePgTransaction } from "drizzle-orm/node-postgres";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { getDb } from "../db/index.js";
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
import type { Db } from "../db/index.js";

// Transaction type that matches what TypeScript infers from db.transaction()
// The schema is inferred as Record<string, unknown> due to TypeScript's limitations
type Transaction = NodePgTransaction<
  Record<string, unknown>,
  ExtractTablesWithRelations<Record<string, unknown>>
>;

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
 * This is non-critical: if tracking fails, the calling operation
 * (e.g., dialogue save) is still successful.
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

  // Get user settings
  const [settings] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
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
  await db
    .update(userSettings)
    .set({
      dailyWordCounts: updatedWordCounts,
      labelWordCounts: updatedTracking,
      updatedAt: new Date(),
    })
    .where(eq(userSettings.userId, userId));

  return { tracked: true, wordsAdded: wordsToAdd };
}
