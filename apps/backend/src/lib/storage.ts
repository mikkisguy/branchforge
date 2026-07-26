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
export const PROJECT_IMAGE_SUBDIR = "project-images";

export const AVATAR_UPLOAD_DIR = `${UPLOADS_DIR}/${AVATAR_SUBDIR}`;
export const PROJECT_IMAGE_UPLOAD_DIR = `${UPLOADS_DIR}/${PROJECT_IMAGE_SUBDIR}`;
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
 * @param basePath - The API base path
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
 * Project image filename validation error
 */
export class ProjectImageFilenameError extends Error {
  constructor(message: string) {
    super(`Invalid project image filename: ${message}`);
    this.name = "ProjectImageFilenameError";
  }
}

const PROJECT_ID_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate a project UUID used as an on-disk subdirectory under project-images/.
 */
export function validateProjectImageProjectId(projectId: string): string {
  if (!projectId || typeof projectId !== "string") {
    throw new ProjectImageFilenameError(
      "Project ID must be a non-empty string"
    );
  }

  if (!PROJECT_ID_UUID_PATTERN.test(projectId)) {
    throw new ProjectImageFilenameError("Project ID must be a valid UUID");
  }

  return projectId.toLowerCase();
}

/**
 * Validate and sanitize a project image filename to prevent path traversal attacks.
 */
export function validateProjectImageFilename(filename: string): string {
  if (!filename || typeof filename !== "string") {
    throw new ProjectImageFilenameError("Filename must be a non-empty string");
  }

  const MAX_FILENAME_LENGTH = 255;
  if (filename.length > MAX_FILENAME_LENGTH) {
    throw new ProjectImageFilenameError(
      `Filename cannot exceed ${MAX_FILENAME_LENGTH} characters`
    );
  }

  const sanitized = path.basename(filename);

  if (filename !== sanitized) {
    throw new ProjectImageFilenameError(
      "Filename cannot contain path separators"
    );
  }

  const validPattern = /^[a-zA-Z0-9._-]+$/;
  if (!validPattern.test(sanitized)) {
    throw new ProjectImageFilenameError(
      "Filename contains invalid characters. Only alphanumeric, dot, dash, and underscore are allowed"
    );
  }

  if (sanitized.startsWith(".")) {
    throw new ProjectImageFilenameError("Filename cannot start with a dot");
  }

  return sanitized;
}

/**
 * Ensure the project-images root directory exists.
 * When `projectId` is provided, also ensure that project's subdirectory exists.
 */
export async function ensureProjectImageDir(projectId?: string): Promise<void> {
  const rootDir = path.join(getUploadsDirPath(), PROJECT_IMAGE_SUBDIR);
  if (projectId === undefined) {
    await fs.mkdir(rootDir, { recursive: true });
    return;
  }

  const sanitizedProjectId = validateProjectImageProjectId(projectId);
  await fs.mkdir(path.join(rootDir, sanitizedProjectId), { recursive: true });
}

export function generateProjectImageFilename(
  variant: "tooltip" | "modal",
  extension: string
): string {
  const ext = extension.startsWith(".") ? extension : `.${extension}`;
  return `${randomUUID()}_${variant}${ext}`;
}

/**
 * Get the project image URL path for client access.
 * Shape: `{basePath}/uploads/project-images/<projectId>/<filename>`
 */
export function getProjectImagePath(
  projectId: string,
  filename: string,
  basePath = "/"
): string {
  const sanitizedProjectId = validateProjectImageProjectId(projectId);
  const sanitized = validateProjectImageFilename(filename);

  const cleanBasePath = basePath.endsWith("/")
    ? basePath.slice(0, -1)
    : basePath;
  return `${cleanBasePath}/${PROJECT_IMAGE_UPLOAD_DIR}/${sanitizedProjectId}/${sanitized}`;
}

/**
 * Get the absolute filesystem path for a project image file.
 * Shape: `.../uploads/project-images/<projectId>/<filename>`
 */
export function getProjectImageFullPath(
  projectId: string,
  filename: string
): string {
  const sanitizedProjectId = validateProjectImageProjectId(projectId);
  const sanitized = validateProjectImageFilename(filename);

  const projectDirPath = path.join(
    getUploadsDirPath(),
    PROJECT_IMAGE_SUBDIR,
    sanitizedProjectId
  );
  const fullPath = path.resolve(projectDirPath, sanitized);

  const normalizedProjectDir = projectDirPath.endsWith(path.sep)
    ? projectDirPath
    : projectDirPath + path.sep;

  if (
    fullPath !== projectDirPath &&
    !fullPath.startsWith(normalizedProjectDir)
  ) {
    throw new ProjectImageFilenameError(
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
