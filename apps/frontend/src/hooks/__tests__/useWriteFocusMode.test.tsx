import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { useWriteFocusMode } from "../useWriteFocusMode";

const keyboardHookSpy = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useFocusModeKeyboardHandler", () => ({
  useFocusModeKeyboardHandler: keyboardHookSpy,
}));

describe("useWriteFocusMode", () => {
  beforeEach(() => {
    keyboardHookSpy.mockClear();
    window.localStorage.clear();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(
      (callback: FrameRequestCallback) => {
        callback(0);
        return 0;
      }
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers focus mode keyboard handler", () => {
    const editorRef = createRef<{ focus: () => void } | null>();
    editorRef.current = {
      focus: vi.fn(),
    };

    renderHook(() =>
      useWriteFocusMode({
        isLeftSidebarCollapsed: false,
        setIsLeftSidebarCollapsed: vi.fn(),
        isRightSidebarCollapsed: false,
        setIsRightSidebarCollapsed: vi.fn(),
        editorRef,
      })
    );

    expect(keyboardHookSpy).toHaveBeenCalledTimes(1);
    expect(typeof keyboardHookSpy.mock.calls[0]?.[0]).toBe("function");
  });

  it("toggles focus mode and restores sidebar state", () => {
    const editorFocus = vi.fn();
    const setIsLeftSidebarCollapsed = vi.fn();
    const setIsRightSidebarCollapsed = vi.fn();
    const editorRef = createRef<{ focus: () => void } | null>();
    editorRef.current = { focus: editorFocus };

    const { result } = renderHook(() =>
      useWriteFocusMode({
        isLeftSidebarCollapsed: true,
        setIsLeftSidebarCollapsed,
        isRightSidebarCollapsed: false,
        setIsRightSidebarCollapsed,
        editorRef,
      })
    );

    act(() => {
      result.current.handleFocusModeToggle();
    });

    expect(result.current.isFocusMode).toBe(true);
    expect(editorFocus).toHaveBeenCalledTimes(1);
    expect(setIsLeftSidebarCollapsed).toHaveBeenNthCalledWith(1, true);
    expect(setIsRightSidebarCollapsed).toHaveBeenNthCalledWith(1, true);

    act(() => {
      result.current.handleFocusModeToggle();
    });

    expect(result.current.isFocusMode).toBe(false);
    expect(setIsLeftSidebarCollapsed).toHaveBeenNthCalledWith(2, true);
    expect(setIsRightSidebarCollapsed).toHaveBeenNthCalledWith(2, false);
  });

  it("rehydrates focus mode with sidebar initialization", () => {
    window.localStorage.setItem("branchforge:write:focus-mode", "true");

    const editorFocus = vi.fn();
    const setIsLeftSidebarCollapsed = vi.fn();
    const setIsRightSidebarCollapsed = vi.fn();
    const editorRef = createRef<{ focus: () => void } | null>();
    editorRef.current = { focus: editorFocus };

    const { result } = renderHook(() =>
      useWriteFocusMode({
        isLeftSidebarCollapsed: false,
        setIsLeftSidebarCollapsed,
        isRightSidebarCollapsed: false,
        setIsRightSidebarCollapsed,
        editorRef,
      })
    );

    expect(result.current.isFocusMode).toBe(true);
    expect(setIsLeftSidebarCollapsed).toHaveBeenNthCalledWith(1, true);
    expect(setIsRightSidebarCollapsed).toHaveBeenNthCalledWith(1, true);
    expect(editorFocus).not.toHaveBeenCalled();

    act(() => {
      result.current.handleFocusModeToggle();
    });

    expect(result.current.isFocusMode).toBe(false);
    expect(setIsLeftSidebarCollapsed).toHaveBeenNthCalledWith(2, false);
    expect(setIsRightSidebarCollapsed).toHaveBeenNthCalledWith(2, false);
  });
});
