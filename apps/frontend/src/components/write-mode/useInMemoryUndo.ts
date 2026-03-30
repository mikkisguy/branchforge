/**
 * useInMemoryUndo Hook
 *
 * In-memory undo stack for immediate undo without server roundtrip.
 * Works in tandem with server-side undo for persistence.
 */

import { useState, useCallback, useRef } from "react";
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
  const initialState: UndoState = {
    past: [],
    present: entries,
    future: [],
  };

  const [state, setState] = useState<UndoState>(initialState);
  const stateRef = useRef<UndoState>(initialState);

  const commitState = useCallback((nextState: UndoState) => {
    stateRef.current = nextState;
    setState(nextState);
  }, []);

  // Update present when entries change from external source (e.g., server update)
  const updatePresent = useCallback(
    (newEntries: DialogueEntry[]) => {
      const nextState: UndoState = {
        ...stateRef.current,
        present: newEntries,
        future: [], // Clear future when we get a new state from server
      };

      commitState(nextState);
    },
    [commitState]
  );

  const undo = useCallback((): boolean => {
    const current = stateRef.current;
    const { past, present, future } = current;

    if (past.length === 0 || !present) return false;

    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);
    const nextState: UndoState = {
      past: newPast,
      present: previous,
      future: [present, ...future],
    };

    commitState(nextState);
    onChange(previous);

    return true;
  }, [commitState, onChange]);

  const redo = useCallback((): boolean => {
    const current = stateRef.current;
    const { past, present, future } = current;

    if (future.length === 0) return false;

    const next = future[0];
    const newFuture = future.slice(1);
    const nextState: UndoState = {
      past: present ? [...past, present] : past,
      present: next,
      future: newFuture,
    };

    commitState(nextState);
    onChange(next);

    return true;
  }, [commitState, onChange]);

  const recordChange = useCallback(
    (newEntries: DialogueEntry[]) => {
      const current = stateRef.current;
      const { past, present } = current;

      if (!present) {
        commitState({ ...current, present: newEntries });
        return;
      }

      // Check if content actually changed (compare JSON strings)
      if (JSON.stringify(present) === JSON.stringify(newEntries)) {
        return; // No change, don't record
      }

      const newPast = [...past, present];
      // Limit history size
      if (newPast.length > maxHistory) {
        newPast.shift();
      }

      commitState({
        past: newPast,
        present: newEntries,
        future: [], // Clear future on new change
      });
    },
    [commitState, maxHistory]
  );

  // Clear history (call when switching labels)
  const clear = useCallback(
    (initialEntries?: DialogueEntry[]) => {
      const nextPresent = initialEntries ?? entries;

      commitState({
        past: [],
        present: nextPresent,
        future: [],
      });
    },
    [commitState, entries]
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
