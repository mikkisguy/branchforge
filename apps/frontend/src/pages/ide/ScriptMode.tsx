import { useCallback, useMemo, useRef, useState } from "react";
import { StatusBar } from "@/components/script-mode";
import { GitLabSyncDialog } from "@/components/script-mode/GitLabSyncDialog";
import { ZipImportDialog } from "@/components/zip-import";
import { useLabels } from "@/hooks/useLabels";
import { useFocusModeKeyboardHandler } from "@/hooks/useFocusModeKeyboardHandler";
import { useFocusModeState } from "@/hooks/useFocusModeState";
import { useGitLab } from "@/hooks/useGitLab";
import { useCharacters } from "@/hooks/useCharacters";
import { useProjectFiles } from "@/hooks/useProjectFiles";
import { useFileEditor } from "@/hooks/useFileEditor";
import { useFileTabs } from "@/hooks/useFileTabs";
import { useLabelFileSync } from "@/hooks/useLabelFileSync";
import { useProjectReset } from "@/hooks/useProjectReset";
import { useScriptModeRefresh } from "@/hooks/useScriptModeRefresh";
import { useToast } from "@/contexts/ToastContext";
import type { FileSourceType } from "@branchforge/shared";
import type { ScriptEditorRef } from "@/components/script-mode/ScriptEditor";
import { useLocalStorageBoolean } from "@/hooks/useLocalStorage";
import { ScriptModeEditorLayout } from "./components/ScriptModeEditorLayout";
import { ScriptModeEmptyState } from "./components/ScriptModeEmptyState";

interface ScriptModeProps {
  projectId?: string;
  projectName?: string;
  gitlabBranch?: string;
}

