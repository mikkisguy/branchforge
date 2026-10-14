import { describe, expect, it } from "vitest";
import { formatGitLabSyncError } from "../format-gitlab-sync-error";

describe("formatGitLabSyncError", () => {
  it("replaces raw GitLab API errors with recovery guidance", () => {
    expect(
      formatGitLabSyncError(
        'GitLab API error: 400 - {"message":"A file with this name doesn\'t exist"}',
        "export"
      )
    ).toBe(
      "Export failed. Check your GitLab connection, branch name, and permissions, then try again."
    );
  });

  it("keeps existing conflict guidance", () => {
    expect(
      formatGitLabSyncError(
        "Conflict: remote file changed since the last sync: game/script.rpy",
        "export"
      )
    ).toBe(
      "Conflict: remote file changed since the last sync: game/script.rpy"
    );
  });

  it.each(["export", "import"] as const)(
    "replaces internal error details for %s",
    (operation) => {
      const generic = `${operation === "export" ? "Export" : "Import"} failed. Check your GitLab connection, branch name, and permissions, then try again.`;
      const unsafeMessages = [
        "Failed query: select * from users params: [secret-token]",
        "TypeError: request failed\n    at sync.ts:42",
        'GitLab API error: 500 - {"message":"private upstream details"}',
        "Conflict: arbitrary internal database failure",
        "Export failed. query params: [secret-token]",
      ];

      for (const message of unsafeMessages) {
        expect(formatGitLabSyncError(message, operation)).toBe(generic);
      }
    }
  );

  it("preserves known safe recovery guidance", () => {
    expect(
      formatGitLabSyncError(
        "Push or discard your structural file changes before pulling from GitLab",
        "import"
      )
    ).toBe(
      "Push or discard your structural file changes before pulling from GitLab"
    );
  });
});
