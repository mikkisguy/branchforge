import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEntriesUndo } from "../useEntriesUndo";
import type { DialogueEntry } from "@/lib/prose-types";

const entriesA: DialogueEntry[] = [
  {
    id: "line-a",
    speakerId: null,
    text: "Alpha",
  },
];

const entriesA2: DialogueEntry[] = [
  {
    id: "line-a",
    speakerId: null,
    text: "Alpha edited",
  },
];

const entriesB: DialogueEntry[] = [
  {
    id: "line-b",
    speakerId: null,
    text: "Beta",
  },
];

const entriesB2: DialogueEntry[] = [
  {
    id: "line-b",
    speakerId: null,
    text: "Beta edited",
  },
];

describe("useEntriesUndo", () => {
  it("does not emit changes when undo/redo are unavailable", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useEntriesUndo(entriesA, onChange));

    act(() => {
      result.current.undo();
      result.current.redo();
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("returns true when undo succeeds", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useEntriesUndo(entriesA, onChange));

    // Verify initial state
    expect(result.current.canUndo).toBe(false);

    // Record a change
    act(() => {
      result.current.recordChange(entriesB);
    });

    // Verify state was updated
    expect(result.current.canUndo).toBe(true);

    // Try to undo
    let undoResult: boolean | undefined;
    act(() => {
      undoResult = result.current.undo();
    });

    // Verify undo succeeded
    expect(undoResult).toBe(true);
  });

  it("calls onChange when undo is available", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useEntriesUndo(entriesA, onChange));

    act(() => {
      result.current.recordChange(entriesB);
    });

    act(() => {
      result.current.undo();
    });

    expect(onChange).toHaveBeenCalledWith(entriesA);
  });

  it("clears history with explicit initial entries", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useEntriesUndo(entriesA, onChange));

    // Record first change
    act(() => {
      result.current.recordChange(entriesA2);
    });
    expect(result.current.canUndo).toBe(true);

    // Clear with entriesB
    act(() => {
      result.current.clear(entriesB);
    });
    expect(result.current.canUndo).toBe(false);

    // Undo should do nothing (no history)
    act(() => {
      result.current.undo();
    });
    expect(onChange).not.toHaveBeenCalled();

    // Record new change (entriesB -> entriesB2)
    act(() => {
      result.current.recordChange(entriesB2);
    });
    expect(result.current.canUndo).toBe(true);

    // Undo should restore entriesB
    act(() => {
      result.current.undo();
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(entriesB);
  });
});
