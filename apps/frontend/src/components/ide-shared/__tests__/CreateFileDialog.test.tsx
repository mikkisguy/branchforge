/**
 * CreateFileDialog tests
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { CreateFileDialog } from "@/components/ide-shared/CreateFileDialog";

describe("CreateFileDialog", () => {
  const onOpenChange = vi.fn();
  const onCreate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    onCreate.mockResolvedValue(undefined);
  });

  function renderDialog(
    props: Partial<ComponentProps<typeof CreateFileDialog>> = {}
  ) {
    return render(
      <CreateFileDialog
        open
        onOpenChange={onOpenChange}
        onCreate={onCreate}
        {...props}
      />
    );
  }

  it("shows validation messages for invalid paths", async () => {
    const user = userEvent.setup();
    renderDialog();

    const input = screen.getByLabelText(/file path/i);
    await user.type(input, "/labels/act.rpy");

    expect(screen.getByText("File path must be relative")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create file/i })).toBeDisabled();
  });

  it("shows validation messages for reserved file names", async () => {
    const user = userEvent.setup();
    renderDialog();

    const input = screen.getByLabelText(/file path/i);
    await user.type(input, "branchforge_stats.rpy");

    expect(
      screen.getByText("This file name is reserved by BranchForge")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create file/i })).toBeDisabled();
  });

  it("allows submit without a .rpy extension", async () => {
    const user = userEvent.setup();
    renderDialog();

    const input = screen.getByLabelText(/file path/i);
    await user.type(input, "labels/chapter_01");

    expect(screen.getByRole("button", { name: /create file/i })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /create file/i }));

    expect(onCreate).toHaveBeenCalledWith("labels/chapter_01");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("calls onCreate with the typed path", async () => {
    const user = userEvent.setup();
    renderDialog();

    const input = screen.getByLabelText(/file path/i);
    await user.type(input, "labels/chapter_01.rpy");
    await user.click(screen.getByRole("button", { name: /create file/i }));

    expect(onCreate).toHaveBeenCalledWith("labels/chapter_01.rpy");
  });

  it("disables submit while creating", () => {
    renderDialog({ isCreating: true });

    expect(screen.getByRole("button", { name: /creating/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled();
  });

  it("shows server errors", () => {
    renderDialog({ serverError: "A file with this path already exists" });

    expect(
      screen.getByText("A file with this path already exists")
    ).toBeInTheDocument();
  });

  it("closes and resets after a successful submit", async () => {
    const user = userEvent.setup();
    renderDialog();

    const input = screen.getByLabelText(/file path/i);
    await user.type(input, "labels/new_scene.rpy");
    await user.click(screen.getByRole("button", { name: /create file/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByLabelText(/file path/i)).toHaveValue("");
  });

  it("stays open on a rejected submit and clears the stale server error on edit", async () => {
    const user = userEvent.setup();
    onCreate.mockRejectedValueOnce(new Error("Resource conflict"));
    const onDismissServerError = vi.fn();

    renderDialog({
      serverError: "Resource conflict",
      onDismissServerError,
    });

    const input = screen.getByLabelText(/file path/i);
    await user.clear(input);
    await user.type(input, "labels/new_scene.rpy");
    await user.click(screen.getByRole("button", { name: /create file/i }));

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByLabelText(/file path/i)).toHaveValue(
      "labels/new_scene.rpy"
    );
    expect(onDismissServerError).toHaveBeenCalled();
  });
});
