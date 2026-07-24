import { Eye, EyeOff, Type, Pilcrow, PanelTop } from "lucide-react";
import {
  MobileOverflowFAB,
  FABToggle,
  FABExpandableChoice,
  FABUndoButton,
  FABRedoButton,
  FABFocusButton,
} from "@/components/ide-shared";
import { WritingGoalFABRow } from "@/pages/ide/components/WritingGoalFABRow";
import type { ProseEditorRef } from "@/components/write-mode";
import type { Dispatch, RefObject, SetStateAction } from "react";

interface WriteModeFABProps {
  fontSizeValue: number;
  onFontSizeChange: Dispatch<SetStateAction<number>>;
  fontSizeOptions: readonly {
    label: string;
    value: number;
  }[];
  fontFamilyValue: string;
  onFontFamilyChange: Dispatch<SetStateAction<string>>;
  fontFamilyOptions: readonly {
    label: string;
    value: string;
  }[];
  layoutMode: "inline" | "stacked";
  onLayoutModeChange: (value: string) => void;
  showBadges: boolean;
  onShowBadgesChange: Dispatch<SetStateAction<boolean>>;
  proseUndoState: { canUndo: boolean; canRedo: boolean };
  wordCountState: { todayWordCount: number; dailyGoal: number };
  isFocusMode: boolean;
  onFocusModeToggle: () => void;
  editorRef: RefObject<ProseEditorRef | null>;
}

export function WriteModeFAB({
  fontSizeValue,
  onFontSizeChange,
  fontSizeOptions,
  fontFamilyValue,
  onFontFamilyChange,
  fontFamilyOptions,
  layoutMode,
  onLayoutModeChange,
  showBadges,
  onShowBadgesChange,
  proseUndoState,
  wordCountState,
  isFocusMode,
  onFocusModeToggle,
  editorRef,
}: WriteModeFABProps) {
  return (
    <MobileOverflowFAB aria-label="Editor actions">
      <FABExpandableChoice
        icon={<Type className="size-4" />}
        label="Font Size"
        currentLabel={
          fontSizeOptions.find((o) => o.value === fontSizeValue)?.label ??
          "Medium"
        }
        options={fontSizeOptions.map((o) => ({
          label: o.label,
          value: o.value,
          active: o.value === fontSizeValue,
        }))}
        onSelect={(v) => onFontSizeChange(v as number)}
      />
      <FABExpandableChoice
        icon={<Pilcrow className="size-4" />}
        label="Font Family"
        currentLabel={
          fontFamilyOptions.find((o) => o.value === fontFamilyValue)?.label ??
          "Default"
        }
        options={fontFamilyOptions.map((o) => ({
          label: o.label,
          value: o.value,
          active: o.value === fontFamilyValue,
        }))}
        onSelect={(v) => onFontFamilyChange(v as string)}
      />
      <FABToggle
        icon={<PanelTop className="size-4" />}
        label="Line Layout: Stacked"
        active={layoutMode === "stacked"}
        onClick={() =>
          onLayoutModeChange(layoutMode === "stacked" ? "inline" : "stacked")
        }
      />
      <FABToggle
        icon={
          showBadges ? (
            <Eye className="size-4" />
          ) : (
            <EyeOff className="size-4" />
          )
        }
        label="Show Badges"
        active={showBadges}
        onClick={() => onShowBadgesChange((v) => !v)}
      />
      <div className="h-px bg-border/30 my-1" />
      {wordCountState.dailyGoal > 0 && (
        <WritingGoalFABRow
          todayWordCount={wordCountState.todayWordCount}
          dailyGoal={wordCountState.dailyGoal}
          onOpenStats={() => editorRef.current?.openWritingStats()}
        />
      )}
      {wordCountState.dailyGoal > 0 && (
        <div className="h-px bg-border/30 my-1" />
      )}
      <FABFocusButton isFocusMode={isFocusMode} onToggle={onFocusModeToggle} />
      <FABUndoButton
        canUndo={proseUndoState.canUndo}
        onUndo={() => editorRef.current?.undo()}
      />
      <FABRedoButton
        canRedo={proseUndoState.canRedo}
        onRedo={() => editorRef.current?.redo()}
      />
    </MobileOverflowFAB>
  );
}
