import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GitLabSyncDialogFooter } from "../GitLabSyncDialogFooter";
import { GitLabSyncSyncForm } from "../GitLabSyncSyncForm";
import {
  canExportToBranch,
  gitBranchNameError,
  resolveSyncBranchFields,
} from "../git-branch-name";
import {
  createInitialSyncFormState,
  syncFormReducer,
} from "../GitLabSyncDialogReducer";

const defaultBranches = ["main", "develop", "feature/labels"];

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
      branches={defaultBranches}
      branchesLoading={false}
      branchesError={null}
      onBranchesRetry={vi.fn()}
      {...overrides}
    />
  );
}

describe("GitLabSyncSyncForm", () => {
  it("offers existing branch selection only when exporting", () => {
    const exported = renderExportForm();
    expect(
      screen.getByRole("combobox", { name: "Branch" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create a new branch" })
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
        branches={defaultBranches}
        branchesLoading={false}
        branchesError={null}
        onBranchesRetry={vi.fn()}
      />
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("main")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create a new branch" })
    ).not.toBeInTheDocument();
  });

  it("renders an existing branch selection", () => {
    renderExportForm({
      branch: "main",
      branches: defaultBranches,
    });

    expect(screen.getByRole("combobox")).toHaveTextContent("main");
  });

  it("requires a manual selection when the default branch is not in the list", () => {
    renderExportForm({
      branch: "",
      defaultBranch: "missing",
      branches: defaultBranches,
    });

    expect(screen.getByRole("combobox")).toHaveTextContent("Select branch…");
  });

  it("switches to a blank new branch input and back to the prior selection", async () => {
    const user = userEvent.setup();
    const onCreateNewBranchChange = vi.fn();
    const onBranchChange = vi.fn();

    renderExportForm({
      branch: "main",
      onBranchChange,
      onCreateNewBranchChange,
    });

    await user.click(
      screen.getByRole("button", { name: "Create a new branch" })
    );
    expect(onCreateNewBranchChange).toHaveBeenCalledWith(true);

    renderExportForm({
      branch: "",
      createNewBranch: true,
      onCreateNewBranchChange,
      onBranchChange,
    });

    expect(screen.getByPlaceholderText("feature/my-changes")).toHaveValue("");
    expect(screen.getByText("New branch name")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Use existing branch" })
    );
    expect(onCreateNewBranchChange).toHaveBeenCalledWith(false);
  });

  it("keeps the create-new-branch action disabled until branches load", () => {
    renderExportForm({ branches: undefined, branchesLoading: true });
    expect(
      screen.getByRole("button", { name: "Create a new branch" })
    ).toBeDisabled();
  });

  it("preserves the existing selection and new name independently when switching modes", () => {
    const { rerender } = renderExportForm({
      branch: "develop",
      createNewBranch: false,
    });

    expect(screen.getByRole("combobox")).toHaveTextContent("develop");

    rerender(
      <GitLabSyncSyncForm
        branch="feature/new"
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
        createNewBranch={true}
        onCreateNewBranchChange={vi.fn()}
        branchNameError={null}
        branchAlreadyExists={false}
        branches={defaultBranches}
        branchesLoading={false}
        branchesError={null}
        onBranchesRetry={vi.fn()}
      />
    );

    expect(screen.getByPlaceholderText("feature/my-changes")).toHaveValue(
      "feature/new"
    );
  });

  it("shows loading, empty, and retryable error states", async () => {
    const user = userEvent.setup();
    const onBranchesRetry = vi.fn();

    const { rerender } = renderExportForm({ branchesLoading: true });
    expect(screen.getByText("Loading branches…")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create a new branch" })
    ).toBeDisabled();

    rerender(
      <GitLabSyncSyncForm
        branch=""
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
        branches={[]}
        branchesLoading={false}
        branchesError={null}
        onBranchesRetry={onBranchesRetry}
      />
    );
    expect(screen.getByText(/No branches found/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create a new branch" })
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onBranchesRetry).toHaveBeenCalledTimes(1);

    rerender(
      <GitLabSyncSyncForm
        branch=""
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
        branches={undefined}
        branchesLoading={false}
        branchesError={new Error("network error")}
        onBranchesRetry={onBranchesRetry}
      />
    );
    expect(screen.getByText("Could not load branches.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create a new branch" })
    ).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onBranchesRetry).toHaveBeenCalledTimes(2);
  });

  it("submits the selected existing branch", async () => {
    const user = userEvent.setup();
    const onSync = vi.fn();

    render(
      <>
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
          branches={defaultBranches}
          branchesLoading={false}
          branchesError={null}
          onBranchesRetry={vi.fn()}
        />
        <GitLabSyncDialogFooter
          isProcessing={false}
          hasOperation={false}
          operationStatus={undefined}
          branch="main"
          branchInvalid={false}
          createNewBranch={false}
          operationType="export"
          onSync={onSync}
          onClose={vi.fn()}
        />
      </>
    );

    await user.click(screen.getByRole("button", { name: "Export to main" }));
    expect(onSync).toHaveBeenCalled();
  });

  it("explains that a new branch is created from the default branch", () => {
    renderExportForm({
      createNewBranch: true,
      branch: "feature/labels",
      defaultBranch: "main",
    });
    expect(
      screen.getByText(
        "Creates a branch from main and commits your changes to it."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("feature/my-changes")
    ).toBeInTheDocument();
  });

  it("blocks a new branch name that matches an existing branch", () => {
    const branch = "develop";
    renderExportForm({
      createNewBranch: true,
      branch,
      branchAlreadyExists: true,
    });
    expect(
      screen.getByText(
        "A branch with this name already exists. Choose an existing branch to export to it."
      )
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
          branches={defaultBranches}
          branchesLoading={false}
          branchesError={null}
          onBranchesRetry={vi.fn()}
        />
        <GitLabSyncDialogFooter
          isProcessing={false}
          hasOperation={false}
          operationStatus={undefined}
          branch={branch}
          branchInvalid={branchNameError !== null}
          createNewBranch
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
    expect(
      screen.getByRole("button", { name: "Create branch and export" })
    ).toBeDisabled();
  });

  it("disables export while the branch list is still loading", () => {
    render(
      <GitLabSyncDialogFooter
        isProcessing={false}
        hasOperation={false}
        operationStatus={undefined}
        branch=""
        branchInvalid={false}
        createNewBranch={false}
        operationType="export"
        onSync={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(
      screen.getByRole("button", { name: "Export to branch" })
    ).toBeDisabled();
  });
});

describe("export branch state", () => {
  it("preserves each path while switching and clears the new name on close", () => {
    let state = createInitialSyncFormState("export");
    state = syncFormReducer(state, {
      type: "SET_USER_BRANCH",
      value: "develop",
    });
    state = syncFormReducer(state, {
      type: "SET_CREATE_NEW_BRANCH",
      value: true,
    });
    expect(state.userBranch).toBe("");

    state = syncFormReducer(state, {
      type: "SET_USER_BRANCH",
      value: "feature/story",
    });
    state = syncFormReducer(state, {
      type: "SET_CREATE_NEW_BRANCH",
      value: false,
    });
    expect(state.userBranch).toBe("develop");

    state = syncFormReducer(state, {
      type: "SET_CREATE_NEW_BRANCH",
      value: true,
    });
    expect(state.userBranch).toBe("feature/story");

    state = syncFormReducer(state, { type: "RESET_BRANCH_MODE" });
    expect(state.createNewBranch).toBe(false);
    expect(state.userBranch).toBe("develop");
    state = syncFormReducer(state, {
      type: "SET_CREATE_NEW_BRANCH",
      value: true,
    });
    expect(state.userBranch).toBe("");
  });

  it("clears branch overrides when the linked target changes", () => {
    let state = createInitialSyncFormState("export");
    state = syncFormReducer(state, {
      type: "SET_USER_BRANCH",
      value: "develop",
    });
    state = syncFormReducer(state, {
      type: "SET_CREATE_NEW_BRANCH",
      value: true,
    });
    state = syncFormReducer(state, {
      type: "SET_USER_BRANCH",
      value: "feature/story",
    });

    state = syncFormReducer(state, { type: "RESET_BRANCH_SELECTION" });

    expect(state).toMatchObject({
      userBranch: null,
      createNewBranch: false,
      lastExistingBranch: null,
      lastNewBranchName: "",
    });
  });

  it("requires a loaded list and a valid target in either path", () => {
    const existing = resolveSyncBranchFields({
      operationType: "export",
      createNewBranch: false,
      userBranch: "develop",
      defaultBranch: "main",
      knownBranches: defaultBranches,
    });
    expect(
      canExportToBranch({
        ...existing,
        createNewBranch: false,
        knownBranches: undefined,
      })
    ).toBe(false);
    expect(
      canExportToBranch({
        ...existing,
        createNewBranch: false,
        knownBranches: defaultBranches,
      })
    ).toBe(true);
    expect(
      canExportToBranch({
        ...existing,
        createNewBranch: false,
        knownBranches: ["main"],
      })
    ).toBe(false);

    const duplicate = resolveSyncBranchFields({
      operationType: "export",
      createNewBranch: true,
      userBranch: "develop",
      defaultBranch: "main",
      knownBranches: defaultBranches,
    });
    expect(
      canExportToBranch({
        ...duplicate,
        createNewBranch: true,
        knownBranches: defaultBranches,
      })
    ).toBe(false);

    const newBranch = resolveSyncBranchFields({
      operationType: "export",
      createNewBranch: true,
      userBranch: "feature/new",
      defaultBranch: "main",
      knownBranches: defaultBranches,
    });
    expect(
      canExportToBranch({
        ...newBranch,
        createNewBranch: true,
        knownBranches: defaultBranches,
      })
    ).toBe(true);
  });
});
