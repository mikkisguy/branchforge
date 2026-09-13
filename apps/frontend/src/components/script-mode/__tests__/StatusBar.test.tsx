import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { StatusBar } from "../StatusBar";
import { ToastProvider } from "@/contexts/ToastContext";
import {
  ProjectFileTransferProvider,
  useProjectFileTransferActions,
} from "@/components/workspace/ProjectFileTransferContext";

vi.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({ error: vi.fn() }),
  ToastProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/script-mode/GitLabSyncDialog", () => ({
  GitLabSyncDialog: ({
    open,
    operationType,
  }: {
    open: boolean;
    operationType: string;
  }) => (open ? <div role="dialog">{operationType} GitLab</div> : null),
}));

vi.mock("@/components/script-mode/ConflictReviewDialog", () => ({
  ConflictReviewDialog: () => null,
}));

vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: () => null,
}));

vi.mock("@/components/ide-shared/ZipImportFilesDialog", () => ({
  ZipImportFilesDialog: () => null,
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
    </div>
  );
}

describe("StatusBar", () => {
  it("leaves GitLab transfer actions out of the desktop status bar", () => {
    render(
      <StatusBar
        projectId="project-1"
        gitlabBranch="main"
        fileSourceType="GITLAB"
      />
    );

    expect(screen.getByText("main")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Import / Export" })
    ).not.toBeInTheDocument();
  });

  it("can leave branch rendering to the shared editor metadata", () => {
    render(
      <StatusBar
        projectId="project-1"
        gitlabBranch="main"
        fileSourceType="GITLAB"
        showBranch={false}
      />
    );

    expect(screen.queryByText("main")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Import / Export" })
    ).not.toBeInTheDocument();
  });

  it("uses an expandable mobile row instead of the desktop dropdown", async () => {
    const user = userEvent.setup();

    render(
      <StatusBar
        projectId="project-1"
        gitlabBranch="main"
        fileSourceType="GITLAB"
        mobile
      />
    );

    const trigger = screen.getByRole("button", {
      name: /import \/ export/i,
    });
    expect(screen.getByText("main").parentElement).toHaveClass("gap-3", "px-3");
    expect(trigger).not.toHaveClass("border");

    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: /pull from gitlab/i }));

    expect(screen.getByRole("dialog")).toHaveTextContent("import GitLab");
  });

  it("omits the reader's Import ZIP option from the mobile transfer menu", async () => {
    const user = userEvent.setup();
    const onOpenZipImportDialog = vi.fn();

    render(
      <StatusBar
        projectId="project-1"
        fileSourceType="ZIP"
        projectVisibility="READER"
        onOpenZipImportDialog={onOpenZipImportDialog}
        mobile
      />
    );

    await user.click(screen.getByRole("button", { name: /import \/ export/i }));

    expect(
      screen.queryByRole("button", { name: "Import ZIP" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Export ZIP" })
    ).toBeInTheDocument();
    expect(onOpenZipImportDialog).not.toHaveBeenCalled();
  });

  it("offers the owner's Import ZIP option in the mobile transfer menu", async () => {
    const user = userEvent.setup();
    const onOpenZipImportDialog = vi.fn();

    render(
      <StatusBar
        projectId="project-1"
        fileSourceType="ZIP"
        projectVisibility="OWNER"
        onOpenZipImportDialog={onOpenZipImportDialog}
        mobile
      />
    );

    await user.click(screen.getByRole("button", { name: /import \/ export/i }));
    await user.click(screen.getByRole("button", { name: "Import ZIP" }));

    expect(onOpenZipImportDialog).toHaveBeenCalledTimes(1);
  });

  it("does not publish the ZIP import override for readers", async () => {
    render(
      <ToastProvider>
        <ProjectFileTransferProvider
          projectId="project-1"
          fileSourceType="ZIP"
          projectVisibility="READER"
        >
          <TransferActionsProbe />
          <StatusBar
            projectId="project-1"
            fileSourceType="ZIP"
            projectVisibility="READER"
            onOpenZipImportDialog={vi.fn()}
          />
        </ProjectFileTransferProvider>
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("zip-import-action")).toHaveTextContent(
        "hidden"
      );
    });
    expect(screen.getByTestId("zip-export-action")).toHaveTextContent(
      "available"
    );
  });

  it("publishes the ZIP import override for owners", async () => {
    render(
      <ToastProvider>
        <ProjectFileTransferProvider
          projectId="project-1"
          fileSourceType="ZIP"
          projectVisibility="OWNER"
        >
          <TransferActionsProbe />
          <StatusBar
            projectId="project-1"
            fileSourceType="ZIP"
            projectVisibility="OWNER"
            onOpenZipImportDialog={vi.fn()}
          />
        </ProjectFileTransferProvider>
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("zip-import-action")).toHaveTextContent(
        "available"
      );
    });
    expect(screen.getByTestId("zip-export-action")).toHaveTextContent(
      "available"
    );
  });
});
