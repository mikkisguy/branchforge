/**
 * GitLab error helpers
 *
 * Shared error handling for GitLab sync operations.
 * - Typed preflight conflict errors for exports
 * - Safe public message allowlists for persisted sync errors
 * - Sanitization of legacy/error path messages
 */

import {
  ConflictError,
  RepositoryNotLinkedError,
} from "../../middleware/error-handler.middleware.js";

// Safe exact messages that may be persisted or returned to clients.
const SAFE_EXPORT_MESSAGES: readonly string[] = [
  "Server restarted while sync was in progress",
  "A character cannot be excluded until its source can be preserved.",
  "Export failed. Link a GitLab repository in project settings, then try again.",
  "Export failed. The repository default branch was not found, so a new branch cannot be created.",
  "Some excluded characters have no source declaration. Remove them from excluded character tags in project settings, or restore their source declarations, then export again.",
];

const SAFE_IMPORT_MESSAGES: readonly string[] = [
  "Server restarted while sync was in progress",
  "A character cannot be excluded until its source can be preserved.",
  "Import failed. Try again. If the problem persists, contact your administrator.",
  "Push or discard your structural file changes before pulling from GitLab",
  "No importable content found in the fetched files. Each file was either empty or contained only whitespace.",
];

const GENERIC_EXPORT_MESSAGE =
  "Export failed. Check your GitLab connection, branch name, and permissions, then try again.";
export const GENERIC_IMPORT_MESSAGE =
  "Import failed. Try again. If the problem persists, contact your administrator.";
const GENERIC_SYNC_MESSAGE =
  "Sync failed. Check your GitLab connection, branch name, and permissions, then try again.";

// Preflight conflict message prefixes. The variable portion is the remote
// path, which is a user-controlled project path and safe to echo.
const PREFLIGHT_CONFLICT_PREFIXES: readonly string[] = [
  "Conflict: expected source file not found on the remote: ",
  "Conflict: remote file changed since the last sync: ",
  "Conflict: file already exists on the remote: ",
];

/**
 * Typed error for GitLab export preflight conflicts. Keeps the user-facing
 * message separate from raw upstream failures so the export service can
 * return actionable guidance without prefix-matching arbitrary strings.
 */
export class GitLabExportConflictError extends Error {
  constructor(
    public readonly remotePath: string,
    message: string
  ) {
    super(message);
    this.name = "GitLabExportConflictError";
  }
}

export function createPreflightSourceMissingError(
  remotePath: string
): GitLabExportConflictError {
  return new GitLabExportConflictError(
    remotePath,
    `Conflict: expected source file not found on the remote: ${remotePath}`
  );
}

export function createPreflightRemoteChangedError(
  remotePath: string
): GitLabExportConflictError {
  return new GitLabExportConflictError(
    remotePath,
    `Conflict: remote file changed since the last sync: ${remotePath}`
  );
}

export function createPreflightFileExistsError(
  remotePath: string
): GitLabExportConflictError {
  return new GitLabExportConflictError(
    remotePath,
    `Conflict: file already exists on the remote: ${remotePath}`
  );
}

/**
 * Returns true if a message is a known safe public message for a GitLab sync
 * operation. Preflight conflict messages include a user path suffix which is
 * allowed through because project paths are user-controlled and actionable.
 */
export function isSafeGitLabSyncErrorMessage(
  message: string,
  operation: "EXPORT" | "IMPORT" | null
): boolean {
  if (
    (operation === "EXPORT" || operation === null) &&
    SAFE_EXPORT_MESSAGES.includes(message)
  ) {
    return true;
  }

  if (
    (operation === "IMPORT" || operation === null) &&
    SAFE_IMPORT_MESSAGES.includes(message)
  ) {
    return true;
  }

  if (
    operation !== "IMPORT" &&
    !/[\r\n]/.test(message) &&
    PREFLIGHT_CONFLICT_PREFIXES.some((prefix) => {
      if (!message.startsWith(prefix)) return false;
      const path = message.slice(prefix.length);
      return (
        path.trim().length > 0 &&
        /^[\p{L}\p{N}_ .-]+(?:\/[\p{L}\p{N}_ .-]+)*$/u.test(path)
      );
    })
  ) {
    return true;
  }

  return false;
}

/**
 * Sanitize a persisted sync error message. Known safe messages are returned
 * as-is; unknown strings are replaced with operation-specific generic guidance.
 * null/undefined passes through untouched.
 */
export function safeGitLabSyncErrorMessage(
  operation: "EXPORT" | "IMPORT" | null,
  rawMessage: string | null
): string | null {
  if (rawMessage === null || rawMessage === undefined) {
    return null;
  }

  if (isSafeGitLabSyncErrorMessage(rawMessage, operation)) {
    return rawMessage;
  }

  if (operation === "EXPORT") {
    return GENERIC_EXPORT_MESSAGE;
  }

  if (operation === "IMPORT") {
    return GENERIC_IMPORT_MESSAGE;
  }

  return GENERIC_SYNC_MESSAGE;
}

/**
 * Resolve an unexpected export error to a user-facing safe message.
 * Typed preflight conflicts and known ConflictErrors keep their guidance;
 * everything else falls back to a generic safe message.
 */
export function toUserFacingExportError(error: unknown): string {
  if (error instanceof RepositoryNotLinkedError) {
    return "Export failed. Link a GitLab repository in project settings, then try again.";
  }

  if (error instanceof GitLabExportConflictError) {
    return error.message;
  }

  if (error instanceof ConflictError) {
    return (
      safeGitLabSyncErrorMessage("EXPORT", error.userMessage) ??
      GENERIC_EXPORT_MESSAGE
    );
  }

  if (error instanceof Error && SAFE_EXPORT_MESSAGES.includes(error.message)) {
    return error.message;
  }

  return GENERIC_EXPORT_MESSAGE;
}
