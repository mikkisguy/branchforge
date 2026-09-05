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
import type { StoryFileRef } from "@/components/write-mode/LabelNavigator";

import type {
  Dispatch,
  KeyboardEvent,
  MouseEvent,
  RefObject,
  SetStateAction,
} from "react";
import type { CreateLabelInput, UpdateLabelInput } from "@/lib/api/labels";

export interface SidebarState {
  isLeftCollapsed: boolean;
  setIsLeftCollapsed: Dispatch<SetStateAction<boolean>>;
  isRightCollapsed: boolean;
  setIsRightCollapsed: Dispatch<SetStateAction<boolean>>;
}

export interface LabelMutationState {
  isCreatingLabel: boolean;
  isUpdatingLabel: boolean;
  isDeletingLabel: boolean;
}

export interface EditorSaveState {
  isSaving: boolean;
  lastSaved: Date | null;
  saveError: boolean;
  saveConflict: boolean;
}

export interface WriteModeViewProps {
  // Focus mode
  isFocusMode: boolean;
  focusToggleRef: RefObject<HTMLButtonElement | null>;
  onFocusModeToggle: () => void;

  // Sidebar state (grouped to satisfy react-doctor no-many-boolean-props)
  sidebarState: SidebarState;
  isMobile: boolean;

  // Story files
  storyFiles: StoryFileRef[];
  revealFileId?: string | null;
  sortResetToken?: number;
  onNewFile?: () => void;
  onFileRevealed?: () => void;

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
  onUpdateLabel: (
    labelId: string,
    data: UpdateLabelInput
  ) => Promise<PublicLabel>;
  onDeleteLabel: (labelId: string) => Promise<void>;
  labelMutationState: LabelMutationState;

  // Editor
  editorRef: RefObject<ProseEditorRef | null>;
  activeLabel: LabelDetail | undefined;
  characters: Character[];
  onChange: (entries: DialogueEntry[]) => void;
  editorSaveState: EditorSaveState;
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
