/**
 * Avatar Management
 *
 * Handles avatar upload (with backup/restore) and deletion for a character.
 * File I/O and image processing are extracted here; authorization is enforced
 * by the caller (CharactersService) before calling these functions.
 */

import { eq } from "drizzle-orm";
import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import {
  validateAndProcessAvatar,
  deleteAvatar as deleteAvatarFile,
} from "../image-processing.service.js";
import {
  ensureAvatarDir,
  getAvatarPath,
  getAvatarFullPath,
} from "../../lib/storage.js";
import { getBasePath } from "../../lib/config.js";
import { logWarn, LogEventType } from "../../lib/logger.js";
import { NotFoundError } from "../../middleware/error-handler.middleware.js";
import { characters } from "../../db/schema/index.js";
import type { Character } from "../../db/schema/index.js";
import type { Db } from "../../db/index.js";
import type { Transaction } from "../../db/types.js";

// ============================================================================
// Helpers
// ============================================================================

/** Build public avatar URL from stored filename. */
export function buildAvatarUrl(filename: string | null): string | null {
  if (!filename) return null;
  return getAvatarPath(filename, getBasePath());
}

// ============================================================================
// Avatar operations
// ============================================================================

/**
 * Upload an avatar for a character. Handles image processing, file I/O,
 * database update, backup/restore on failure, and cleanup.
 *
 * The caller must already have verified project ownership for the character.
 */
export async function uploadAvatar(
  db: Db | Transaction,
  character: Character,
  buffer: Buffer,
  mimetype: string
): Promise<{ avatarUrl: string }> {
  const characterId = character.id;

  // Process image
  const result = await validateAndProcessAvatar(buffer, mimetype);

  // Ensure upload directory exists
  await ensureAvatarDir();

  // Backup existing avatar file
  let previousAvatarBackupPath: string | undefined;
  let previousAvatarPath: string | undefined;
  if (character.avatarUrl) {
    previousAvatarPath = getAvatarFullPath(character.avatarUrl);
    try {
      await fs.access(previousAvatarPath);
      previousAvatarBackupPath = `${previousAvatarPath}.backup-${crypto.randomUUID()}`;
      await fs.copyFile(previousAvatarPath, previousAvatarBackupPath);
    } catch (accessError) {
      if (
        !(accessError instanceof Error && "code" in accessError) ||
        accessError.code !== "ENOENT"
      ) {
        const message =
          accessError instanceof Error
            ? accessError.message
            : String(accessError);
        throw new Error(`Failed to backup existing avatar file: ${message}`, {
          cause: accessError,
        });
      }
      // File doesn't exist — proceed without backup
    }
  }

  // Write new file
  const filePath = getAvatarFullPath(result.filename);
  await fs.writeFile(filePath, result.buffer);

  // Remove old avatar file
  if (character.avatarUrl) {
    try {
      await deleteAvatarFile(getAvatarFullPath(character.avatarUrl));
    } catch {
      logWarn(LogEventType.SERVICE_ERROR, {
        message: `Failed to delete old avatar (backup preserved): ${character.avatarUrl}`,
        characterId,
      });
    }
  }

  // Update DB
  try {
    const [updatedCharacter] = await db
      .update(characters)
      .set({ avatarUrl: result.filename, updatedAt: new Date() })
      .where(eq(characters.id, characterId))
      .returning();

    if (!updatedCharacter) {
      throw new NotFoundError("Character");
    }

    // Clean up backup on success
    if (previousAvatarBackupPath) {
      try {
        await deleteAvatarFile(previousAvatarBackupPath);
      } catch {
        logWarn(LogEventType.SERVICE_ERROR, {
          message: `Failed to delete avatar backup: ${previousAvatarBackupPath}`,
          characterId,
        });
      }
    }

    const avatarUrl = buildAvatarUrl(updatedCharacter.avatarUrl);
    if (!avatarUrl) {
      throw new Error("avatarUrl unexpectedly null after successful upload");
    }

    return { avatarUrl };
  } catch (error) {
    // DB update failed — restore backup and clean up new file
    if (previousAvatarBackupPath && previousAvatarPath) {
      try {
        await fs.copyFile(previousAvatarBackupPath, previousAvatarPath);
      } catch {
        logWarn(LogEventType.SERVICE_ERROR, {
          message: `Failed to restore previous avatar: ${character.avatarUrl}`,
          characterId,
        });
      }
      try {
        await deleteAvatarFile(previousAvatarBackupPath);
      } catch {
        logWarn(LogEventType.SERVICE_ERROR, {
          message: `Failed to delete avatar backup: ${previousAvatarBackupPath}`,
          characterId,
        });
      }
    }

    try {
      await deleteAvatarFile(filePath);
    } catch {
      logWarn(LogEventType.SERVICE_ERROR, {
        message: `Failed to delete new avatar file after DB failure: ${result.filename}`,
        characterId,
      });
    }

    throw error;
  }
}

/**
 * Delete a character's avatar (file + DB).
 *
 * The caller must already have verified project ownership for the character.
 */
export async function deleteAvatar(
  db: Db | Transaction,
  character: Character
): Promise<void> {
  const characterId = character.id;

  await db
    .update(characters)
    .set({ avatarUrl: null, updatedAt: new Date() })
    .where(eq(characters.id, characterId));

  if (character.avatarUrl) {
    try {
      await deleteAvatarFile(getAvatarFullPath(character.avatarUrl));
    } catch {
      logWarn(LogEventType.SERVICE_ERROR, {
        message: `Failed to delete avatar file: ${character.avatarUrl}`,
        characterId,
      });
    }
  }
}
