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
  buildAvatarStoredPath,
  ensureAvatarKindDir,
  getAvatarPath,
  getAvatarFullPath,
  tryGetAvatarFullPath,
  type AvatarKind,
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

const CHARACTER_AVATAR_KIND: AvatarKind = "character";

/**
 * Build public avatar URL from stored nested path.
 * Invalid/legacy stored values (e.g. bare legacy filenames) produce null
 * instead of resolving flat legacy files.
 */
export function buildAvatarUrl(storedPath: string | null): string | null {
  if (!storedPath) return null;
  try {
    return getAvatarPath(storedPath, getBasePath(), CHARACTER_AVATAR_KIND);
  } catch {
    return null;
  }
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

  // Ensure the character avatars directory exists
  await ensureAvatarKindDir(CHARACTER_AVATAR_KIND);

  // Resolve previous avatar file path. Invalid/legacy stored values resolve
  // to null: skip backup/delete so flat legacy files are never touched.
  const previousAvatarPath = tryGetAvatarFullPath(
    character.avatarUrl,
    CHARACTER_AVATAR_KIND
  );

  // Backup existing avatar file
  let previousAvatarBackupPath: string | undefined;
  if (previousAvatarPath) {
    previousAvatarBackupPath = `${previousAvatarPath}.backup-${crypto.randomUUID()}`;
    try {
      await fs.copyFile(previousAvatarPath, previousAvatarBackupPath);
    } catch (copyError) {
      if (
        !(copyError instanceof Error && "code" in copyError) ||
        copyError.code !== "ENOENT"
      ) {
        const message =
          copyError instanceof Error ? copyError.message : String(copyError);
        throw new Error(`Failed to backup existing avatar file: ${message}`, {
          cause: copyError,
        });
      }
      // Source file doesn't exist — proceed without backup
    }
  }

  // Write new file under uploads/avatars/characters/
  const newStoredPath = buildAvatarStoredPath(
    CHARACTER_AVATAR_KIND,
    result.filename
  );
  const filePath = getAvatarFullPath(newStoredPath, CHARACTER_AVATAR_KIND);
  await fs.writeFile(filePath, result.buffer);

  // Remove old avatar file (only when it resolved to a valid nested path)
  if (previousAvatarPath) {
    try {
      await deleteAvatarFile(previousAvatarPath);
    } catch {
      logWarn(LogEventType.SERVICE_ERROR, {
        message: `Failed to delete old avatar (backup preserved): ${character.avatarUrl}`,
        characterId,
      });
    }
  }

  // Update DB (stores the nested relative value, e.g. "characters/<uuid>.webp")
  try {
    const [updatedCharacter] = await db
      .update(characters)
      .set({ avatarUrl: newStoredPath, updatedAt: new Date() })
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
    // Invalid/legacy stored values resolve to null: skip file deletion so
    // flat legacy files are never touched.
    const avatarPath = tryGetAvatarFullPath(
      character.avatarUrl,
      CHARACTER_AVATAR_KIND
    );
    if (avatarPath) {
      try {
        await deleteAvatarFile(avatarPath);
      } catch {
        logWarn(LogEventType.SERVICE_ERROR, {
          message: `Failed to delete avatar file: ${character.avatarUrl}`,
          characterId,
        });
      }
    }
  }
}
