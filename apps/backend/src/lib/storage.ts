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
 * Avatar kinds. Each kind maps to a fixed subdirectory under
 * uploads/avatars/ so user and character avatars are stored separately:
 *
 *   uploads/avatars/users/<uuid>.webp
 *   uploads/avatars/characters/<uuid>.webp
 */
export type AvatarKind = "user" | "character";

export const AVATAR_KIND_DIRS: Record<AvatarKind, string> = {
  user: "users",
  character: "characters",
};

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

/**
 * Ensure the avatars root and both kind subdirectories (users/, characters/)
 * exist. Called at startup so nested avatar storage is ready before serving.
 */
export async function ensureAvatarDir(): Promise<void> {
  const avatarsDirPath = path.join(getUploadsDirPath(), AVATAR_SUBDIR);
  await fs.mkdir(avatarsDirPath, { recursive: true });
  await Promise.all(
    (Object.values(AVATAR_KIND_DIRS) as string[]).map((dirName) =>
      fs.mkdir(path.join(avatarsDirPath, dirName), { recursive: true })
    )
  );
}

/**
 * Ensure only the subdirectory for a specific avatar kind exists.
 * Uploads can call this for their own kind instead of creating both.
 */
export async function ensureAvatarKindDir(kind: AvatarKind): Promise<void> {
  const dirName = AVATAR_KIND_DIRS[kind];
  const dirPath = path.join(getUploadsDirPath(), AVATAR_SUBDIR, dirName);
  await fs.mkdir(dirPath, { recursive: true });
}

export function generateAvatarFilename(): string {
  return `${randomUUID()}.webp`;
}

/**
 * Build the nested stored path for a new avatar upload:
 * `users/<leaf>` or `characters/<leaf>`. This is the value persisted in the
 * database (relative to uploads/avatars/).
 *
 * @param kind - Which avatar kind is being stored
 * @param filename - Safe leaf filename (validated)
 * @returns The nested relative stored path
 * @throws {AvatarFilenameError} If the leaf filename is invalid
 */
export function buildAvatarStoredPath(
  kind: AvatarKind,
  filename: string
): string {
  const leaf = validateAvatarFilename(filename);
  return `${AVATAR_KIND_DIRS[kind]}/${leaf}`;
}

export interface ParsedAvatarStoredPath {
  kind: AvatarKind;
  leaf: string;
}

/**
 * Validate a stored avatar path (the value read from the database).
 *
 * Only nested relative paths with exactly one `users/` or `characters/`
 * directory component followed by a safe leaf filename are accepted.
 * Bare legacy filenames, traversal sequences, absolute paths, backslashes,
 * and any other directory names are rejected.
 *
 * @param storedPath - The stored value, e.g. "users/<uuid>.webp"
 * @param expectedKind - When provided, the parsed kind must match
 * @returns The parsed kind and validated leaf filename
 * @throws {AvatarFilenameError} If the stored path is not a valid nested path
 */
export function parseAvatarStoredPath(
  storedPath: string,
  expectedKind?: AvatarKind
): ParsedAvatarStoredPath {
  if (!storedPath || typeof storedPath !== "string") {
    throw new AvatarFilenameError(
      "Stored avatar path must be a non-empty string"
    );
  }

  if (storedPath.includes("\\")) {
    throw new AvatarFilenameError(
      "Stored avatar path cannot contain backslashes"
    );
  }

  if (storedPath.includes("\0")) {
    throw new AvatarFilenameError(
      "Stored avatar path cannot contain null bytes"
    );
  }

  if (path.isAbsolute(storedPath)) {
    throw new AvatarFilenameError("Stored avatar path cannot be absolute");
  }

  const segments = storedPath.split("/");
  if (segments.length !== 2) {
    throw new AvatarFilenameError(
      'Stored avatar path must be exactly "users/<filename>" or "characters/<filename>"'
    );
  }

  const [dirName, rawLeaf] = segments;
  const kind = (Object.keys(AVATAR_KIND_DIRS) as AvatarKind[]).find(
    (candidate) => AVATAR_KIND_DIRS[candidate] === dirName
  );
  if (!kind) {
    throw new AvatarFilenameError(
      'Stored avatar path must start with "users/" or "characters/"'
    );
  }

  const leaf = validateAvatarFilename(rawLeaf);

  if (expectedKind && kind !== expectedKind) {
    throw new AvatarFilenameError(
      `Stored avatar path is for "${AVATAR_KIND_DIRS[kind]}", expected "${AVATAR_KIND_DIRS[expectedKind]}"`
    );
  }

  return { kind, leaf };
}

