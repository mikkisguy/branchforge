/**
 * ProjectSelector Tests
 *
 * Clicking a project in the expanded select or collapsed popover
 * must call setCurrentProject with that project.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectSelector } from "@/components/ide-shared/ProjectSelector";
import type { Project } from "@/lib/api/projects";

const projects: Project[] = [
  {
    id: "proj-1",
    name: "Alpha",
    source: "ZIP",
    duoEndingEnabled: false,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "proj-2",
    name: "Beta",
    source: "GITLAB",
    duoEndingEnabled: false,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  },
];

describe("ProjectSelector", () => {
  it("switches project from the expanded select", async () => {
    const user = userEvent.setup();
    const setCurrentProject = vi.fn();

    render(
      <ProjectSelector
        projectId="proj-1"
        projects={projects}
        setCurrentProject={setCurrentProject}
        isCollapsed={false}
        isOpen={false}
        onToggle={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const select = screen.getByRole("combobox", { name: "Select Project" });
    expect(select.tagName).toBe("SELECT");
    await user.selectOptions(select, "proj-2");

    expect(setCurrentProject).toHaveBeenCalledTimes(1);
    expect(setCurrentProject).toHaveBeenCalledWith(projects[1]);
  });

  it("switches project from the collapsed popover", async () => {
    const user = userEvent.setup();
    const setCurrentProject = vi.fn();
    const onClose = vi.fn();

    render(
      <ProjectSelector
        projectId="proj-1"
        projects={projects}
        setCurrentProject={setCurrentProject}
        isCollapsed={true}
        isOpen={true}
        onToggle={vi.fn()}
        onClose={onClose}
      />
    );

    await user.click(screen.getByRole("button", { name: "Beta" }));

    expect(setCurrentProject).toHaveBeenCalledWith(projects[1]);
    expect(onClose).toHaveBeenCalled();
  });
});
