/**
 * Tests for keyboard navigation accessibility in dialogs.
 *
 * Verifies focus trapping, tab order cycling, and dialog behavior.
 * Note: jsdom does not fully implement native <dialog> behavior
 * (showModal inerts, Escape-to-close, top-layer rendering). These tests
 * verify our explicit focus trap and event handling instead.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
});
