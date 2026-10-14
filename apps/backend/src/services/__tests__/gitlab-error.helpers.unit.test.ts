import { describe, expect, it } from "vitest";
import {
  createPreflightFileExistsError,
  createPreflightRemoteChangedError,
  createPreflightSourceMissingError,
  safeGitLabSyncErrorMessage,
  toUserFacingExportError,
} from "../gitlab/gitlab-error.helpers.js";

describe("GitLab public errors", () => {
  it.each([
    "Failed query: select secret from private_table\nparams: sensitive-value",
    "Error: failure\n    at internalFunction (/server/private.ts:10)",
    "getaddrinfo ENOTFOUND internal.example",
    'GitLab API error: 500 - {"message":"private diagnostics"}',
    "Conflict: private diagnostics",
    "Export failed. private diagnostics",
  ])("hides unexpected export failures: %s", (message) => {
    expect(toUserFacingExportError(new Error(message))).toBe(
      "Export failed. Check your GitLab connection, branch name, and permissions, then try again."
    );
  });

  it.each([
    createPreflightFileExistsError,
    createPreflightRemoteChangedError,
    createPreflightSourceMissingError,
  ])("preserves typed preflight guidance", (createError) => {
    const error = createError("game/script.rpy");
    expect(toUserFacingExportError(error)).toBe(error.message);
    expect(safeGitLabSyncErrorMessage("EXPORT", error.message)).toBe(
      error.message
    );
    // An upstream exception with similar text is not a typed public error.
    expect(toUserFacingExportError(new Error(error.message))).toContain(
      "Check your GitLab connection"
    );
  });

  it("hides multiline diagnostics after a known conflict prefix", () => {
    expect(
      safeGitLabSyncErrorMessage(
        "EXPORT",
        "Conflict: remote file changed since the last sync: game/script.rpy\nFailed query: select secret"
      )
    ).toContain("Check your GitLab connection");
  });

  it("preserves missing default branch guidance", () => {
    const message =
      "Export failed. The repository default branch was not found, so a new branch cannot be created.";
    expect(toUserFacingExportError(new Error(message))).toBe(message);
  });
});
