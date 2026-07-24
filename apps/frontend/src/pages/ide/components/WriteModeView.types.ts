import type { ProseEditorRef } from "@/components/write-mode";
import type { EditorTabBarItem } from "@/components/ide-shared";
import type { DialogueEntry } from "@/lib/prose-types";
import type {
  PublicLabel,
  LabelDetail,
  Stat,
  RouteConfig,
} from "@branchforge/shared";
import type { Character } from "@branchforge/shared";
import type {
  Dispatch,
  KeyboardEvent,
  MouseEvent,
  RefObject,
  SetStateAction,
} from "react";
import type { CreateLabelInput, UpdateLabelInput } from "@/lib/api/labels";

export interface WriteModeViewProps {
  // Focus mode
  isFocusMode: boolean;
  focusToggleRef: RefObject<HTMLButtonElement | null>;
  onFocusModeToggle: () => void;

  // Sidebar state
  isLeftSidebarCollapsed: boolean;
  setIsLeftSidebarCollapsed: Dispatch<SetStateAction<boolean>>;
  isRightSidebarCollapsed: boolean;
  setIsRightSidebarCollapsed: Dispatch<SetStateAction<boolean>>;
  isMobile: boolean;

  // Labels
  labels: PublicLabel[];
  activeLabelId: string | null;
  onLabelSelect: (labelId: string) => void;
  onCloseTab: (
    event: MouseEvent<Element> | KeyboardEvent<Element>,
    labelId: string
  ) => void;
  tabItems: EditorTabBarItem[];
  projectName?: string;
  projectId: string;
  projectLabelCount: number;
  onCreateLabel: (data: CreateLabelInput) => Promise<unknown>;
  isCreatingLabel: boolean;
  onUpdateLabel: (
    labelId: string,
    data: UpdateLabelInput
  ) => Promise<PublicLabel>;
  isUpdatingLabel: boolean;
  onDeleteLabel: (labelId: string) => Promise<void>;
  isDeletingLabel: boolean;

  // Editor
  editorRef: RefObject<ProseEditorRef | null>;
  activeLabel: LabelDetail | undefined;
  characters: Character[];
  onChange: (entries: DialogueEntry[]) => void;
  isSaving: boolean;
  lastSaved: Date | null;
  saveError: boolean;
  saveConflict: boolean;
  onUndoStateChange: Dispatch<
    SetStateAction<{ canUndo: boolean; canRedo: boolean }>
  >;
  onWordCountChange: Dispatch<
    SetStateAction<{ todayWordCount: number; dailyGoal: number }>
  >;

  // Properties panel
  stats: Stat[];
  routeConfigs: RouteConfig[];
  pairGroups: {
    id: string;
    characterAName: string;
    characterBName: string;
    duoEndingLabel: string | null;
  }[];

  // FAB state (from parent)
  proseUndoState: { canUndo: boolean; canRedo: boolean };
  wordCountState: { todayWordCount: number; dailyGoal: number };

  // Project
  duoEndingEnabled: boolean;
}