/**
 * Get the avatar URL path for client access from a stored nested path.
 * Shape: `{basePath}/uploads/avatars/users/<leaf>` (or characters/).
 *
 * @param storedPath - The nested stored path from the database
 * @param basePath - The API base path
 * @param expectedKind - When provided, rejects stored paths of other kinds
 * @returns The full URL path for accessing the avatar
 * @throws {AvatarFilenameError} If the stored path is invalid
 */
export function getAvatarPath(
  storedPath: string,
  basePath = "/",
  expectedKind?: AvatarKind
): string {
  const { kind, leaf } = parseAvatarStoredPath(storedPath, expectedKind);

  // Remove trailing slash from basePath for consistent joining
  const cleanBasePath = basePath.endsWith("/")
    ? basePath.slice(0, -1)
    : basePath;
  return `${cleanBasePath}/${AVATAR_UPLOAD_DIR}/${AVATAR_KIND_DIRS[kind]}/${leaf}`;
}

/**
 * Get the absolute filesystem path for an avatar from a stored nested path.
 * Shape: `.../uploads/avatars/users/<leaf>` (or characters/).
 *
 * @param storedPath - The nested stored path from the database
 * @param expectedKind - When provided, rejects stored paths of other kinds
 * @returns The resolved absolute path within the avatar kind directory
 * @throws {AvatarFilenameError} If the stored path is invalid or escapes
 */
export function getAvatarFullPath(
  storedPath: string,
  expectedKind?: AvatarKind
): string {
  const { kind, leaf } = parseAvatarStoredPath(storedPath, expectedKind);

  // Build the full path using the module-relative uploads directory
  const kindDirPath = path.join(
    getUploadsDirPath(),
    AVATAR_SUBDIR,
    AVATAR_KIND_DIRS[kind]
  );
  const fullPath = path.resolve(kindDirPath, leaf);

  // Verify the resolved path is within the kind directory.
  // Normalize kindDirPath with a trailing separator to prevent prefix-based bypass
  // (e.g., "/uploads/avatars/users-other" should not match "/uploads/avatars/users").
  const normalizedKindDirPath = kindDirPath.endsWith(path.sep)
    ? kindDirPath
    : kindDirPath + path.sep;

  if (fullPath !== kindDirPath && !fullPath.startsWith(normalizedKindDirPath)) {
    throw new AvatarFilenameError(
      "Resolved path escapes the uploads directory"
    );
  }

  return fullPath;
}

/**
 * Safely resolve a stored avatar path to an absolute filesystem path.
 * Returns null for missing or invalid/legacy stored values instead of
 * throwing, so callers can skip backup/read/delete for legacy rows without
 * ever resolving flat legacy files.
 */
export function tryGetAvatarFullPath(
  storedPath: string | null,
  expectedKind?: AvatarKind
): string | null {
  if (!storedPath) return null;
  try {
    return getAvatarFullPath(storedPath, expectedKind);
  } catch {
    return null;
  }
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
 * Absolute path to the untainted project-images uploads root.
 */
export function getProjectImageRootDirPath(): string {
  return path.join(getUploadsDirPath(), PROJECT_IMAGE_SUBDIR);
}

/**
 * CodeQL-recognized containment check (path.relative + ".." prefix guard).
 * Returns the resolved absolute path when it stays under the project-images root.
 *
 * @see https://codeql.github.com/codeql-query-help/javascript/js-path-injection/
 */
export function resolvePathInsideProjectImageRoot(
  ...pathSegments: string[]
): string {
  const rootDir = getProjectImageRootDirPath();
  const resolvedPath = path.resolve(rootDir, ...pathSegments);
  const relative = path.relative(rootDir, resolvedPath);
  if (
    relative.startsWith(".." + path.sep) ||
    relative === ".." ||
    path.isAbsolute(relative)
  ) {
    throw new ProjectImageFilenameError(
      "Resolved path escapes the uploads directory"
    );
  }
  return resolvedPath;
}

/**
 * Ensure the project-images root directory exists.
 * When `projectId` is provided, also ensure that project's subdirectory exists.
 */
export async function ensureProjectImageDir(projectId?: string): Promise<void> {
  const rootDir = getProjectImageRootDirPath();
  await fs.mkdir(rootDir, { recursive: true });
  if (projectId === undefined) {
    return;
  }

  const sanitizedProjectId = validateProjectImageProjectId(projectId);
  const projectDirPath = path.resolve(rootDir, sanitizedProjectId);
  const relative = path.relative(rootDir, projectDirPath);
  if (
    relative.startsWith(".." + path.sep) ||
    relative === ".." ||
    path.isAbsolute(relative)
  ) {
    throw new ProjectImageFilenameError(
      "Resolved path escapes the uploads directory"
    );
  }
  await fs.mkdir(projectDirPath, { recursive: true });
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
  return resolvePathInsideProjectImageRoot(sanitizedProjectId, sanitized);
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
