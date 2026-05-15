/**
 * User Settings Service
 *
 * Handles per-user settings including daily writing goals,
 * word count tracking, and timezone preferences.
 */

import { getDb } from "../db/index.js";
import { userSettings } from "../db/schema/index.js";
import { eq } from "drizzle-orm";

// ============================================================================
// Types
// ============================================================================

export interface DailyWordCount {
  date: string;
  count: number;
}

export interface PublicUserSettings {
  dailyWritingGoal: number | null;
  dailyWordResetHour: number;
  dailyWordCounts: DailyWordCount[];
  timezone: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_USER_SETTINGS = {
  dailyWritingGoal: null as number | null,
  dailyWordResetHour: 0,
  dailyWordCounts: [] as DailyWordCount[],
  timezone: "UTC",
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract only public fields from a user settings row
 */
function toPublic(
  settings: typeof userSettings.$inferSelect
): PublicUserSettings {
  return {
    dailyWritingGoal: settings.dailyWritingGoal ?? null,
    dailyWordResetHour: settings.dailyWordResetHour ?? 0,
    dailyWordCounts: (settings.dailyWordCounts as DailyWordCount[]) ?? [],
    timezone: settings.timezone ?? "UTC",
  };
}

/**
 * Ensure user settings row exists (create if not), return the row
 */
async function ensureSettingsExist(
  userId: string
): Promise<typeof userSettings.$inferSelect> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  if (existing) return existing;

  await db.insert(userSettings).values({
    userId,
    ...DEFAULT_USER_SETTINGS,
  });

  // Re-fetch to get the inserted row with server-generated values
  const [inserted] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  return inserted!;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Get current user's settings (creates defaults if not found)
 */
export async function getUserSettings(
  userId: string
): Promise<PublicUserSettings> {
  const settings = await ensureSettingsExist(userId);
  return toPublic(settings);
}

/**
 * Update user's writing goal and settings
 */
export async function updateUserSettings(
  userId: string,
  updates: {
    dailyWritingGoal?: number | null;
    dailyWordResetHour?: number;
    timezone?: string;
  }
): Promise<PublicUserSettings> {
  const db = getDb();

  // Ensure settings row exists
  await ensureSettingsExist(userId);

  // Build update object with only provided fields
  const updateData: Record<string, unknown> & { updatedAt: Date } = {
    updatedAt: new Date(),
  };

  if (updates.dailyWritingGoal !== undefined) {
    updateData.dailyWritingGoal = updates.dailyWritingGoal;
  }
  if (updates.dailyWordResetHour !== undefined) {
    updateData.dailyWordResetHour = updates.dailyWordResetHour;
  }
  if (updates.timezone !== undefined) {
    updateData.timezone = updates.timezone;
  }

  await db
    .update(userSettings)
    .set(updateData)
    .where(eq(userSettings.userId, userId));

  // Fetch updated settings
  const [updated] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  return toPublic(updated!);
}

/**
 * Reset writing statistics (daily word counts and label word counts)
 */
export async function resetWritingStats(userId: string): Promise<void> {
  const db = getDb();

  // Ensure settings row exists
  await ensureSettingsExist(userId);

  // Reset word counts to empty
  await db
    .update(userSettings)
    .set({
      dailyWordCounts: [],
      labelWordCounts: {},
      updatedAt: new Date(),
    })
    .where(eq(userSettings.userId, userId));
}
