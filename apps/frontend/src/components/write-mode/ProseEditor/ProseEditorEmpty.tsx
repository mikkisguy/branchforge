/**
 * ProseEditorEmpty Component
 *
 * Empty state renders for the prose editor when no label is selected
 * or when the selected label has no entries.
 */

import { BookOpen, PenLine } from "lucide-react";
import type { LabelDetail } from "@branchforge/shared";

interface ProseEditorEmptyProps {
  /** The currently active label (undefined means no label selected) */
  activeLabel: LabelDetail | undefined;
  /** Number of entries in the current label */
  entriesLength: number;
  /** Callback to create the first entry in an empty label */
  onCreateFirstEntry: () => void;
}

/**
 * Renders the appropriate empty state for the prose editor.
 *
 * Two states:
 * 1. No active label — informational message to select/create a label
 * 2. Active label with no entries — prompt to add the first line
 */
export function ProseEditorEmpty({
  activeLabel,
  entriesLength,
  onCreateFirstEntry,
}: ProseEditorEmptyProps) {
  if (!activeLabel) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <div className="size-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
          <BookOpen className="size-8 opacity-40" />
        </div>
        <p className="text-lg">Create new or select a label to start writing</p>
      </div>
    );
  }

  if (entriesLength === 0) {
    return (
      <div className="bg-card border border-border rounded-lg h-full flex flex-col items-center justify-center gap-6 text-muted-foreground">
        <div className="size-20 rounded-full bg-gradient-to-br from-[var(--theme-color)]/10 to-[var(--theme-color)]/5 flex items-center justify-center">
          <PenLine className="size-10 text-[var(--theme-color)]/60" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-lg font-medium text-foreground">
            This label is empty
          </p>
          <p className="text-sm opacity-70">Start writing your story</p>
        </div>
        <button
          type="button"
          onClick={onCreateFirstEntry}
          className="group px-6 py-3 rounded-lg bg-[var(--theme-color)] text-white hover:bg-[var(--theme-color-hover)] transition-colors transition-shadow duration-200 hover:shadow-lg hover:shadow-[var(--theme-color)]/20 focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)] focus:ring-offset-2 focus:ring-offset-background"
        >
          <span className="flex items-center gap-2">
            <PenLine className="size-4 group-hover:scale-110 transition-transform duration-200" />
            Add your first line
          </span>
        </button>
      </div>
    );
  }

  return null;
}
