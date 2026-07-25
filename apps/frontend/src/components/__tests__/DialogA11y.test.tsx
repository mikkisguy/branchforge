/**
 * Tests for keyboard navigation accessibility in dialogs.
 *
 * Verifies focus trapping, tab order cycling, and dialog behavior.
 * Note: jsdom does not fully implement native <dialog> behavior
 * (showModal inerts, Escape-to-close, top-layer rendering). These tests
 * verify our explicit focus trap and event handling instead.
 */

import { describe, it, expect } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useDirtyForm } from "@/hooks/useDirtyForm";
import { useDirtyDialogWarning } from "@/hooks/useDirtyDialogWarning";
import { useState } from "react";

function TestDialogWrapper({ initialOpen = true }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);

  return (
    <>
      <button type="button" data-testid="outside-button">
        Outside
      </button>
      <Dialog open={open} onOpenChange={setOpen} aria-label="Test dialog">
        <DialogContent>
          <DialogTitle>Test Dialog</DialogTitle>
          <button type="button" data-testid="first-button">
            First
          </button>
          <button type="button" data-testid="middle-button">
            Middle
          </button>
          <button type="button" data-testid="last-button">
            Last
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}

function getActiveElement() {
  return document.activeElement as HTMLElement | null;
}

function PersistentDirtyDialog() {
  const [open, setOpen] = useState(true);
  const [name, setName] = useState("edited");
  const { isDirty } = useDirtyForm({ name: "original" }, { name });
  const {
    handleOpenChange,
    confirmDiscard,
    discardDialogOpen,
    setDiscardDialogOpen,
  } = useDirtyDialogWarning(isDirty, setOpen);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={handleOpenChange}
        aria-label="Persistent dirty"
      >
        <DialogContent>
          <DialogTitle>Persistent dirty</DialogTitle>
          <input
            aria-label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="button" onClick={() => handleOpenChange(false)}>
            Cancel
          </button>
          <button type="button" onClick={() => setOpen(false)}>
            Save and close
          </button>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={discardDialogOpen}
        onOpenChange={setDiscardDialogOpen}
        onConfirm={confirmDiscard}
        title="Discard unsaved changes?"
        description="You have unsaved changes. Are you sure you want to discard them?"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
      />
    </>
  );
}

describe("Dialog keyboard navigation", () => {
  it("moves focus into the dialog when opened", () => {
    render(<TestDialogWrapper />);

    // Focus should be inside the dialog (on one of the focusable elements)
    const activeDataTestid = getActiveElement()?.getAttribute("data-testid");
    expect(["first-button", "middle-button", "last-button"]).toContain(
      activeDataTestid
    );
  });

  it("cycles Tab from last to first focusable in dialog", async () => {
    const user = userEvent.setup();
    render(<TestDialogWrapper />);

    // Manually focus the last button
    const lastButton = screen.getByTestId("last-button");
    lastButton.focus();

    // Tab should wrap to first button (via focus trap)
    await user.tab();
    expect(getActiveElement()?.getAttribute("data-testid")).toBe(
      "first-button"
    );
  });

  it("cycles Shift+Tab from first to last focusable in dialog", async () => {
    const user = userEvent.setup();
    render(<TestDialogWrapper />);

    // Manually focus the first button
    const firstButton = screen.getByTestId("first-button");
    firstButton.focus();

    // Shift+Tab should wrap to last button (via focus trap)
    await user.tab({ shift: true });
    expect(getActiveElement()?.getAttribute("data-testid")).toBe("last-button");
  });

  it("has accessible label set via aria-label", () => {
    render(<TestDialogWrapper />);

    const dialog = document.querySelector("dialog");
    expect(dialog).not.toBeNull();
    expect(dialog!.getAttribute("aria-label")).toBe("Test dialog");
  });

  it("renders dialog content with proper structure", () => {
    render(<TestDialogWrapper />);

    expect(screen.getByText("Test Dialog")).toBeInTheDocument();
    expect(screen.getByTestId("first-button")).toBeInTheDocument();
    expect(screen.getByTestId("middle-button")).toBeInTheDocument();
    expect(screen.getByTestId("last-button")).toBeInTheDocument();
    expect(screen.getByTestId("outside-button")).toBeInTheDocument();
  });

  it("prevents default on native cancel event to block native dialog Escape close", () => {
    render(<TestDialogWrapper />);
    const dialog = document.querySelector("dialog")!;
    const cancelEvent = new Event("cancel", { cancelable: true });
    act(() => {
      dialog.dispatchEvent(cancelEvent);
    });
    expect(cancelEvent.defaultPrevented).toBe(true);
  });

  it("does not re-enter dirty guard on prop-driven close after successful save", async () => {
    const user = userEvent.setup({ delay: null });
    render(<PersistentDirtyDialog />);

    // Form starts dirty (name diverges from baseline)
    expect(screen.getByLabelText("Name")).toHaveValue("edited");

    // Simulate save-success close: parent sets open=false while still dirty
    await user.click(screen.getByRole("button", { name: /save and close/i }));

    // Prop-driven dialog.close() must not bounce into handleOpenChange(false)
    expect(
      screen.queryByRole("heading", { name: /discard unsaved changes/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: /persistent dirty/i })
    ).not.toBeInTheDocument();
  });

  it("does not reopen discard prompt after confirmDiscard on a persistent dirty form", async () => {
    const user = userEvent.setup({ delay: null });
    render(<PersistentDirtyDialog />);

    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(screen.getByText(/discard unsaved changes/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^discard$/i }));

    expect(
      screen.queryByRole("heading", { name: /discard unsaved changes/i })
    ).not.toBeInTheDocument();
  });
});
