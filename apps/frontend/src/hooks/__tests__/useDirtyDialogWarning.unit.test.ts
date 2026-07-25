/**
 * Tests for the useDirtyDialogWarning hook.
 */

import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDirtyDialogWarning } from "../useDirtyDialogWarning";

describe("useDirtyDialogWarning", () => {
  it("forwards open=true to onOpenChange immediately", () => {
    const onOpenChange = vi.fn();
    const { result } = renderHook(() =>
      useDirtyDialogWarning(false, onOpenChange)
    );

    act(() => {
      result.current.handleOpenChange(true);
    });

    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(result.current.discardDialogOpen).toBe(false);
  });

  it("closes immediately when not dirty", () => {
    const onOpenChange = vi.fn();
    const { result } = renderHook(() =>
      useDirtyDialogWarning(false, onOpenChange)
    );

    act(() => {
      result.current.handleOpenChange(false);
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(result.current.discardDialogOpen).toBe(false);
  });

  it("blocks close and opens discard dialog when dirty", () => {
    const onOpenChange = vi.fn();
    const { result } = renderHook(() =>
      useDirtyDialogWarning(true, onOpenChange)
    );

    act(() => {
      result.current.handleOpenChange(false);
    });

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(result.current.discardDialogOpen).toBe(true);
  });

  it("confirmDiscard closes the parent dialog and hides the prompt", () => {
    const onOpenChange = vi.fn();
    const { result } = renderHook(() =>
      useDirtyDialogWarning(true, onOpenChange)
    );

    act(() => {
      result.current.handleOpenChange(false);
    });
    expect(result.current.discardDialogOpen).toBe(true);

    act(() => {
      result.current.confirmDiscard();
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(result.current.discardDialogOpen).toBe(false);
  });

  it("setDiscardDialogOpen can dismiss the prompt without closing", () => {
    const onOpenChange = vi.fn();
    const { result } = renderHook(() =>
      useDirtyDialogWarning(true, onOpenChange)
    );

    act(() => {
      result.current.handleOpenChange(false);
    });
    expect(result.current.discardDialogOpen).toBe(true);

    act(() => {
      result.current.setDiscardDialogOpen(false);
    });

    expect(result.current.discardDialogOpen).toBe(false);
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
