/**
 * ProjectMenu Tests
 *
 * Regression coverage: the separator between "Project controls" and
 * "Project settings" only renders when project file actions exist — no
 * double separator after the projects list.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@/contexts/ToastContext";
import { ProjectMenu } from "../ProjectMenu";
import { ProjectFileTransferProvider } from "../ProjectFileTransferContext";
import type { Project } from "@/lib/api/projects";

vi.mock("@/components/ide-shared/ZipImportFilesDialog", () => ({
  ZipImportFilesDialog: () => null,
}));

vi.mock("@/components/script-mode/GitLabSyncDialog", () => ({
  GitLabSyncDialog: () => null,
}));

const project: Project = {
  id: "proj-1",
  name: "Test Project",
  source: "GITLAB",
  duoEndingEnabled: false,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

function renderProjectMenu(withTransferActions: boolean) {
  const props = {
    projectId: "proj-1",
    projects: [project],
    setCurrentProject: vi.fn(),
    onOpenProjectSettings: vi.fn(),
    onImportGitLab: vi.fn(),
    onImportZip: vi.fn(),
    onManageProjects: vi.fn(),
  };

  const menu = <ProjectMenu {...props} />;

  render(
    <ToastProvider>
      {withTransferActions ? (
        <ProjectFileTransferProvider
          projectId="proj-1"
          fileSourceType="GITLAB"
          projectVisibility="OWNER"
        >
          {menu}
        </ProjectFileTransferProvider>
      ) : (
        menu
      )}
    </ToastProvider>
  );
}

describe("ProjectMenu", () => {
  it("renders the separator between project controls and project settings", async () => {
    const user = userEvent.setup();
    renderProjectMenu(true);

    await user.click(screen.getByRole("button", { name: "Project menu" }));
    const menu = screen.getByRole("menu");

    expect(
      within(menu).getByRole("group", { name: "Project controls" })
    ).toBeInTheDocument();
    const settingsGroup = within(menu).getByRole("group", {
      name: "Project settings",
    });
    expect(settingsGroup.previousElementSibling?.getAttribute("role")).toBe(
      "separator"
    );
    expect(within(menu).getAllByRole("separator")).toHaveLength(4);
  });

  it("does not render a second separator when no project file actions exist", async () => {
    const user = userEvent.setup();
    renderProjectMenu(false);

    await user.click(screen.getByRole("button", { name: "Project menu" }));
    const menu = screen.getByRole("menu");

    expect(
      within(menu).queryByRole("group", { name: "Project controls" })
    ).not.toBeInTheDocument();
    expect(within(menu).getAllByRole("separator")).toHaveLength(3);
    // No two separators should ever be adjacent siblings.
    for (const separator of within(menu).getAllByRole("separator")) {
      expect(separator.previousElementSibling?.getAttribute("role")).not.toBe(
        "separator"
      );
    }
  });
});
