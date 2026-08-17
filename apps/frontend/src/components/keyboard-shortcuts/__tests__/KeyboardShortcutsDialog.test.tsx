import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import * as keyboardShortcuts from "@/lib/keyboard-shortcuts";
import { KeyboardShortcutsDialog } from "../KeyboardShortcutsDialog";

/**
 * Interaction coverage for KeyboardShortcutsDialog.
 *
 * KeyboardShortcutsDialog is a DialogShell over the shared Dialog/useFocusTrap
 * stack. This suite covers dialog-specific wiring:
 * - trigger open + focus entry
 * - footer Close / header X close
 * - Escape via the native `cancel` event (jsdom does not implement Escape-to-close)
 *
 * Full Tab / Shift+Tab focus-trap cycling is covered by the shared primitive
 * suite in `components/__tests__/DialogA11y.test.tsx`:
 * - "cycles Tab from last to first focusable in dialog"
 * - "cycles Shift+Tab from first to last focusable in dialog"
 * Re-testing that trap here would only duplicate DialogShell's dependency.
 */

function ControlledDialog({
  initiallyOpen = false,
}: {
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open shortcuts
      </button>
      <KeyboardShortcutsDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function getActiveElement() {
  return document.activeElement as HTMLElement | null;
}

describe("KeyboardShortcutsDialog", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the open dialog with title, sections, and shortcuts", () => {
    render(<KeyboardShortcutsDialog open onOpenChange={vi.fn()} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Keyboard shortcuts" })
    ).toBeInTheDocument();

    expect(
      screen.getByRole("heading", { name: "General" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Write Mode" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Script Mode" })
    ).toBeInTheDocument();

    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(screen.getByText("Undo")).toBeInTheDocument();
    expect(screen.getByText("Redo")).toBeInTheDocument();
    expect(screen.getByText("Toggle focus mode")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("follows dialog accessibility patterns for name and labelled content", () => {
    render(<KeyboardShortcutsDialog open onOpenChange={vi.fn()} />);

    const dialog = document.querySelector("dialog");
    const heading = screen.getByRole("heading", { name: "Keyboard shortcuts" });

    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog?.getAttribute("aria-labelledby")).toBe(
      heading.getAttribute("id")
    );

    const description = screen.getByText(
      "Modifier keys follow your platform: Control (Ctrl) on Windows and Linux, Command (⌘) on macOS."
    );
    expect(description).toBeInTheDocument();
    expect(dialog?.getAttribute("aria-describedby")).toBe(
      description.getAttribute("id")
    );
    expect(
      screen.getByRole("button", {
        name: "Close keyboard shortcuts dialog",
      })
    ).toBeInTheDocument();
  });

  it("uses mac platform keycaps when detectShortcutPlatform returns mac", () => {
    vi.spyOn(keyboardShortcuts, "detectShortcutPlatform").mockReturnValue(
      "mac"
    );

    render(<KeyboardShortcutsDialog open onOpenChange={vi.fn()} />);

    expect(screen.getAllByText("⌘").length).toBeGreaterThan(0);
  });

  it("uses windows platform keycaps when detectShortcutPlatform returns windows", () => {
    vi.spyOn(keyboardShortcuts, "detectShortcutPlatform").mockReturnValue(
      "windows"
    );

    render(<KeyboardShortcutsDialog open onOpenChange={vi.fn()} />);

    expect(screen.getAllByText("Ctrl").length).toBeGreaterThan(0);
  });

  it("opens from a trigger and moves focus into the dialog", async () => {
    const user = userEvent.setup();
    render(<ControlledDialog initiallyOpen={false} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open shortcuts" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Keyboard shortcuts" })
    ).toBeInTheDocument();

    const active = getActiveElement();
    expect(active).not.toBeNull();
    expect(dialog.contains(active)).toBe(true);
  });

  it("closes when the footer Close button is clicked", async () => {
    const user = userEvent.setup();
    render(<ControlledDialog initiallyOpen />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes when the header X close button is clicked", async () => {
    const user = userEvent.setup();
    render(<ControlledDialog initiallyOpen />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Close keyboard shortcuts dialog" })
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on native cancel (Escape path in Dialog)", () => {
    // jsdom does not fully implement native <dialog> Escape-to-close.
    // Our Dialog listens for cancel and calls onOpenChange(false) — same
    // pattern as DialogA11y.test.tsx.
    render(<ControlledDialog initiallyOpen />);

    const dialog = document.querySelector("dialog");
    expect(dialog).not.toBeNull();

    const cancelEvent = new Event("cancel", { cancelable: true });
    act(() => {
      dialog!.dispatchEvent(cancelEvent);
    });

    expect(cancelEvent.defaultPrevented).toBe(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
