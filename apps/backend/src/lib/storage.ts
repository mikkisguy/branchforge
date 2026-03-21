/**
 * Storage Configuration
 *
 * Configuration for file uploads including directory paths,
 * file size limits, and processing settings.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";

export const UPLOADS_DIR = "uploads";
export const AVATAR_SUBDIR = "avatars";

export const AVATAR_UPLOAD_DIR = `${UPLOADS_DIR}/${AVATAR_SUBDIR}`;
export const AVATAR_MAX_WIDTH = 200;
export const AVATAR_WEBP_QUALITY = 85;

/**
 * Avatar filename validation error
 */
export class AvatarFilenameError extends Error {
  constructor(message: string) {
    super(`Invalid avatar filename: ${message}`);
    this.name = "AvatarFilenameError";
  }
}

/**
 * Validate and sanitize an avatar filename to prevent path traversal attacks.
 *
 * This function:
 * 1. Rejects any path separators or traversal sequences (../, ..\, etc.)
 * 2. Strips any directory components using path.basename
 * 3. Validates against a whitelist of safe characters (alphanumerics, dot, dash, underscore)
 *
 * @param filename - The filename to validate
 * @returns The sanitized filename containing only the basename
 * @throws {AvatarFilenameError} If the filename contains invalid characters or is empty
 */
export function validateAvatarFilename(filename: string): string {
  if (!filename || typeof filename !== "string") {
    throw new AvatarFilenameError("Filename must be a non-empty string");
  }

  // Enforce maximum filename length (common filesystem limit)
  const MAX_FILENAME_LENGTH = 255;
  if (filename.length > MAX_FILENAME_LENGTH) {
    throw new AvatarFilenameError(
      `Filename cannot exceed ${MAX_FILENAME_LENGTH} characters`
    );
  }

  // Strip any directory components first (defense in depth)
  const sanitized = path.basename(filename);

  // Check for path traversal sequences that basename might not catch
  if (filename !== sanitized) {
    throw new AvatarFilenameError("Filename cannot contain path separators");
  }

  // Whitelist validation: only allow alphanumerics, dot, dash, underscore
  // This prevents any shell metacharacters or special characters
  const validPattern = /^[a-zA-Z0-9._-]+$/;
  if (!validPattern.test(sanitized)) {
    throw new AvatarFilenameError(
      "Filename contains invalid characters. Only alphanumeric, dot, dash, and underscore are allowed"
    );
  }

  // Reject filenames starting with dot (hidden files)
  if (sanitized.startsWith(".")) {
    throw new AvatarFilenameError("Filename cannot start with a dot");
  }

  return sanitized;
}

export async function ensureAvatarDir(): Promise<void> {
  const dirPath = path.join(getUploadsDirPath(), AVATAR_SUBDIR);
  await fs.mkdir(dirPath, { recursive: true });
}

export function generateAvatarFilename(): string {
  return `${randomUUID()}.webp`;
}

/**
 * Get the avatar URL path for client access
 * @param filename - The avatar filename
 * @param basePath - The API base path (e.g., "/api/api/" or "/api/")
 * @returns The full URL path for accessing the avatar
 */
export function getAvatarPath(filename: string, basePath = "/"): string {
  // Validate and sanitize the filename
  const sanitized = validateAvatarFilename(filename);

  // Remove trailing slash from basePath for consistent joining
  const cleanBasePath = basePath.endsWith("/")
    ? basePath.slice(0, -1)
    : basePath;
  return `${cleanBasePath}/${AVATAR_UPLOAD_DIR}/${sanitized}`;
}

export function getAvatarFullPath(filename: string): string {
  // Validate and sanitize the filename
  const sanitized = validateAvatarFilename(filename);

  // Build the full path using the module-relative uploads directory
  const uploadsDirPath = path.join(getUploadsDirPath(), AVATAR_SUBDIR);
  const fullPath = path.resolve(uploadsDirPath, sanitized);

  // Verify the resolved path is within the uploads directory.
  // Normalize uploadsDirPath with a trailing separator to prevent prefix-based bypass
  // (e.g., "/uploads/avatars-other" should not match "/uploads/avatars").
  const normalizedUploadsPath = uploadsDirPath.endsWith(path.sep)
    ? uploadsDirPath
    : uploadsDirPath + path.sep;

  if (
    fullPath !== uploadsDirPath &&
    !fullPath.startsWith(normalizedUploadsPath)
  ) {
    throw new AvatarFilenameError(
      "Resolved path escapes the uploads directory"
    );
  }

  return fullPath;
}

/**
 * Get the full path to the uploads directory
 * Uses module-relative path for consistency across development and production
 * @returns The absolute path to the uploads directory
 */
export function getUploadsDirPath(): string {
  // Resolve from this module's location: apps/backend/src/lib/storage.ts
  // dirname gives us apps/backend/src/lib, ../.. gives us apps/backend
  return path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    UPLOADS_DIR
  );
}
