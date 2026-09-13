import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScriptModeEmptyState } from "../ScriptModeEmptyState";

vi.mock("@/components/script-mode/GitLabSyncDialog", () => ({
  GitLabSyncDialog: () => null,
}));

vi.mock("@/components/ide-shared/ZipImportFilesDialog", () => ({
  ZipImportFilesDialog: () => null,
}));

describe("ScriptModeEmptyState", () => {
  it("calls onNewFile when the empty-state create button is clicked", async () => {
    const onNewFile = vi.fn();
    const user = userEvent.setup();

    render(
      <ScriptModeEmptyState
        projectId="project-1"
        isLinked={false}
        showSyncDialog={false}
        onShowSyncDialogChange={vi.fn()}
        showZipImportDialog={false}
        onShowZipImportDialogChange={vi.fn()}
        onNewFile={onNewFile}
      />
    );

    await user.click(screen.getByRole("button", { name: /\+ New File/i }));

    expect(onNewFile).toHaveBeenCalledTimes(1);
  });

  it("hides + New File when the owner action is omitted", () => {
    render(
      <ScriptModeEmptyState
        projectId="project-1"
        isLinked={false}
        showSyncDialog={false}
        onShowSyncDialogChange={vi.fn()}
        showZipImportDialog={false}
        onShowZipImportDialogChange={vi.fn()}
      />
    );

    expect(
      screen.queryByRole("button", { name: /\+ New File/i })
    ).not.toBeInTheDocument();
  });

  it("hides the ZIP import control and dialog from readers", () => {
    const onShowZipImportDialogChange = vi.fn();

    render(
      <ScriptModeEmptyState
        projectId="project-1"
        isLinked={false}
        showSyncDialog={false}
        onShowSyncDialogChange={vi.fn()}
        showZipImportDialog={false}
        onShowZipImportDialogChange={onShowZipImportDialogChange}
        projectVisibility="READER"
      />
    );

    expect(
      screen.queryByRole("button", { name: /import from zip/i })
    ).not.toBeInTheDocument();
    expect(onShowZipImportDialogChange).not.toHaveBeenCalled();
  });

  it("offers the ZIP import control to owners", async () => {
    const onShowZipImportDialogChange = vi.fn();
    const user = userEvent.setup();

    render(
      <ScriptModeEmptyState
        projectId="project-1"
        isLinked={false}
        showSyncDialog={false}
        onShowSyncDialogChange={vi.fn()}
        showZipImportDialog={false}
        onShowZipImportDialogChange={onShowZipImportDialogChange}
        projectVisibility="OWNER"
      />
    );

    await user.click(screen.getByRole("button", { name: /import from zip/i }));

    expect(onShowZipImportDialogChange).toHaveBeenCalledWith(true);
  });
});
