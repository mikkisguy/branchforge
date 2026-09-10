/**
 * WriteMode Page
 *
 * Prose-focused writing interface for dialogue and narration.
 * Matches app design system with theme colors and simple styling.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WorkspaceFocusReporter } from "@/components/workspace/WorkspaceFocusReporter";
import { useLabels } from "@/hooks/useLabels";
import { useProjectFiles } from "@/hooks/useProjectFiles";
import { useCharacters } from "@/hooks/useCharacters";
import { useRouteConfigs } from "@/hooks/useRouteConfigs";
import { useProject } from "@/hooks/useProject";
import { useToast } from "@/contexts/ToastContext";
import { CreateFileDialog } from "@/components/ide-shared/CreateFileDialog";
import { useStats } from "@/hooks/useStats";
import { usePairGroups } from "@/hooks/usePairGroups";
import {
  useWriteAutosave,
  getPersistedDialogueFromLabel,
  type LabelDialogueDraft,
} from "@/hooks/useWriteAutosave";
import { useWriteTabs } from "@/hooks/useWriteTabs";
import { useLabelSwitcher } from "@/hooks/useLabelSwitcher";
import { useWriteFocusMode } from "@/hooks/useWriteFocusMode";
import { useWorkspacePanel } from "@/hooks/useWorkspacePanel";
import { WRITE_LEFT_PANEL, WRITE_RIGHT_PANEL } from "@/lib/workspace-panels";
import { WriteModeView } from "@/pages/ide/components/WriteModeView";
import {
  NoProjectSelected,
  LoadingLabels,
  ProjectFilesError,
  NoStoryFiles,
} from "@/pages/ide/components/WriteModeEmptyStates";
import type { ProseEditorRef } from "@/components/write-mode";
import type { DialogueEntry } from "@/lib/prose-types";

interface WriteModeProps {
  projectName?: string;
  onOpenSettings?: () => void;
  onFocusModeChange?: (focused: boolean) => void;
}

export function WriteMode({
  onOpenSettings,
  onFocusModeChange,
}: WriteModeProps) {
  const { currentProject } = useProject();
  const { error: showErrorToast } = useToast();
  const [createFileDialogOpen, setCreateFileDialogOpen] = useState(false);
  const [revealFileId, setRevealFileId] = useState<string | null>(null);
  const [sortResetToken, setSortResetToken] = useState(0);
  const {
    labels,
    activeLabel,
    activeLabelId,
    setActiveLabelId,
    isLoadingLabels,
    updateDialogue,
    isUpdatingDialogue,
    createLabel,
    isCreatingLabel,
    updateLabel,
    isUpdatingLabel,
    deleteLabel,
    isDeletingLabel,
  } = useLabels();

  const {
    files,
    isLoadingFiles,
    filesError,
    refreshFiles,
    createFile,
    isCreatingFile,
    createFileError,
    resetCreateFileError,
  } = useProjectFiles(currentProject?.id);
  const canCreateFile = currentProject?.visibility === "OWNER";
  const previousProjectIdRef = useRef(currentProject?.id);

  useEffect(() => {
    if (previousProjectIdRef.current === currentProject?.id) {
      return;
    }

    previousProjectIdRef.current = currentProject?.id;
    setCreateFileDialogOpen(false);
    setRevealFileId(null);
    resetCreateFileError();
  }, [currentProject?.id, resetCreateFileError]);

  const storyFiles = useMemo(() => {
    const nextStoryFiles: Array<{ id: string; filePath: string }> = [];
    for (const file of files) {
      if (file.fileType === "STORY") {
        nextStoryFiles.push({ id: file.id, filePath: file.filePath });
      }
    }
    return nextStoryFiles;
  }, [files]);

  const storyFileIds = useMemo(
    () => new Set(storyFiles.map((file) => file.id)),
    [storyFiles]
  );

  const storyLabels = useMemo(
    () =>
      filesError
        ? []
        : labels.filter((label) => storyFileIds.has(label.projectFileId)),
    [filesError, labels, storyFileIds]
  );

  const openCreateFileDialog = useCallback(() => {
    resetCreateFileError();
    setCreateFileDialogOpen(true);
  }, [resetCreateFileError]);

  const handleCreateFile = useCallback(
    async (filePath: string) => {
      const newFile = await createFile(filePath);
      setCreateFileDialogOpen(false);
      setRevealFileId(newFile.id);
      setSortResetToken((token) => token + 1);
    },
    [createFile]
  );

  const handleFileRevealed = useCallback(() => {
    setRevealFileId(null);
  }, []);

  const { characters } = useCharacters(currentProject?.id ?? "");
  const { routeConfigs } = useRouteConfigs(currentProject?.id ?? "");
  const { stats } = useStats(currentProject?.id ?? "");
  const { pairGroups } = usePairGroups(currentProject?.id ?? "", {
    enabled: !!currentProject?.id,
  });

  const leftPanelRaw = useWorkspacePanel(WRITE_LEFT_PANEL);
  const rightPanelRaw = useWorkspacePanel(WRITE_RIGHT_PANEL);

  const editorRef = useRef<ProseEditorRef | null>(null);

  const [proseUndoState, setProseUndoState] = useState({
    canUndo: false,
    canRedo: false,
  });

  const [wordCountState, setWordCountState] = useState<{
    todayWordCount: number;
    dailyGoal: number;
  }>({ todayWordCount: 0, dailyGoal: 0 });

  const { isFocusMode, focusToggleRef, handleFocusModeToggle } =
    useWriteFocusMode({
      isLeftSidebarCollapsed: leftPanelRaw.collapsed,
      setIsLeftSidebarCollapsed: leftPanelRaw.setCollapsed,
      isRightSidebarCollapsed: rightPanelRaw.collapsed,
      setIsRightSidebarCollapsed: rightPanelRaw.setCollapsed,
      editorRef,
    });

  const [currentDraft, setCurrentDraft] = useState<LabelDialogueDraft>(() => ({
    labelId: activeLabel?.id ?? activeLabelId,
    entries: getPersistedDialogueFromLabel(activeLabel),
  }));

  const prevDraftLabelIdRef = useRef<string | null>(null);
  const isSwitchingLabelsRef = useRef(false);
  const pendingResetHashRef = useRef<LabelDialogueDraft | null>(null);

  const {
    saveStatus,
    isDirty,
    triggerSave,
    resetSavedHash,
    lastSaved,
    conflictByLabel,
  } = useWriteAutosave({
    projectId: currentProject?.id,
    draft: currentDraft,
    labels,
    activeLabel,
    isUpdatingDialogue,
    skipSaveRef: isSwitchingLabelsRef,
    onUpdateDialogue: updateDialogue,
    showErrorToast,
  });

  const { tabItems, selectLabelTab, handleCloseTab } = useWriteTabs({
    projectId: currentProject?.id,
    labels,
    activeLabelId,
    setActiveLabelId,
    isLoadingLabels,
  });

  const { handleSelectLabel } = useLabelSwitcher({
    activeLabelId,
    isDirty,
    triggerSave,
    onSwitch: selectLabelTab,
    showErrorToast,
  });

  useEffect(() => {
    const prevLabelId = prevDraftLabelIdRef.current;

    if (activeLabel && activeLabel.id !== prevLabelId) {
      const persistedDialogue = getPersistedDialogueFromLabel(activeLabel);
      const nextDraft: LabelDialogueDraft = {
        labelId: activeLabel.id,
        entries: persistedDialogue,
      };

      isSwitchingLabelsRef.current = true;
      pendingResetHashRef.current = nextDraft;
      setCurrentDraft(nextDraft);
      prevDraftLabelIdRef.current = activeLabel.id;
      return;
    }

    if (!activeLabelId) {
      prevDraftLabelIdRef.current = null;
    }
  }, [activeLabel, activeLabelId]);

  useEffect(() => {
    if (!pendingResetHashRef.current) {
      return;
    }

    resetSavedHash(pendingResetHashRef.current);
    pendingResetHashRef.current = null;
    isSwitchingLabelsRef.current = false;
  }, [currentDraft, resetSavedHash]);

  const handleContentChange = useCallback((entries: DialogueEntry[]) => {
    setCurrentDraft((prev) => ({ ...prev, entries }));
  }, []);

  const handleLabelSelect = useCallback(
    (labelId: string) => {
      void handleSelectLabel(labelId);
    },
    [handleSelectLabel]
  );

  // react-doctor-disable-next-line react-doctor/no-usememo-simple-expression -- referential stability for editorSaveState passed to WriteModeView
  const editorSaveState = useMemo(
    () => ({
      isSaving: saveStatus === "saving",
      lastSaved: saveStatus === "saved" ? lastSaved : null,
      saveError: saveStatus === "error",
      saveConflict: activeLabelId
        ? (conflictByLabel.get(activeLabelId) ?? false)
        : false,
    }),
    [lastSaved, saveStatus, activeLabelId, conflictByLabel]
  );

  const createFileDialog = (
    <CreateFileDialog
      open={createFileDialogOpen}
      onOpenChange={setCreateFileDialogOpen}
      onCreate={handleCreateFile}
      isCreating={isCreatingFile}
      serverError={createFileError?.message ?? null}
      onDismissServerError={resetCreateFileError}
    />
  );

  if (!currentProject) {
    return <NoProjectSelected onOpenSettings={onOpenSettings} />;
  }

  if (isLoadingLabels || isLoadingFiles) {
    return <LoadingLabels />;
  }

  if (filesError) {
    return <ProjectFilesError onRetry={() => void refreshFiles()} />;
  }

  if (!storyFiles.length) {
    return (
      <>
        <NoStoryFiles
          onNewFile={canCreateFile ? openCreateFileDialog : undefined}
        />
        {createFileDialog}
      </>
    );
  }

  return (
    <>
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <WorkspaceFocusReporter
          active={isFocusMode}
          onFocusModeChange={onFocusModeChange}
        />
        <WriteModeView
          isFocusMode={isFocusMode}
          focusToggleRef={focusToggleRef}
          onFocusModeToggle={handleFocusModeToggle}
          leftPanelRaw={leftPanelRaw}
          rightPanelRaw={rightPanelRaw}
          storyFiles={storyFiles}
          revealFileId={revealFileId}
          sortResetToken={sortResetToken}
          onNewFile={canCreateFile ? openCreateFileDialog : undefined}
          onFileRevealed={handleFileRevealed}
          labels={storyLabels}
          activeLabelId={activeLabelId}
          onLabelSelect={handleLabelSelect}
          onCloseTab={handleCloseTab}
          tabItems={tabItems}
          projectId={currentProject.id}
          onCreateLabel={createLabel}
          onUpdateLabel={updateLabel}
          onDeleteLabel={deleteLabel}
          labelMutationState={{
            isCreatingLabel,
            isUpdatingLabel,
            isDeletingLabel,
          }}
          editorRef={editorRef}
          activeLabel={activeLabel}
          characters={characters}
          onChange={handleContentChange}
          editorSaveState={editorSaveState}
          onUndoStateChange={setProseUndoState}
          onWordCountChange={setWordCountState}
          stats={stats}
          routeConfigs={routeConfigs}
          pairGroups={pairGroups}
          proseUndoState={proseUndoState}
          wordCountState={wordCountState}
          duoEndingEnabled={currentProject?.duoEndingEnabled ?? false}
        />
      </div>
      {createFileDialog}
    </>
  );
}
