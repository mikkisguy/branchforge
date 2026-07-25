/**
 * Tests for the dirty-form guard on ProjectEditDialog (oracle SF-1).
 *
 * Verifies that the Save Changes button is disabled when the form is
 * clean, that unsaved changes trigger a discard confirmation on Cancel,
 * and that the dialog closes cleanly on successful save without showing
 * the discard prompt.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Project } from "@/lib/api/projects";
import { ProjectEditDialog } from "@/components/ide-shared/ProjectEditDialog";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockProject: Project = {
  id: "project-1",
  name: "Test Project",
  description: "A test project description",
  source: "GITLAB",
  duoEndingEnabled: false,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

const updatedProject: Project = {
  ...mockProject,
  name: "Updated Project",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ProjectEditDialog — dirty form guard (SF-1)", () => {
  const onOpenChange = vi.fn();
  const onUpdate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("disables Save Changes when the form is clean", () => {
    render(
      <ProjectEditDialog
        open
        project={mockProject}
        isProjectOwner
        onOpenChange={onOpenChange}
        onUpdate={onUpdate}
      />
    );

    expect(
      screen.getByRole("button", { name: /save changes/i })
    ).toBeDisabled();
  });

  it("enables Save Changes after editing the name field", async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <ProjectEditDialog
        open
        project={mockProject}
        isProjectOwner
        onOpenChange={onOpenChange}
        onUpdate={onUpdate}
      />
    );

    const nameInput = screen.getByLabelText(/project name/i);
    await user.type(nameInput, "2");

    expect(screen.getByRole("button", { name: /save changes/i })).toBeEnabled();
  });

  it("shows discard confirmation when Cancel is clicked with dirty form", async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <ProjectEditDialog
        open
        project={mockProject}
        isProjectOwner
        onOpenChange={onOpenChange}
        onUpdate={onUpdate}
      />
    );

    // Edit the name so the form becomes dirty
    const nameInput = screen.getByLabelText(/project name/i);
    await user.type(nameInput, "2");

    // Click the Cancel button
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    // ConfirmDialog should appear with the discard message
    expect(screen.getByText(/discard unsaved changes/i)).toBeInTheDocument();
  });

  it("calls onOpenChange(false) when Discard is clicked", async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <ProjectEditDialog
        open
        project={mockProject}
        isProjectOwner
        onOpenChange={onOpenChange}
        onUpdate={onUpdate}
      />
    );

    const nameInput = screen.getByLabelText(/project name/i);
    await user.type(nameInput, "2");
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    await user.click(screen.getByRole("button", { name: /^discard$/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps the dialog open when Keep editing is clicked after dirty cancel", async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <ProjectEditDialog
        open
        project={mockProject}
        isProjectOwner
        onOpenChange={onOpenChange}
        onUpdate={onUpdate}
      />
    );

    const nameInput = screen.getByLabelText(/project name/i);
    await user.type(nameInput, "2");
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    await user.click(screen.getByRole("button", { name: /^keep editing$/i }));

    // The discard dialog is dismissed but the main dialog stays open
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("closes dialog via onOpenChange(false) on successful save without discard prompt", async () => {
    onUpdate.mockResolvedValue(updatedProject);
    const user = userEvent.setup({ delay: null });
    render(
      <ProjectEditDialog
        open
        project={mockProject}
        isProjectOwner
        onOpenChange={onOpenChange}
        onUpdate={onUpdate}
      />
    );

    const nameInput = screen.getByLabelText(/project name/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Updated Project");

    await user.click(screen.getByRole("button", { name: /^save changes$/i }));

    // The update API was called with correct args
    expect(onUpdate).toHaveBeenCalledWith("project-1", {
      name: "Updated Project",
      description: "A test project description",
    });

    // The dialog closed (onOpenChange(false) was called from handleSubmit)
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
