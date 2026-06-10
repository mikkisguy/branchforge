import { useState, useCallback, useRef, useEffect } from "react";

interface UndoState {
  past: string[];
  present: string;
  future: string[];
}

export function useTextUndo(
  content: string,
  onChange: (content: string) => void,
  maxHistory: number = 50
) {
  const initialState: UndoState = {
    past: [],
    present: content,
    future: [],
  };

  const [state, setState] = useState<UndoState>(initialState);
  const stateRef = useRef<UndoState>(initialState);

  const lastSyncedContentRef = useRef<string>(content);

  const commitState = useCallback((nextState: UndoState) => {
    stateRef.current = nextState;
    setState(nextState);
  }, []);

  const updatePresent = useCallback(
    (newContent: string) => {
      const nextState: UndoState = {
        ...stateRef.current,
        present: newContent,
        future: [],
      };

      commitState(nextState);
      lastSyncedContentRef.current = newContent;
    },
    [commitState]
  );

  const undo = useCallback((): boolean => {
    const current = stateRef.current;
    const { past, present, future } = current;

    if (past.length === 0) return false;

    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);
    const nextState: UndoState = {
      past: newPast,
      present: previous,
      future: [present, ...future],
    };

    commitState(nextState);
    onChange(previous);
    lastSyncedContentRef.current = previous;

    return true;
  }, [commitState, onChange]);

  const redo = useCallback((): boolean => {
    const current = stateRef.current;
    const { past, present, future } = current;

    if (future.length === 0) return false;

    const next = future[0];
    const newFuture = future.slice(1);
    const nextState: UndoState = {
      past: [...past, present],
      present: next,
      future: newFuture,
    };

    commitState(nextState);
    onChange(next);
    lastSyncedContentRef.current = next;

    return true;
  }, [commitState, onChange]);

  const recordChange = useCallback(
    (newContent: string) => {
      const current = stateRef.current;
      const { past } = current;

      if (lastSyncedContentRef.current === newContent) {
        return;
      }

      const previousState = lastSyncedContentRef.current;

      const newPast = [...past, previousState];
      if (newPast.length > maxHistory) {
        newPast.shift();
      }

      commitState({
        past: newPast,
        present: newContent,
        future: [],
      });

      lastSyncedContentRef.current = newContent;
    },
    [commitState, maxHistory]
  );

  const clear = useCallback(
    (initialContent?: string) => {
      const nextPresent = initialContent ?? stateRef.current.present;

      commitState({
        past: [],
        present: nextPresent,
        future: [],
      });
      lastSyncedContentRef.current = nextPresent;
    },
    [commitState]
  );

  // Sync internal state with content prop when it changes from external sources
  useEffect(() => {
    if (content !== lastSyncedContentRef.current) {
      const nextState: UndoState = {
        past: [],
        present: content,
        future: [],
      };
      // react-doctor-disable-next-line react-doctor/no-derived-state
      commitState(nextState);
      lastSyncedContentRef.current = content;
    }
  }, [content, commitState]);

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
