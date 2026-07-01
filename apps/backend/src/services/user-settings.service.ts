/**
 * User Settings Service
 *
 * Handles per-user settings including daily writing goals,
 * word count tracking, and timezone preferences.
 */

import { getDb } from "../db/index.js";
import { userSettings } from "../db/schema/index.js";
import { eq } from "drizzle-orm";
import { ConflictError } from "../middleware/error-handler.middleware.js";
import { isValidTheme } from "@branchforge/shared";
import {
  validateAndProcessAvatar,
  deleteAvatar as deleteAvatarFile,
} from "./image-processing.service.js";
import {
  ensureAvatarDir,
  getAvatarPath,
  getAvatarFullPath,
} from "../lib/storage.js";
import { getBasePath } from "../lib/config.js";
import { promises as fs } from "node:fs";
import { randomBytes } from "node:crypto";
import { logWarn, LogEventType } from "../lib/logger.js";

// ============================================================================
// Types
// ============================================================================

export interface DailyWordCount {
  date: string;
  count: number;
}

export interface PublicUserSettings {
  avatarUrl: string | null;
  username: string | null;
  language: string;
  theme: string;
  dailyWritingGoal: number | null;
  dailyWordResetHour: number;
  dailyWordCounts: DailyWordCount[];
  timezone: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_USER_SETTINGS = {
  avatarUrl: null as string | null,
  username: null as string | null,
  language: "en",
  theme: "periwinkle",
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
    avatarUrl: buildAvatarUrl(settings.avatarUrl),
    username: settings.username ?? null,
    language: settings.language ?? "en",
    theme: isValidTheme(settings.theme ?? "") ? settings.theme! : "periwinkle",
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

  // INSERT ... ON CONFLICT DO NOTHING prevents duplicate-key errors when
  // two concurrent requests race to create the settings row for the same user.
  await db
    .insert(userSettings)
    .values({
      userId,
      ...DEFAULT_USER_SETTINGS,
    })
    .onConflictDoNothing();

  // Re-fetch to get the row (either newly inserted or inserted by a concurrent request)
  const [inserted] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  if (!inserted) {
    throw new ConflictError("Failed to create or retrieve user settings");
  }
  return inserted;
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
    avatarUrl?: string | null;
    username?: string | null;
    language?: string;
    theme?: string;
  }
): Promise<PublicUserSettings> {
  const db = getDb();

  // Ensure settings row exists
  await ensureSettingsExist(userId);

  // Build update object with only provided fields
  const updateData: Partial<typeof userSettings.$inferInsert> & {
    updatedAt: Date;
  } = {
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
  if (updates.avatarUrl !== undefined) {
    updateData.avatarUrl = updates.avatarUrl;
  }
  if (updates.username !== undefined) {
    updateData.username = updates.username;
  }
  if (updates.language !== undefined) {
    updateData.language = updates.language;
  }
  if (updates.theme !== undefined) {
    updateData.theme = updates.theme;
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

  if (!updated) {
    throw new ConflictError("Failed to retrieve updated user settings");
  }
  return toPublic(updated);
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

// ============================================================================
// Avatar Management
// ============================================================================

/**
 * Build avatar URL from stored filename
 */
function buildAvatarUrl(filename: string | null): string | null {
  if (!filename) return null;
  return getAvatarPath(filename, getBasePath());
}

/**
 * Upload an avatar for the current user. Handles image processing, file I/O,
 * database updates, backup/restore on failure, and cleanup.
 */
export async function uploadUserAvatar(
  userId: string,
  buffer: Buffer,
  mimetype: string
): Promise<{ avatarUrl: string }> {
  const db = getDb();

  // Ensure settings row exists
  const settings = await ensureSettingsExist(userId);

  // Process image
  const result = await validateAndProcessAvatar(buffer, mimetype);

  // Ensure upload directory exists
  await ensureAvatarDir();

  // Backup existing avatar file
  let previousAvatarBackupPath: string | undefined;
  if (settings.avatarUrl) {
    const previousAvatarPath = getAvatarFullPath(settings.avatarUrl);
    try {
      await fs.access(previousAvatarPath);
      previousAvatarBackupPath = `${previousAvatarPath}.backup-${Date.now()}-${process.pid}-${randomBytes(4).toString("hex")}`;
      await fs.copyFile(previousAvatarPath, previousAvatarBackupPath);
    } catch (accessError) {
      if ((accessError as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new Error(
          `Failed to backup existing avatar file: ${(accessError as Error).message}`,
          { cause: accessError }
        );
      }
      // File doesn't exist — proceed without backup
    }
  }

  // Write new file
  const filePath = getAvatarFullPath(result.filename);
  await fs.writeFile(filePath, result.buffer);

  // Remove old avatar file
  if (settings.avatarUrl) {
    try {
      await deleteAvatarFile(getAvatarFullPath(settings.avatarUrl));
    } catch {
      logWarn(LogEventType.SERVICE_ERROR, {
        message: `Failed to delete old avatar (backup preserved): ${settings.avatarUrl}`,
        userId,
      });
    }
  }

  // Update DB
  try {
    const [updatedSettings] = await db
      .update(userSettings)
      .set({ avatarUrl: result.filename, updatedAt: new Date() })
      .where(eq(userSettings.userId, userId))
      .returning();

    // Clean up backup on success
    if (previousAvatarBackupPath) {
      try {
        await deleteAvatarFile(previousAvatarBackupPath);
      } catch {
        logWarn(LogEventType.SERVICE_ERROR, {
          message: `Failed to delete avatar backup: ${previousAvatarBackupPath}`,
          userId,
        });
      }
    }

    const avatarUrl = buildAvatarUrl(updatedSettings.avatarUrl);
    if (!avatarUrl) {
      throw new Error("avatarUrl unexpectedly null after successful upload");
    }

    return { avatarUrl };
  } catch (error) {
    // DB update failed — restore backup and clean up new file
    if (previousAvatarBackupPath) {
      const previousAvatarPath = getAvatarFullPath(settings.avatarUrl!);
      try {
        await fs.copyFile(previousAvatarBackupPath, previousAvatarPath);
      } catch {
        logWarn(LogEventType.SERVICE_ERROR, {
          message: `Failed to restore previous avatar: ${settings.avatarUrl}`,
          userId,
        });
      }
      try {
        await deleteAvatarFile(previousAvatarBackupPath);
      } catch {
        logWarn(LogEventType.SERVICE_ERROR, {
          message: `Failed to delete avatar backup: ${previousAvatarBackupPath}`,
          userId,
        });
      }
    }

    try {
      await deleteAvatarFile(filePath);
    } catch {
      logWarn(LogEventType.SERVICE_ERROR, {
        message: `Failed to delete new avatar file after DB failure: ${result.filename}`,
        userId,
      });
    }

    throw error;
  }
}

/**
 * Delete the current user's avatar (file + DB).
 */
export async function deleteUserAvatar(userId: string): Promise<void> {
  const settings = await ensureSettingsExist(userId);

  const db = getDb();

  await db
    .update(userSettings)
    .set({ avatarUrl: null, updatedAt: new Date() })
    .where(eq(userSettings.userId, userId));

  if (settings.avatarUrl) {
    try {
      await deleteAvatarFile(getAvatarFullPath(settings.avatarUrl));
    } catch {
      logWarn(LogEventType.SERVICE_ERROR, {
        message: `Failed to delete avatar file: ${settings.avatarUrl}`,
        userId,
      });
    }
  }
}
