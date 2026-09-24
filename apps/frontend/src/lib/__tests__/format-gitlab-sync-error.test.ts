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
      formatGitLabSyncError("Conflict: remote file changed", "export")
    ).toBe("Conflict: remote file changed");
  });
});
