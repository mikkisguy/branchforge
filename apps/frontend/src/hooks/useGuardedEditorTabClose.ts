import { useLayoutEffect, useRef } from "react";
import type { KeyboardEvent, MouseEvent } from "react";

export type RunEditorTransition = (action: () => Promise<void>) => false | void;

type CloseTab = (event: MouseEvent | KeyboardEvent, id: string) => void;

interface GuardedEditorTabCloseOptions {
  activeId: string | null;
  hasPendingSave: boolean;
  save: () => Promise<boolean>;
  onClose: CloseTab;
  runEditorTransition: RunEditorTransition;
  onSaveFailed: () => void;
}

export function useGuardedEditorTabClose({
  activeId,
  hasPendingSave,
  save,
  onClose,
  runEditorTransition,
  onSaveFailed,
}: GuardedEditorTabCloseOptions): CloseTab {
  const closeRef = useRef(onClose);

  useLayoutEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  return (event, id) => {
    event.stopPropagation();
    // The workspace lock makes the editor inert and serializes tab closes with
    // project and history changes until the pending save has settled.
    runEditorTransition(async () => {
      if (
        id === activeId &&
        hasPendingSave &&
        !(await save().catch(() => false))
      ) {
        onSaveFailed();
        return;
      }
      closeRef.current(event, id);
    });
  };
}
