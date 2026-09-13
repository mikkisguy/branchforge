import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScriptModeDialogs } from "../ScriptModeDialogs";

vi.mock("@/components/ide-shared/ZipImportFilesDialog", () => ({
  ZipImportFilesDialog: () => <div data-testid="zip-import-dialog" />,
}));

vi.mock("@/components/script-mode/GitLabSyncDialog", () => ({
  GitLabSyncDialog: () => null,
}));

describe("ScriptModeDialogs", () => {
  it("does not mount ZIP import for readers even when its state is open", () => {
    render(
      <ScriptModeDialogs
        projectId="project-1"
        isLinked={false}
        linkedRepo={null}
        showSyncDialog={false}
        onSyncDialogChange={vi.fn()}
        showZipImportDialog
        onZipImportDialogChange={vi.fn()}
        projectVisibility="READER"
      />
    );

    expect(screen.queryByTestId("zip-import-dialog")).not.toBeInTheDocument();
  });
});
