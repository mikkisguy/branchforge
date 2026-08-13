/**
 * UndoRedoControls Component
 *
 * Undo/redo buttons with keyboard shortcuts.
 *
 * Shortcuts are defined in @/lib/keyboard-shortcuts (undo, redo).
 *
 * Uses local in-memory undo only for instant response.
 */

import { useEffect, useRef } from "react";
import { Undo2, Redo2 } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { getShortcutActionDescription } from "@/lib/keyboard-shortcuts";

interface UndoRedoControlsProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export function UndoRedoControls({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: UndoRedoControlsProps) {
  const undoHint = getShortcutActionDescription("undo", "Undo");
  const redoHint = getShortcutActionDescription("redo", "Redo");

  // Store handlers in refs to avoid re-subscribing to keydown on every render
  const onUndoRef = useRef(onUndo);
  const onRedoRef = useRef(onRedo);
  const canUndoRef = useRef(canUndo);
  const canRedoRef = useRef(canRedo);

  useEffect(() => {
    onUndoRef.current = onUndo;
    onRedoRef.current = onRedo;
    canUndoRef.current = canUndo;
    canRedoRef.current = canRedo;
  }, [onUndo, onRedo, canUndo, canRedo]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Preserve native undo/redo in editable elements (inputs, textareas, contenteditable)
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      ) {
        return;
      }

      // Ctrl+Z for undo
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.code === "KeyZ") {
        e.preventDefault();
        if (canUndoRef.current) {
          onUndoRef.current();
        }
      }

      // Ctrl+Y or Ctrl+Shift+Z for redo
      if (
        (e.ctrlKey || e.metaKey) &&
        ((!e.shiftKey && e.code === "KeyY") ||
          (e.shiftKey && e.code === "KeyZ"))
      ) {
        e.preventDefault();
        if (canRedoRef.current) {
          onRedoRef.current();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []); // Stable - reads from refs

  return (
    <div className="flex items-center gap-1">
      <Tooltip content={undoHint}>
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          aria-disabled={!canUndo}
          className={`p-1.5 rounded-md transition-all ${
            canUndo
              ? "hover:bg-muted text-foreground hover:text-[var(--theme-color)]"
              : "text-muted-foreground/30 cursor-not-allowed"
          }`}
          aria-label="Undo"
        >
          <Undo2 className="size-4" />
        </button>
      </Tooltip>
      <Tooltip content={redoHint}>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          aria-disabled={!canRedo}
          className={`p-1.5 rounded-md transition-all ${
            canRedo
              ? "hover:bg-muted text-foreground hover:text-[var(--theme-color)]"
              : "text-muted-foreground/30 cursor-not-allowed"
          }`}
          aria-label="Redo"
        >
          <Redo2 className="size-4" />
        </button>
      </Tooltip>
    </div>
  );
}
