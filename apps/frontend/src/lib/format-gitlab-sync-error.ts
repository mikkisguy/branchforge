const GITLAB_API_ERROR_PATTERN = /GitLab API error:\s*\d{3}/;
const JSON_ERROR_PATTERN = /\{\s*"message"\s*:/;

/** Keep API implementation details out of the sync dialog and toast. */
export function formatGitLabSyncError(
  message: string | null | undefined,
  operationType: "export" | "import"
): string {
  const operation = operationType === "export" ? "Export" : "Import";
  const recovery =
    "Check your GitLab connection, branch name, and permissions, then try again.";

  if (!message?.trim()) return `${operation} failed. ${recovery}`;
  if (message.startsWith("Conflict:")) return message;
  if (
    GITLAB_API_ERROR_PATTERN.test(message) ||
    JSON_ERROR_PATTERN.test(message)
  ) {
    return `${operation} failed. ${recovery}`;
  }
  if (/^(Export|Import) failed\b/i.test(message)) return message;
  return `${operation} failed. ${message}`;
}
