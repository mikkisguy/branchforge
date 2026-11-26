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

const GENERATED_PATH_CONFLICT_PREFIX =
  "Conflict: verify ownership of this generated file path in GitLab and BranchForge before retrying: ";
const GENERATED_PATH_CONFLICT_MESSAGE =
  "Conflict: verify ownership of the generated file paths in GitLab and BranchForge before retrying.";

export const GITLAB_EXPORT_BRANCH_UNCERTAIN =
  "Branch creation could not be verified. The branch may remain at its base. Recover the previous export before retrying.";
export const GITLAB_EXPORT_REVIEW_STALE =
  "The export review has changed. Refresh the review and confirm again.";
export const GITLAB_EXPORT_BRANCH_COMMIT_REJECTED =
  "The branch was created, but the file commit was rejected. The branch may remain at its base. Refresh the review before retrying.";
export const GITLAB_EXPORT_BRANCH_CREATE_REJECTED =
  "The target branch could not be created. Refresh the review before confirming again.";

export const GITLAB_EXPORT_ATTEMPT_UNCERTAIN =
  "BranchForge could not verify the previous GitLab push. Check the target branch and retry the same push, or contact your administrator.";
export const GITLAB_EXPORT_HISTORY_IN_PROGRESS =
  "GitLab push verification is still in progress. Retry the same branch to continue the search.";
export const GITLAB_IMPORT_STALE_AFTER_EXPORT =
  "A GitLab push completed while pull data was loading. Retry the pull to fetch the latest files.";
export const GITLAB_IMPORT_PENDING_EXPORT =
  "Retry the previous GitLab push before pulling changes into this project.";
export const GITLAB_EXPORT_ATTEMPT_CHANGED =
  "The previous GitLab push no longer matches this repository, branch, or pending file operations. Review the pending changes before retrying.";
export class GitLabRepositoryChangedError extends Error {
  constructor() {
    super(GITLAB_EXPORT_ATTEMPT_CHANGED);
  }
}
export const GITLAB_IMPORT_EMPTY =
  "No importable content found in the fetched files. Each file was either empty or contained only whitespace.";
export const GITLAB_FRESH_IMPORT_EMPTY =
  "No importable Ren’Py source or managed declarations were found on the selected GitLab branch.";

/** Fresh-import diagnostic built from repository paths and line numbers only. */
export class GitLabGeneratedImportError extends Error {}

export class GitLabEmptyImportError extends Error {
  constructor() {
    super(GITLAB_FRESH_IMPORT_EMPTY);
  }
}

// Safe exact messages that may be persisted or returned to clients.
const SAFE_EXPORT_MESSAGES: readonly string[] = [
  GITLAB_EXPORT_REVIEW_STALE,
  GITLAB_EXPORT_BRANCH_UNCERTAIN,
  GITLAB_EXPORT_BRANCH_COMMIT_REJECTED,
  GITLAB_EXPORT_BRANCH_CREATE_REJECTED,
  "An operator confirmed the GitLab push did not apply. Retry the export.",
  GENERATED_PATH_CONFLICT_MESSAGE,
  GITLAB_EXPORT_ATTEMPT_UNCERTAIN,
  GITLAB_EXPORT_HISTORY_IN_PROGRESS,
  GITLAB_EXPORT_ATTEMPT_CHANGED,
  "Server restarted while sync was in progress",
  "A character cannot be excluded until its source can be preserved.",
  "Export failed. Link a GitLab repository in project settings, then try again.",
  "Export failed. The repository default branch was not found, so a new branch cannot be created.",
  "Some excluded characters have no source declaration. Remove them from excluded character tags in project settings, or restore their source declarations, then export again.",
];

const SAFE_IMPORT_MESSAGES: readonly string[] = [
  GITLAB_IMPORT_PENDING_EXPORT,
  GITLAB_IMPORT_STALE_AFTER_EXPORT,
  "Server restarted while sync was in progress",
  "A character cannot be excluded until its source can be preserved.",
  "Import failed. Try again. If the problem persists, contact your administrator.",
  "Push or discard your structural file changes before pulling from GitLab",
  GITLAB_IMPORT_EMPTY,
  GITLAB_FRESH_IMPORT_EMPTY,
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
  GENERATED_PATH_CONFLICT_PREFIX,
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

export function createGeneratedPathConflictError(
  filePath: string
): GitLabExportConflictError {
  const message = GENERATED_PATH_CONFLICT_PREFIX + filePath;
  return new GitLabExportConflictError(
    filePath,
    isSafeGitLabSyncErrorMessage(message, "EXPORT")
      ? message
      : GENERATED_PATH_CONFLICT_MESSAGE
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
