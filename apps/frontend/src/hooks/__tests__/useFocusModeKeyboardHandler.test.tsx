import { act, fireEvent, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useFocusModeKeyboardHandler } from "../useFocusModeKeyboardHandler";

describe("useFocusModeKeyboardHandler", () => {
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
});
