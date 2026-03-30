/**
 * useInMemoryUndo Hook
 *
 * In-memory undo stack for immediate undo without server roundtrip.
 * Works in tandem with server-side undo for persistence.
 */

import { useState, useCallback } from "react";
import type { DialogueEntry } from "@/lib/prose-types";

interface UndoState {
  past: DialogueEntry[][];
  present: DialogueEntry[] | null;
  future: DialogueEntry[][];
}

export function useInMemoryUndo(
  entries: DialogueEntry[],
  onChange: (entries: DialogueEntry[]) => void,
  maxHistory: number = 50
) {
  const [state, setState] = useState<UndoState>({
    past: [],
    present: entries,
    future: [],
  });

  // Update present when entries change from external source (e.g., server update)
  const updatePresent = useCallback((newEntries: DialogueEntry[]) => {
    setState((prev) => ({
      ...prev,
      present: newEntries,
      future: [], // Clear future when we get a new state from server
    }));
  }, []);

  const undo = useCallback((): boolean => {
    let previousToApply: DialogueEntry[] | undefined;
    let didUndo = false;

    setState((prev) => {
      const { past, present, future } = prev;

      if (past.length === 0 || !present) return prev;

      const previous = past[past.length - 1];
      previousToApply = previous;
      const newPast = past.slice(0, past.length - 1);
      const newState = {
        past: newPast,
        present: previous,
        future: [present, ...future],
      };

      didUndo = true;
      return newState;
    });

    if (didUndo && previousToApply) {
      onChange(previousToApply);
    }

    return didUndo;
  }, [onChange]);

  const redo = useCallback((): boolean => {
    let nextValue: DialogueEntry[] | undefined;
    let didRedo = false;

    setState((prev) => {
      const { past, present, future } = prev;

      if (future.length === 0) return prev;

      const next = future[0];
      nextValue = next;
      const newFuture = future.slice(1);
      const newState = {
        past: present ? [...past, present] : past,
        present: next,
        future: newFuture,
      };

      didRedo = true;
      return newState;
    });

    if (didRedo && nextValue) {
      onChange(nextValue);
    }

    return didRedo;
  }, [onChange]);

  const recordChange = useCallback(
    (newEntries: DialogueEntry[]) => {
      setState((prev) => {
        const { past, present } = prev;

        if (!present) {
          return { ...prev, present: newEntries };
        }

        // Check if content actually changed (compare JSON strings)
        if (JSON.stringify(present) === JSON.stringify(newEntries)) {
          return prev; // No change, don't record
        }

        const newPast = [...past, present];
        // Limit history size
        if (newPast.length > maxHistory) {
          newPast.shift();
        }

        return {
          past: newPast,
          present: newEntries,
          future: [], // Clear future on new change
        };
      });
    },
    [maxHistory]
  );

  // Clear history (call when switching labels)
  const clear = useCallback(
    (initialEntries?: DialogueEntry[]) => {
      const nextPresent = initialEntries ?? entries;

      setState({
        past: [],
        present: nextPresent,
        future: [],
      });
    },
    [entries]
  );

  return {
    undo,
    redo,
    recordChange,
    updatePresent,
    clear,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
