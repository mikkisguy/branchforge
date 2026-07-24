import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useLabels } from "@/hooks/useLabels";
import { useFocusModeKeyboardHandler } from "@/hooks/useFocusModeKeyboardHandler";
import { useFocusModeState } from "@/hooks/useFocusModeState";
import { useGitLab, type UseGitLabReturn } from "@/hooks/useGitLab";
import { useCharacters } from "@/hooks/useCharacters";
import { useProjectFiles } from "@/hooks/useProjectFiles";
import { useToast } from "@/contexts/ToastContext";
import type { ScriptEditorRef } from "@/components/script-mode/ScriptEditor";
import { useResponsiveSidebarState } from "@/hooks/useResponsiveSidebarState";
import type { FocusModeState } from "@/hooks/useFocusModeState";
import type {
  UseProjectFilesReturn,
  ProjectFileNode,
} from "@/hooks/useProjectFiles";
import type { LabelDetail, PublicLabel, Character } from "@branchforge/shared";

interface UseScriptModeDataProps {
  projectId?: string;
}
export interface UseScriptModeDataReturn {
  showErrorToast: (message: string, title: string) => void;
  isLoadingLabels: boolean;
  isLoadingFiles: boolean;
  labels: PublicLabel[];
  activeLabel: LabelDetail | undefined;
  activeLabelId: string | null;
  setActiveLabelId: (labelId: string | null) => void;
  projectFiles: ProjectFileNode[];
  updateFileContent: UseProjectFilesReturn["updateFileContent"];
  refreshFiles: () => Promise<unknown>;
  isProjectLinked: (projectId: string) => boolean;
  getLinkedRepository: UseGitLabReturn["getLinkedRepository"];
  showSyncDialog: boolean;
  setShowSyncDialog: (open: boolean) => void;
  showZipImportDialog: boolean;
  setShowZipImportDialog: (open: boolean) => void;
  isLeftSidebarCollapsed: boolean;
  setIsLeftSidebarCollapsed: Dispatch<SetStateAction<boolean>>;
  isRightSidebarCollapsed: boolean;
  setIsRightSidebarCollapsed: Dispatch<SetStateAction<boolean>>;
  isMobile: boolean;
  focusModeState: FocusModeState;
  handleFocusModeToggle: () => void;
  editorRef: React.RefObject<ScriptEditorRef | null>;
  isResettingRef: React.RefObject<boolean>;
  skipSaveRef: React.RefObject<boolean>;
  projectCharacters: Character[];
}

export function useScriptModeData({
  projectId,
}: UseScriptModeDataProps): UseScriptModeDataReturn {
  const { error: showErrorToast } = useToast();
  const {
    labels,
    activeLabel,
    activeLabelId,
    setActiveLabelId,
    isLoadingLabels,
  } = useLabels();

  const { isProjectLinked, getLinkedRepository } = useGitLab();
  const {
    files: projectFiles,
    isLoadingFiles,
    updateFileContent,
    refreshFiles,
  } = useProjectFiles(projectId);

  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [showZipImportDialog, setShowZipImportDialog] = useState(false);

  const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed, isMobile] =
    useResponsiveSidebarState("script:left-sidebar-collapsed");
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] =
    useResponsiveSidebarState("script:right-sidebar-collapsed");

  const focusModeState = useFocusModeState("script:focus-mode");
  const {
    isFocusMode,
    setIsFocusMode,
    preFocusSidebarStates,
    setPreFocusSidebarStates,
    preFocusElementRef,
    focusToggleRef,
  } = focusModeState;

  const editorRef = useRef<ScriptEditorRef | null>(null);
  const isResettingRef = useRef(false);
  const skipSaveRef = useRef(false);

  const handleFocusModeToggle = useCallback(() => {
    if (!isFocusMode) {
      preFocusElementRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setPreFocusSidebarStates({
        leftCollapsed: isLeftSidebarCollapsed,
        rightCollapsed: isRightSidebarCollapsed,
      });
      setIsFocusMode(true);
      editorRef.current?.focus();
      return;
    }

    setIsFocusMode(false);
    if (preFocusSidebarStates) {
      setIsLeftSidebarCollapsed(preFocusSidebarStates.leftCollapsed);
      setIsRightSidebarCollapsed(preFocusSidebarStates.rightCollapsed);
    }
    if (preFocusElementRef.current) {
      preFocusElementRef.current.focus();
    } else {
      focusToggleRef.current?.focus();
    }
  }, [
    focusToggleRef,
    isFocusMode,
    isLeftSidebarCollapsed,
    isRightSidebarCollapsed,
    preFocusElementRef,
    preFocusSidebarStates,
    setIsFocusMode,
    setIsLeftSidebarCollapsed,
    setIsRightSidebarCollapsed,
    setPreFocusSidebarStates,
  ]);

  useFocusModeKeyboardHandler(handleFocusModeToggle);

  const { characters: projectCharacters } = useCharacters(projectId ?? "");

  return {
    showErrorToast,
    isLoadingLabels,
    isLoadingFiles,
    labels,
    activeLabel,
    activeLabelId,
    setActiveLabelId,
    projectFiles,
    updateFileContent,
    refreshFiles,
    isProjectLinked,
    getLinkedRepository,
    showSyncDialog,
    setShowSyncDialog,
    showZipImportDialog,
    setShowZipImportDialog,
    isLeftSidebarCollapsed,
    setIsLeftSidebarCollapsed,
    isRightSidebarCollapsed,
    setIsRightSidebarCollapsed,
    isMobile,
    focusModeState,
    handleFocusModeToggle,
    editorRef,
    isResettingRef,
    skipSaveRef,
    projectCharacters,
  };
}