export function ScriptMode({
  projectId,
  projectName,
  gitlabBranch,
}: ScriptModeProps) {
  const { error: showErrorToast } = useToast();
  const { activeLabel, activeLabelId, setActiveLabelId, isLoadingLabels } =
    useLabels();

  const { isProjectLinked, getLinkedRepository } = useGitLab();
  const {
    files: projectFiles,
    isLoadingFiles,
    updateFileContent,
    refreshFiles,
  } = useProjectFiles(projectId);

  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [showZipImportDialog, setShowZipImportDialog] = useState(false);

  const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] =
    useLocalStorageBoolean("script:left-sidebar-collapsed", false);
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] =
    useLocalStorageBoolean("script:right-sidebar-collapsed", false);

  const focusModeState = useFocusModeState("script:focus-mode");
  const {
    isFocusMode,
    setIsFocusMode,
    preFocusSidebarStates,
    setPreFocusSidebarStates,
    preFocusElementRef,
    focusToggleRef,
  } = focusModeState;

  const editorRef = useRef<ScriptEditorRef>(null);
  const isResettingRef = useRef(false);
  const skipSaveRef = useRef(false);

  const [scrollToLine, setScrollToLine] = useState<number | null>(null);

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

  const {
    fileSaveStatus,
    isFileDirty,
    editedFileContent,
    currentEditFileId,
    hasSaveConflict,
    setEditedFileContent,
    triggerFileSave,
    retryFileSave,
    switchToFile,
    clearEditorState,
  } = useFileEditor({
    projectId,
    projectFiles,
    activeLabelId,
    updateFileContent,
    showErrorToast,
    skipSaveRef,
  });

  const handleScriptFileSelect = useCallback(
    async (fileId: string) => {
      const file = projectFiles.find(
        (projectFile) => projectFile.id === fileId
      );
      if (!file) {
        return false;
      }
      return await switchToFile(file);
    },
    [projectFiles, switchToFile]
  );

  const handleNoTabsRemaining = useCallback(() => {
    void clearEditorState();
    setActiveLabelId(null);
    setScrollToLine(null);
  }, [clearEditorState, setActiveLabelId]);

  const handleFileActivated = useCallback(() => {
    setScrollToLine(null);
    setActiveLabelId(null);
  }, [setActiveLabelId]);

  const {
    activeFileId,
    tabItems,
    selectFileTab,
    handleCloseFileTab,
    clearTabsState,
  } = useFileTabs({
    projectId,
    projectFiles,
    isLoadingFiles,
    isResettingRef,
    onFileSelect: handleScriptFileSelect,
    onFileActivated: handleFileActivated,
    onNoTabsRemaining: handleNoTabsRemaining,
  });

  const { resetRefreshState } = useScriptModeRefresh({
    projectId,
    isLoadingFiles,
    refreshFiles,
  });

  const hasPendingSave =
    !!currentEditFileId && (isFileDirty || fileSaveStatus === "error");

  const handleResetState = useCallback(() => {
    resetRefreshState();
    clearTabsState();
    void clearEditorState();
    setScrollToLine(null);
  }, [clearEditorState, clearTabsState, resetRefreshState]);

  const setSkipSave = useCallback((value: boolean) => {
    skipSaveRef.current = value;
  }, []);

  useProjectReset({
    projectId,
    isResettingRef,
    hasPendingSave,
    triggerSave: triggerFileSave,
    showErrorToast,
    setSkipSave,
    onReset: handleResetState,
  });

  const handleLabelDrivenFileSelect = useCallback(
    async (fileId: string) => {
      return await selectFileTab(fileId, { notify: false });
    },
    [selectFileTab]
  );

  useLabelFileSync({
    projectFiles,
    activeLabelId,
    onFileSelect: handleLabelDrivenFileSelect,
    onSetScrollToLine: setScrollToLine,
  });

  useFocusModeKeyboardHandler(handleFocusModeToggle);

  const activeProjectFile = useMemo(
    () => projectFiles.find((file) => file.id === activeFileId) || null,
    [activeFileId, projectFiles]
  );

  const { characters: projectCharacters } = useCharacters(projectId ?? "");

  const sceneCharacters = useMemo(() => {
    return activeLabel?.characters ?? [];
  }, [activeLabel]);

  const statusColor =
    activeLabel?.status === "FINAL"
      ? "var(--theme-color)"
      : activeLabel?.status === "REVIEW"
        ? "var(--theme-review-color)"
        : "var(--theme-draft-color)";

  const activeFileContent =
    activeProjectFile && currentEditFileId === activeProjectFile.id
      ? editedFileContent
      : activeProjectFile?.content || "";

  const handleGitLabFileSelect = useCallback(
    (fileId: string) => {
      void selectFileTab(fileId);
    },
    [selectFileTab]
  );

  const handleSelectFileTab = useCallback(
    async (fileId: string) => {
      await selectFileTab(fileId);
    },
    [selectFileTab]
  );

  const handleGitLabSceneSelect = useCallback(
    (sceneId: string) => {
      setActiveLabelId(sceneId);
    },
    [setActiveLabelId]
  );

  const initialExpandedFolders = useMemo(() => {
    const folders = new Set<string>();
    for (const file of projectFiles) {
      const parts = file.filePath.split("/");
      if (parts.length > 1) {
        folders.add(parts[0]);
      }
    }
    return Array.from(folders);
  }, [projectFiles]);

  const isLinked = projectId ? isProjectLinked(projectId) : false;
  const linkedRepo = projectId ? getLinkedRepository(projectId) : null;

  const primaryFileSourceType: FileSourceType | undefined = useMemo(() => {
    if (projectFiles.length === 0) {
      if (isLinked) {
        return "GITLAB";
      }
      return undefined;
    }

    return projectFiles[0].sourceType;
  }, [projectFiles, isLinked]);

  const statusBar = (
    <StatusBar
      language="Ren'Py"
      projectId={projectId}
      projectName={projectName}
      gitlabBranch={gitlabBranch}
      fileSourceType={primaryFileSourceType}
      saveStatus={activeProjectFile ? fileSaveStatus : undefined}
      saveConflict={activeProjectFile ? hasSaveConflict : undefined}
      onSaveRequest={activeProjectFile ? retryFileSave : undefined}
    />
  );

  if (isLoadingLabels || isLoadingFiles) {
    return (
      <div className="h-screen flex flex-col overflow-hidden">
        <div className="flex-1 flex flex-col pt-16">
          <div className="flex-1 flex items-center justify-center">
            <p className="text-muted-foreground">Loading project...</p>
          </div>
        </div>
        {statusBar}
      </div>
    );
  }

  if (!projectFiles.length) {
    return (
      <div className="h-screen flex flex-col overflow-hidden">
        <ScriptModeEmptyState
          projectId={projectId}
          projectName={projectName}
          isLinked={isLinked}
          linkedRepoDefaultBranch={linkedRepo?.defaultBranch ?? undefined}
          showSyncDialog={showSyncDialog}
          onShowSyncDialogChange={setShowSyncDialog}
          showZipImportDialog={showZipImportDialog}
          onShowZipImportDialogChange={setShowZipImportDialog}
        />
        {statusBar}
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <ScriptModeEditorLayout
        projectName={projectName}
        projectFiles={projectFiles}
        activeFileId={activeFileId}
        activeLabelId={activeLabelId}
        activeLabel={activeLabel}
        activeProjectFile={activeProjectFile}
        activeFileContent={activeFileContent}
        scrollToLine={scrollToLine}
        initialExpandedFolders={initialExpandedFolders}
        tabItems={tabItems}
        sceneCharacters={sceneCharacters}
        projectCharacters={projectCharacters}
        statusColor={statusColor}
        isLeftSidebarCollapsed={isLeftSidebarCollapsed}
        setIsLeftSidebarCollapsed={setIsLeftSidebarCollapsed}
        isRightSidebarCollapsed={isRightSidebarCollapsed}
        setIsRightSidebarCollapsed={setIsRightSidebarCollapsed}
        focusModeState={focusModeState}
        editorRef={editorRef}
        onFocusModeToggle={handleFocusModeToggle}
        onFileSelect={handleGitLabFileSelect}
        onSceneSelect={handleGitLabSceneSelect}
        onSelectTab={handleSelectFileTab}
        onCloseTab={handleCloseFileTab}
        onContentChange={setEditedFileContent}
        onRefreshFiles={refreshFiles}
      />

      {statusBar}

      {projectId && isLinked && linkedRepo && (
        <GitLabSyncDialog
          open={showSyncDialog}
          onOpenChange={setShowSyncDialog}
          operationType="import"
          projectId={projectId}
          projectName={projectName}
          defaultBranch={linkedRepo.defaultBranch}
        />
      )}

      {projectId && (
        <ZipImportDialog
          open={showZipImportDialog}
          onOpenChange={setShowZipImportDialog}
          projectId={projectId}
          projectName={projectName}
        />
      )}
    </div>
  );
}
