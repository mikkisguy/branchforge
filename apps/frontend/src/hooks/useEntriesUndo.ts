import { useState, useCallback, useRef, useEffect } from "react";
import type { DialogueEntry } from "@/lib/prose-types";
import { areDialogueEntriesEqual } from "@/lib/prose-converter";

interface UndoState {
  past: DialogueEntry[][];
  present: DialogueEntry[] | null;
  future: DialogueEntry[][];
}

export function useEntriesUndo(
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

  // Track the last entries we recorded/synced to detect external changes
  const lastSyncedEntriesRef = useRef<DialogueEntry[]>(entries);

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
      lastSyncedEntriesRef.current = newEntries;
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
    lastSyncedEntriesRef.current = previous;

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
    lastSyncedEntriesRef.current = next;

    return true;
  }, [commitState, onChange]);

  const recordChange = useCallback(
    (newEntries: DialogueEntry[]) => {
      const current = stateRef.current;
      const { past, present } = current;

      if (!present) {
        commitState({ ...current, present: newEntries });
        lastSyncedEntriesRef.current = newEntries;
        return;
      }

      // Check if content actually changed compared to last synced state
      // We compare with lastSyncedEntriesRef instead of present because the effect
      // may have already updated present to match newEntries
      if (areDialogueEntriesEqual(lastSyncedEntriesRef.current, newEntries)) {
        return; // No change, don't record
      }

      // Use the current present as the state to save in history (before effect updated it)
      const previousState = lastSyncedEntriesRef.current;

      const newPast = [...past, previousState];
      // Limit history size
      if (newPast.length > maxHistory) {
        newPast.shift();
      }

      commitState({
        past: newPast,
        present: newEntries,
        future: [], // Clear future on new change
      });

      // Track that we've recorded this state
      lastSyncedEntriesRef.current = newEntries;
    },
    [commitState, maxHistory]
  );

  // Clear history (call when switching labels)
  const clear = useCallback(
    (initialEntries?: DialogueEntry[]) => {
      const nextPresent = initialEntries ?? stateRef.current.present ?? [];

      commitState({
        past: [],
        present: nextPresent,
        future: [],
      });
      lastSyncedEntriesRef.current = nextPresent;
    },
    [commitState]
  );

  // Sync internal state with entries prop when it changes from external sources
  // We detect external changes by comparing with lastSyncedEntriesRef
  useEffect(() => {
    // Check if this is an external change (entries prop changed but we didn't record it)
    // react-doctor-disable-next-line react-doctor/no-event-handler
    if (!areDialogueEntriesEqual(entries, lastSyncedEntriesRef.current)) {
      // External change detected - update present and clear future
      // NOTE: Don't update lastSyncedEntriesRef here - let recordChange do that
      // so that debounced changes are still recorded properly
      const nextState: UndoState = {
        ...stateRef.current,
        present: entries,
        future: [],
      };
      // react-doctor-disable-next-line react-doctor/no-derived-state
      commitState(nextState);
    }
  }, [entries, commitState]);

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
