/**
 * UndoRedoControls Component
 *
 * Undo/redo buttons with keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z).
 * Works with both in-memory and server-side undo/redo.
 */

import { useEffect, useCallback } from "react";
import { Undo2, Redo2 } from "lucide-react";

interface UndoRedoControlsProps {
  canUndo: boolean;
  canRedo: boolean;
  canUndoImmediate: boolean;
  canRedoImmediate: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onUndoImmediate: () => void;
  onRedoImmediate: () => void;
  isUndoing?: boolean;
  isRedoing?: boolean;
}

export function UndoRedoControls({
  canUndo,
  canRedo,
  canUndoImmediate,
  canRedoImmediate,
  onUndo,
  onRedo,
  onUndoImmediate,
  onRedoImmediate,
  isUndoing = false,
  isRedoing = false,
}: UndoRedoControlsProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Preserve native undo/redo in editable elements (inputs, textareas, contenteditable)
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      ) {
        return;
      }

      // Ctrl+Z for undo - prefer persisted server history when available
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "z") {
        e.preventDefault();
        if (canUndo && !isUndoing) {
          onUndo();
        } else if (canUndoImmediate && !isUndoing) {
          onUndoImmediate();
        }
      }
      // Ctrl+Shift+Z or Ctrl+Y for redo - prefer persisted server history when available
      if (
        ((e.ctrlKey || e.metaKey) &&
          e.shiftKey &&
          e.key.toLowerCase() === "z") ||
        ((e.ctrlKey || e.metaKey) && e.key === "y")
      ) {
        e.preventDefault();
        if (canRedo && !isRedoing) {
          onRedo();
        } else if (canRedoImmediate && !isRedoing) {
          onRedoImmediate();
        }
      }
    },
    [
      canUndo,
      canRedo,
      canUndoImmediate,
      canRedoImmediate,
      isUndoing,
      isRedoing,
      onUndo,
      onRedo,
      onUndoImmediate,
      onRedoImmediate,
    ]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const hasUndo = canUndoImmediate || canUndo;
  const hasRedo = canRedoImmediate || canRedo;

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => {
          if (canUndo) {
            onUndo();
          } else {
            onUndoImmediate();
          }
        }}
        disabled={!hasUndo || isUndoing}
        className={`p-1.5 rounded-md transition-all ${
          hasUndo
            ? "hover:bg-muted text-foreground hover:text-[var(--theme-color)]"
            : "text-muted-foreground/30 cursor-not-allowed"
        }`}
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
        aria-disabled={!hasUndo || isUndoing}
      >
        <Undo2 className="w-4 h-4" />
      </button>
      <button
        onClick={() => {
          if (canRedo) {
            onRedo();
          } else {
            onRedoImmediate();
          }
        }}
        disabled={!hasRedo || isRedoing || isUndoing}
        className={`p-1.5 rounded-md transition-all ${
          hasRedo && !isUndoing && !isRedoing
            ? "hover:bg-muted text-foreground hover:text-[var(--theme-color)]"
            : "text-muted-foreground/30 cursor-not-allowed"
        }`}
        title="Redo (Ctrl+Shift+Z)"
        aria-label="Redo"
        aria-disabled={!hasRedo || isRedoing || isUndoing}
      >
        <Redo2 className="w-4 h-4" />
      </button>
    </div>
  );
}
