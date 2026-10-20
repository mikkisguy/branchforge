/** Known safe public messages that may be rendered verbatim. */
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

const PREFLIGHT_CONFLICT_PREFIXES: readonly string[] = [
  "Conflict: expected source file not found on the remote: ",
  "Conflict: remote file changed since the last sync: ",
  "Conflict: file already exists on the remote: ",
];

function isSafeMessage(
  message: string,
  operation: "export" | "import"
): boolean {
  const operationMessages =
    operation === "export" ? SAFE_EXPORT_MESSAGES : SAFE_IMPORT_MESSAGES;
  if (operationMessages.includes(message)) {
    return true;
  }

  if (
    operation === "export" &&
    !/[\r\n]/.test(message) &&
    PREFLIGHT_CONFLICT_PREFIXES.some(
      (prefix) => message.startsWith(prefix) && message.length > prefix.length
    )
  ) {
    return true;
  }

  return false;
}

/** Keep API implementation details out of the sync dialog and toast. */
export function formatGitLabSyncError(
  message: string | null | undefined,
  operationType: "export" | "import"
): string {
  const operation = operationType === "export" ? "Export" : "Import";
  const recovery =
    operationType === "import"
      ? "Try again. If the problem persists, contact your administrator."
      : "Check your GitLab connection, branch name, and permissions, then try again.";

  if (!message?.trim()) return `${operation} failed. ${recovery}`;

  // Explicitly known safe public messages (including the three preflight
  // conflict templates) are rendered as-is. Anything else is replaced with
  // generic recovery guidance so stacks, query parameters, and upstream
  // bodies never reach the UI.
  if (isSafeMessage(message, operationType)) {
    return message;
  }

  return `${operation} failed. ${recovery}`;
}
