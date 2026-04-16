/**
 * UndoRedoControls Component
 *
 * Undo/redo buttons with keyboard shortcuts.
 *
 * Shortcuts:
 * - Undo: Ctrl+Z (Windows/Linux) or Cmd+Z (macOS)
 * - Redo: Ctrl+Y or Ctrl+Shift+Z (Windows/Linux)
 *         Cmd+Y or Cmd+Shift+Z (macOS)
 *
 * Uses local in-memory undo only for instant response.
 */

import { useEffect, useCallback } from "react";
import { Undo2, Redo2 } from "lucide-react";

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

      // Ctrl+Z for undo
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.code === "KeyZ") {
        e.preventDefault();
        if (canUndo) {
          onUndo();
        }
      }

      // Ctrl+Y or Ctrl+Shift+Z for redo
      if (
        (e.ctrlKey || e.metaKey) &&
        ((!e.shiftKey && e.code === "KeyY") ||
          (e.shiftKey && e.code === "KeyZ"))
      ) {
        e.preventDefault();
        if (canRedo) {
          onRedo();
        }
      }
    },
    [canUndo, canRedo, onUndo, onRedo]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onUndo}
        disabled={!canUndo}
        aria-disabled={!canUndo}
        className={`p-1.5 rounded-md transition-all ${
          canUndo
            ? "hover:bg-muted text-foreground hover:text-[var(--theme-color)]"
            : "text-muted-foreground/30 cursor-not-allowed"
        }`}
        title="Undo (Ctrl+Z / Cmd+Z)"
        aria-label="Undo"
      >
        <Undo2 className="w-4 h-4" />
      </button>
      <button
        onClick={onRedo}
        disabled={!canRedo}
        aria-disabled={!canRedo}
        className={`p-1.5 rounded-md transition-all ${
          canRedo
            ? "hover:bg-muted text-foreground hover:text-[var(--theme-color)]"
            : "text-muted-foreground/30 cursor-not-allowed"
        }`}
        title="Redo (Ctrl+Y / Cmd+Shift+Z)"
        aria-label="Redo"
      >
        <Redo2 className="w-4 h-4" />
      </button>
    </div>
  );
}
