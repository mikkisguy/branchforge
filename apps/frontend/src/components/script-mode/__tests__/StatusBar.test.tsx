import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StatusBar } from "../StatusBar";

vi.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({ error: vi.fn() }),
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

describe("StatusBar", () => {
  it("groups GitLab and ZIP transfer actions in a labeled menu", async () => {
    const user = userEvent.setup();

    render(
      <StatusBar
        projectId="project-1"
        gitlabBranch="main"
        fileSourceType="GITLAB"
      />
    );

    expect(screen.getByText("main")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "Import / Export",
      })
    );

    expect(
      screen.getByRole("menuitem", { name: /pull from gitlab/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /push to gitlab/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /export zip/i })
    ).toBeInTheDocument();
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
      screen.getByRole("button", {
        name: "Import / Export",
      })
    ).toBeInTheDocument();
  });

  it("keeps ZIP import available from the same menu", async () => {
    const user = userEvent.setup();
    const onOpenZipImportDialog = vi.fn();

    render(
      <StatusBar
        projectId="project-1"
        fileSourceType="ZIP"
        onOpenZipImportDialog={onOpenZipImportDialog}
      />
    );

    await user.click(
      screen.getByRole("button", {
        name: "Import / Export",
      })
    );
    await user.click(screen.getByRole("menuitem", { name: /import zip/i }));

    expect(onOpenZipImportDialog).toHaveBeenCalledOnce();
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
});
