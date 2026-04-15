import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTextUndo } from "../useTextUndo";

describe("useTextUndo", () => {
  it("does not emit changes when undo/redo are unavailable", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useTextUndo("Alpha", onChange));

    act(() => {
      result.current.undo();
      result.current.redo();
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("returns true when undo succeeds", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useTextUndo("Alpha", onChange));

    expect(result.current.canUndo).toBe(false);

    act(() => {
      result.current.recordChange("Alpha edited");
    });

    expect(result.current.canUndo).toBe(true);

    let undoResult: boolean | undefined;
    act(() => {
      undoResult = result.current.undo();
    });

    expect(undoResult).toBe(true);
  });

  it("calls onChange when undo is available", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useTextUndo("Alpha", onChange));

    act(() => {
      result.current.recordChange("Beta");
    });

    act(() => {
      result.current.undo();
    });

    expect(onChange).toHaveBeenCalledWith("Alpha");
  });

  it("clears history with explicit initial content", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useTextUndo("Alpha", onChange));

    act(() => {
      result.current.recordChange("Alpha edited");
    });
    expect(result.current.canUndo).toBe(true);

    act(() => {
      result.current.clear("Beta");
    });
    expect(result.current.canUndo).toBe(false);

    act(() => {
      result.current.undo();
    });
    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      result.current.recordChange("Beta edited");
    });
    expect(result.current.canUndo).toBe(true);

    act(() => {
      result.current.undo();
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("Beta");
  });

  it("does not record changes when content is the same", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useTextUndo("Alpha", onChange));

    act(() => {
      result.current.recordChange("Alpha");
    });

    expect(result.current.canUndo).toBe(false);
  });

  it("limits history size to maxHistory", () => {
    const onChange = vi.fn();
    const maxHistory = 3;
    const { result } = renderHook(() =>
      useTextUndo("Initial", onChange, maxHistory)
    );

    act(() => {
      result.current.recordChange("Change 1");
      result.current.recordChange("Change 2");
      result.current.recordChange("Change 3");
      result.current.recordChange("Change 4");
    });

    expect(result.current.canUndo).toBe(true);

    act(() => {
      result.current.undo();
      result.current.undo();
      result.current.undo();
    });

    expect(result.current.canUndo).toBe(false);
  });

  it("clears future when recording new change", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useTextUndo("Alpha", onChange));

    act(() => {
      result.current.recordChange("Beta");
    });

    act(() => {
      result.current.undo();
    });

    expect(result.current.canRedo).toBe(true);

    act(() => {
      result.current.recordChange("Gamma");
    });

    expect(result.current.canRedo).toBe(false);
  });

  it("calls onChange when redo is available", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useTextUndo("Alpha", onChange));

    act(() => {
      result.current.recordChange("Beta");
    });

    act(() => {
      result.current.undo();
    });

    expect(onChange).toHaveBeenCalledWith("Alpha");
    onChange.mockClear();

    act(() => {
      result.current.redo();
    });

    expect(onChange).toHaveBeenCalledWith("Beta");
  });
});
