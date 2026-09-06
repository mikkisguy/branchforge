/**
 * WriteMode Page
 *
 * Prose-focused writing interface for dialogue and narration.
 * Matches app design system with theme colors and simple styling.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLabels } from "@/hooks/useLabels";
import { useCharacters } from "@/hooks/useCharacters";
import { useRouteConfigs } from "@/hooks/useRouteConfigs";
import { useProject } from "@/hooks/useProject";
import { useToast } from "@/contexts/ToastContext";
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
  NoLabels,
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

  const isEditorMounted =
    !!currentProject && !isLoadingLabels && labels.length > 0;

  useEffect(() => {
    onFocusModeChange?.(isEditorMounted && isFocusMode);
    return () => onFocusModeChange?.(false);
  }, [isEditorMounted, isFocusMode, onFocusModeChange]);

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

  if (!currentProject) {
    return <NoProjectSelected onOpenSettings={onOpenSettings} />;
  }

  if (isLoadingLabels) {
    return <LoadingLabels />;
  }

  if (!labels.length) {
    return <NoLabels />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <WriteModeView
        isFocusMode={isFocusMode}
        focusToggleRef={focusToggleRef}
        onFocusModeToggle={handleFocusModeToggle}
        leftPanelRaw={leftPanelRaw}
        rightPanelRaw={rightPanelRaw}
        labels={labels}
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
  );
}
