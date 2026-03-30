import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useInMemoryUndo } from "../useInMemoryUndo";
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

describe("useInMemoryUndo", () => {
  it("does not emit changes when undo/redo are unavailable", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useInMemoryUndo(entriesA, onChange));

    act(() => {
      result.current.undo();
      result.current.redo();
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("clears history with explicit initial entries", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useInMemoryUndo(entriesA, onChange));

    act(() => {
      result.current.recordChange(entriesA2);
    });

    act(() => {
      result.current.clear(entriesB);
    });

    act(() => {
      result.current.undo();
    });

    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      result.current.recordChange(entriesB2);
    });

    act(() => {
      result.current.undo();
    });

    expect(onChange).toHaveBeenLastCalledWith(entriesB);
  });
});
