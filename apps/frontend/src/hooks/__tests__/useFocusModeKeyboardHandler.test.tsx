import * as keyboardShortcuts from "@/lib/keyboard-shortcuts";
import { act, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFocusModeKeyboardHandler } from "../useFocusModeKeyboardHandler";

describe("useFocusModeKeyboardHandler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls onToggle on Ctrl+Shift+F", () => {
    const onToggle = vi.fn();

    renderHook(() => useFocusModeKeyboardHandler(onToggle));

    act(() => {
      fireEvent.keyDown(window, {
        ctrlKey: true,
        shiftKey: true,
        code: "KeyF",
      });
    });

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("calls onToggle on Meta+Shift+F", () => {
    vi.spyOn(keyboardShortcuts.shortcutPlatformApi, "detect").mockReturnValue(
      "mac"
    );
    const onToggle = vi.fn();

    renderHook(() => useFocusModeKeyboardHandler(onToggle));

    act(() => {
      fireEvent.keyDown(window, {
        metaKey: true,
        shiftKey: true,
        code: "KeyF",
      });
    });

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("removes the keydown listener on unmount", () => {
    const onToggle = vi.fn();

    const { unmount } = renderHook(() => useFocusModeKeyboardHandler(onToggle));

    unmount();

    act(() => {
      fireEvent.keyDown(window, {
        ctrlKey: true,
        shiftKey: true,
        code: "KeyF",
      });
    });

    expect(onToggle).not.toHaveBeenCalled();
  });

  it("does not toggle on Ctrl+Alt+Shift+F", () => {
    const onToggle = vi.fn();
    renderHook(() => useFocusModeKeyboardHandler(onToggle));

    act(() => {
      fireEvent.keyDown(window, {
        ctrlKey: true,
        shiftKey: true,
        altKey: true,
        code: "KeyF",
      });
    });

    expect(onToggle).not.toHaveBeenCalled();
  });

  it("does not toggle when keydown target is inside an open dialog", () => {
    const onToggle = vi.fn();
    renderHook(() => useFocusModeKeyboardHandler(onToggle));

    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    const input = document.createElement("input");
    dialog.appendChild(input);
    document.body.appendChild(dialog);

    try {
      act(() => {
        fireEvent.keyDown(input, {
          ctrlKey: true,
          shiftKey: true,
          code: "KeyF",
        });
      });
      expect(onToggle).not.toHaveBeenCalled();
    } finally {
      document.body.removeChild(dialog);
    }
  });
});
