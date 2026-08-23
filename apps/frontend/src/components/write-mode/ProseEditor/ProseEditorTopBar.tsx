/**
 * ProseEditorTopBar Component
 *
 * Top bar for the prose editor showing label title, status badge,
 * undo/redo controls, and save indicator.
 */

import { UndoRedoControls } from "@/components/ide-shared";
import { SaveIndicator } from "../SaveIndicator";
import { propsToSaveStatus } from "./utils/proseEditorUtils";
import type { LabelDetail } from "@branchforge/shared";

interface ProseEditorTopBarProps {
  /** The currently active label */
  activeLabel: LabelDetail;
  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;
  /** Undo handler */
  onUndo: () => void;
  /** Redo handler */
  onRedo: () => void;
  /** Whether the editor is currently saving */
  isSaving: boolean;
  /** Whether there was a save error */
  saveError: boolean;
  /** Timestamp of last successful save */
  lastSaved: Date | null;
  /** Whether there is a save conflict */
  saveConflict: boolean;
}

/**
 * Top bar for the prose editor.
 *
 * Displays the label title with a status badge on the left,
 * and undo/redo controls with a save indicator on the right.
 * Hidden when focus mode is active.
 */
export function ProseEditorTopBar({
  activeLabel,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  isSaving,
  saveError,
  lastSaved,
  saveConflict,
}: ProseEditorTopBarProps) {
  return (
    <div className="px-4 py-3 border-b border-border bg-card rounded-t-lg flex items-center justify-between">
      <div className="flex items-center gap-3 min-w-0">
        {/* Label title */}
        <span className="text-sm font-medium text-foreground truncate">
          {activeLabel.title}
        </span>
        {/* Scene status badge */}
        <span
          className={`px-2 py-0.4 rounded-full text-xs font-medium border shrink-0 ${
            activeLabel.status === "FINAL"
              ? "bg-[var(--theme-final-color)]/20 text-[var(--theme-final-color)] border-[var(--theme-final-color)]/30"
              : activeLabel.status === "REVIEW"
                ? "bg-[var(--theme-review-color)]/20 text-[var(--theme-review-color)] border-[var(--theme-review-color)]/30"
                : "bg-[var(--theme-draft-color)]/20 text-[var(--theme-draft-color)] border-[var(--theme-draft-color)]/30"
          }`}
        >
          {activeLabel.status?.toLowerCase() || "draft"}
        </span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="max-md:hidden">
          <UndoRedoControls
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={onUndo}
            onRedo={onRedo}
          />
        </div>
        <SaveIndicator
          saveStatus={propsToSaveStatus(isSaving, saveError)}
          displayMode="compact"
          lastSaved={lastSaved}
          saveConflict={saveConflict}
        />
      </div>
    </div>
  );
}
