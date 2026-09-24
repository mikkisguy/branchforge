import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GitLabSyncDialogFooter } from "../GitLabSyncDialogFooter";
import { GitLabSyncSyncForm } from "../GitLabSyncSyncForm";
import {
  branchAfterCreateNewToggle,
  gitBranchNameError,
} from "../git-branch-name";

function renderExportForm(
  overrides: Partial<Parameters<typeof GitLabSyncSyncForm>[0]> = {}
) {
  return render(
    <GitLabSyncSyncForm
      branch="main"
      commitMessage="Sync export from BranchForge"
      conflictResolution="branchforge_wins"
      operationType="export"
      isFirstSync={false}
      isProcessing={false}
      error={null}
      onBranchChange={vi.fn()}
      onCommitMessageChange={vi.fn()}
      onConflictResolutionChange={vi.fn()}
      defaultBranch="main"
      createNewBranch={false}
      onCreateNewBranchChange={vi.fn()}
      branchNameError={null}
      branchAlreadyExists={false}
      {...overrides}
    />
  );
}

describe("GitLabSyncSyncForm", () => {
  it("offers create new branch only when exporting", () => {
    const exported = renderExportForm();
    expect(
      screen.getByRole("switch", { name: "Create new branch" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("The GitLab branch to push to.")
    ).toBeInTheDocument();
    exported.unmount();

    render(
      <GitLabSyncSyncForm
        branch="main"
        commitMessage=""
        conflictResolution="branchforge_wins"
        operationType="import"
        isFirstSync
        isProcessing={false}
        error={null}
        onBranchChange={vi.fn()}
        onCommitMessageChange={vi.fn()}
        onConflictResolutionChange={vi.fn()}
        defaultBranch="main"
        createNewBranch={false}
        onCreateNewBranchChange={vi.fn()}
        branchNameError={null}
        branchAlreadyExists={false}
      />
    );
    expect(
      screen.queryByRole("switch", { name: "Create new branch" })
    ).not.toBeInTheDocument();
  });

  it("explains that a new branch is created from the default branch", () => {
    const onCreateNewBranchChange = vi.fn();
    const view = renderExportForm({ onCreateNewBranchChange });

    fireEvent.click(screen.getByRole("switch", { name: "Create new branch" }));
    expect(onCreateNewBranchChange).toHaveBeenCalledWith(true);
    view.unmount();

    renderExportForm({
      createNewBranch: true,
      branch: "feature/labels",
      defaultBranch: "main",
    });
    expect(
      screen.getByText(
        "A new branch is created from main and your labels are committed onto it."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("feature/my-changes")
    ).toBeInTheDocument();
  });

  it("warns when the new name is an existing branch", () => {
    renderExportForm({
      createNewBranch: true,
      branch: "develop",
      branchAlreadyExists: true,
    });
    expect(
      screen.getByText("This branch already exists. Export will update it.")
    ).toBeInTheDocument();
  });

  it("shows an invalid new branch name and keeps export disabled", () => {
    const branch = "bad name";
    const branchNameError = gitBranchNameError(branch);

    render(
      <>
        <GitLabSyncSyncForm
          branch={branch}
          commitMessage="Sync export from BranchForge"
          conflictResolution="branchforge_wins"
          operationType="export"
          isFirstSync={false}
          isProcessing={false}
          error={null}
          onBranchChange={vi.fn()}
          onCommitMessageChange={vi.fn()}
          onConflictResolutionChange={vi.fn()}
          defaultBranch="main"
          createNewBranch
          onCreateNewBranchChange={vi.fn()}
          branchNameError={branchNameError}
          branchAlreadyExists={false}
        />
        <GitLabSyncDialogFooter
          isProcessing={false}
          hasOperation={false}
          operationStatus={undefined}
          branch={branch}
          branchInvalid={branchNameError !== null}
          operationType="export"
          onSync={vi.fn()}
          onClose={vi.fn()}
        />
      </>
    );

    expect(branchNameError).toBe("Branch name contains invalid characters");
    expect(
      screen.getByText("Branch name contains invalid characters")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
  });

  it("enables export for a valid new branch name", () => {
    const branch = "feature/labels";
    render(
      <GitLabSyncDialogFooter
        isProcessing={false}
        hasOperation={false}
        operationStatus={undefined}
        branch={branch}
        branchInvalid={gitBranchNameError(branch) !== null}
        operationType="export"
        onSync={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Export" })).toBeEnabled();
  });
});

describe("branch names", () => {
  it("rejects empty names, path tricks, and characters GitLab does not allow", () => {
    expect(gitBranchNameError("")).toBe("Branch is required");
    expect(gitBranchNameError("feature/labels")).toBeNull();
    expect(gitBranchNameError("release-1.2")).toBeNull();
    expect(gitBranchNameError("-hidden")).toMatch(/cannot start/);
    expect(gitBranchNameError("feature/")).toMatch(/cannot start/);
    expect(gitBranchNameError("feature/../main")).toMatch(/cannot start/);
    expect(gitBranchNameError("feature//labels")).toMatch(/components cannot/);
    expect(gitBranchNameError(".hidden")).toMatch(/components cannot/);
    expect(gitBranchNameError("feature/.hidden")).toMatch(/components cannot/);
    expect(gitBranchNameError("feature.")).toMatch(/components cannot/);
    expect(gitBranchNameError("feature/labels.")).toMatch(/components cannot/);
    expect(gitBranchNameError("feature.lock")).toMatch(/components cannot/);
    expect(gitBranchNameError("feature/labels.lock")).toMatch(
      /components cannot/
    );
  });

  it("clears a prefilled default branch when creating a new one", () => {
    expect(branchAfterCreateNewToggle(true, null, "main")).toBe("");
    expect(branchAfterCreateNewToggle(true, "main", "main")).toBe("");
    expect(branchAfterCreateNewToggle(true, "develop", "main")).toBe("develop");
    expect(branchAfterCreateNewToggle(false, "", "main")).toBeNull();
    expect(branchAfterCreateNewToggle(false, "develop", "main")).toBe(
      "develop"
    );
  });
});
