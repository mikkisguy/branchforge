/**
 * ProseEditor Component
 *
 * Main prose editor with line-by-line editing for dialogue and narration.
 * Matches app design system with theme colors and simple styling.
 */

import { lazy, Suspense, useEffect } from "react";
import type React from "react";
import { ProseEditorEmpty } from "./ProseEditorEmpty";
import { ProseEditorTopBar } from "./ProseEditorTopBar";
import { ProseEditorLines } from "./ProseEditorLines";
import { ProseEditorGoalPill } from "./ProseEditorGoalPill";
import { ProseEditorStatusBar } from "./ProseEditorStatusBar";
import { useProseEditorState } from "./useProseEditorState";
import { EMPTY_ARRAY } from "./utils/proseEditorUtils";
import type { DialogueEntry } from "@/lib/prose-types";
import type { Character, LabelDetail } from "@branchforge/shared";
const WritingStatsDialog = lazy(() =>
  import("../WritingStatsDialog").then((m) => ({
    default: m.WritingStatsDialog,
  }))
);

// ============================================================================
// Types & Constants
// ============================================================================

interface ProseEditorProps {
  activeLabel: LabelDetail | undefined;
  characters: Character[];
  onChange: (entries: DialogueEntry[]) => void;
  isFocusMode?: boolean;
  isSaving?: boolean;
  lastSaved?: Date | null;
  saveError?: boolean;
  saveConflict?: boolean;
  /** Callback when undo/redo availability changes. Used by mobile FAB. */
  onUndoStateChange?: (state: { canUndo: boolean; canRedo: boolean }) => void;
  /** Callback when today's word count or daily goal changes. Used by mobile FAB. */
  onWordCountChange?: (stats: {
    todayWordCount: number;
    dailyGoal: number;
  }) => void;
  /** Controlled badge visibility. When provided, overrides internal state. */
  showBadges?: boolean;
  onShowBadgesChange?: (showBadges: boolean) => void;
  /** Controlled line layout mode. When provided, overrides internal state. */
  layoutMode?: LineLayoutMode;
  onLayoutModeChange?: (mode: LineLayoutMode) => void;
  /** Controlled font size (px). When provided, FontSizeSwitcher uses this value instead of internal localStorage. */
  fontSizeValue?: number;
  onFontSizeChange?: (value: number) => void;
  /** Controlled font family. When provided, FontFamilySwitcher uses this value instead of internal localStorage. */
  fontFamilyValue?: string;
  onFontFamilyChange?: (value: string) => void;
  /** Hide internal top/status chrome when lifted to WorkspaceFrame. */
  hideChrome?: boolean;
  /** Report live word/line counts for external status bars. */
  onEditorMetricsChange?: (metrics: {
    wordCount: number;
    lineCount: number;
  }) => void;
}

export interface ProseEditorRef {
  focus: () => void;
  /** Trigger in-memory undo (mirrors Ctrl+Z inside the editor). */
  undo: () => void;
  /** Trigger in-memory redo (mirrors Ctrl+Y / Ctrl+Shift+Z inside the editor). */
  redo: () => void;
  /** Open the writing stats dialog. Used by mobile FAB. */
  openWritingStats: () => void;
}

export type LineLayoutMode = "inline" | "stacked";

// ============================================================================
// Component
// ============================================================================

export const ProseEditor = function ProseEditor({
  activeLabel,
  characters,
  onChange,
  isFocusMode = false,
  isSaving = false,
  lastSaved = null,
  saveError = false,
  saveConflict = false,
  onUndoStateChange,
  onWordCountChange,
  showBadges: propsShowBadges,
  onShowBadgesChange,
  layoutMode: propsLayoutMode,
  onLayoutModeChange,
  fontSizeValue,
  onFontSizeChange,
  fontFamilyValue,
  onFontFamilyChange,
  hideChrome = false,
  onEditorMetricsChange,
  ref,
}: ProseEditorProps & { ref?: React.Ref<ProseEditorRef> }) {
  const state = useProseEditorState({
    activeLabel,
    characters,
    onChange,
    onUndoStateChange,
    onWordCountChange,
    propsShowBadges,
    onShowBadgesChange,
    propsLayoutMode,
    onLayoutModeChange,
    ref,
  });

  useEffect(() => {
    onEditorMetricsChange?.({
      wordCount: state.wordCount,
      lineCount: state.lineCount,
    });
  }, [onEditorMetricsChange, state.lineCount, state.wordCount]);

  // Empty state: no active label or label with no entries
  if (!state.activeLabel || state.entries.length === 0) {
    return (
      <ProseEditorEmpty
        activeLabel={state.activeLabel}
        entriesLength={state.entries.length}
        onCreateFirstEntry={state.handleCreateFirstEntry}
      />
    );
  }

  return (
    <div className="flex h-full flex-col tracking-normal">
      {!hideChrome && !isFocusMode ? (
        <ProseEditorTopBar
          activeLabel={state.activeLabel}
          canUndo={state.canUndo}
          canRedo={state.canRedo}
          onUndo={state.handleUndo}
          onRedo={state.handleRedo}
          isSaving={isSaving}
          saveError={saveError}
          lastSaved={lastSaved}
          saveConflict={saveConflict}
        />
      ) : null}

      <ProseEditorLines
        entries={state.entries}
        characters={state.characters}
        layoutMode={state.layoutMode}
        showBadges={state.showBadges}
        isFocusMode={isFocusMode}
        textareaRefs={state.textareaRefs}
        getTechnicalInfoForLine={state.getTechnicalInfoForLine}
        onEntryChange={state.handleEntryChange}
        onDeleteLine={state.handleDeleteLine}
        onMoveUp={state.handleMoveUp}
        onMoveDown={state.handleMoveDown}
        onAddLine={state.handleAddLine}
      />

      {state.writingGoalSettings?.dailyWritingGoal != null && (
        <ProseEditorGoalPill
          todayWordCount={state.todayWordCount}
          dailyGoal={state.writingGoalSettings.dailyWritingGoal}
          isFocusMode={isFocusMode}
          isBottomBarHovered={state.isBottomBarHovered}
          onHoverStart={() => state.setIsBottomBarHovered(true)}
          onHoverEnd={() => state.setIsBottomBarHovered(false)}
          onClick={() => state.setStatsDialogOpen(true)}
        />
      )}

      {!hideChrome ? (
        <ProseEditorStatusBar
          layoutMode={state.layoutMode}
          onLayoutModeChange={state.setLayoutMode}
          showBadges={state.showBadges}
          onShowBadgesToggle={() => state.setShowBadges(!state.showBadges)}
          wordCount={state.wordCount}
          lineCount={state.lineCount}
          fontSizeValue={fontSizeValue}
          onFontSizeChange={onFontSizeChange}
          fontFamilyValue={fontFamilyValue}
          onFontFamilyChange={onFontFamilyChange}
          isFocusMode={isFocusMode}
          isBottomBarHovered={state.isBottomBarHovered}
          onBottomBarHoverStart={() => state.setIsBottomBarHovered(true)}
          onBottomBarHoverEnd={() => state.setIsBottomBarHovered(false)}
        />
      ) : null}

      <Suspense fallback={null}>
        <WritingStatsDialog
          open={state.statsDialogOpen}
          onOpenChange={state.setStatsDialogOpen}
          dailyGoal={state.writingGoalSettings?.dailyWritingGoal ?? 500}
          dailyWordCounts={
            state.writingGoalSettings?.dailyWordCounts ?? EMPTY_ARRAY
          }
        />
      </Suspense>
    </div>
  );
};
