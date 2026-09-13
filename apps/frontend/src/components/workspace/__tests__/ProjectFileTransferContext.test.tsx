/**
 * ProjectFileTransferContext Tests
 *
 * Regression coverage: current-project ZIP import is owner-only. A reader
 * must not be offered the action or the rendered import dialog.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@/contexts/ToastContext";
import {
  ProjectFileTransferProvider,
  useProjectFileTransferActions,
} from "../ProjectFileTransferContext";

vi.mock("@/components/ide-shared/ZipImportFilesDialog", () => ({
  ZipImportFilesDialog: ({ open }: { open: boolean }) => (
    <div data-testid="zip-import-dialog" data-open={String(open)} />
  ),
}));

vi.mock("@/components/script-mode/GitLabSyncDialog", () => ({
  GitLabSyncDialog: () => null,
}));

function TransferActionsProbe() {
  const { actions } = useProjectFileTransferActions();
  return (
    <div>
      <span data-testid="zip-import-action">
        {actions?.onImportZip ? "available" : "hidden"}
      </span>
      <span data-testid="zip-export-action">
        {actions?.onExportZip ? "available" : "hidden"}
      </span>
      {actions?.onImportZip ? (
        <button type="button" onClick={actions.onImportZip}>
          Trigger ZIP import
        </button>
      ) : null}
    </div>
  );
}

function renderProvider(
  projectVisibility?: "OWNER" | "READER" | "TESTER",
  fileSourceType: "ZIP" | "GITLAB" = "ZIP"
) {
  return render(
    <ToastProvider>
      <ProjectFileTransferProvider
        projectId="proj-1"
        projectName="Test Project"
        fileSourceType={fileSourceType}
        projectVisibility={projectVisibility}
      >
        <TransferActionsProbe />
      </ProjectFileTransferProvider>
    </ToastProvider>
  );
}

describe("ProjectFileTransferProvider", () => {
  it("hides current-project ZIP import actions and dialog from readers", () => {
    renderProvider("READER");

    expect(screen.getByTestId("zip-import-action")).toHaveTextContent("hidden");
    expect(screen.getByTestId("zip-export-action")).toHaveTextContent(
      "available"
    );
    expect(screen.queryByTestId("zip-import-dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Trigger ZIP import" })
    ).not.toBeInTheDocument();
  });

  it("exposes current-project ZIP import actions and dialog to owners", async () => {
    const user = userEvent.setup();
    renderProvider("OWNER");

    expect(screen.getByTestId("zip-import-action")).toHaveTextContent(
      "available"
    );
    expect(screen.getByTestId("zip-import-dialog")).toHaveAttribute(
      "data-open",
      "false"
    );

    await user.click(
      screen.getByRole("button", { name: "Trigger ZIP import" })
    );
    expect(screen.getByTestId("zip-import-dialog")).toHaveAttribute(
      "data-open",
      "true"
    );
  });

  it("hides ZIP import when the project visibility is unknown", () => {
    renderProvider(undefined);

    expect(screen.getByTestId("zip-import-action")).toHaveTextContent("hidden");
    expect(screen.queryByTestId("zip-import-dialog")).not.toBeInTheDocument();
  });

  it("never exposes ZIP import for non-ZIP projects regardless of role", () => {
    renderProvider("OWNER", "GITLAB");

    expect(screen.getByTestId("zip-import-action")).toHaveTextContent("hidden");
    // The import dialog may stay mounted but always remains closed.
    expect(screen.getByTestId("zip-import-dialog")).toHaveAttribute(
      "data-open",
      "false"
    );
    expect(
      screen.queryByRole("button", { name: "Trigger ZIP import" })
    ).not.toBeInTheDocument();
  });
});
