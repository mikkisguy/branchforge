import { useEffect } from "react";
import { ScriptModeEditorLayout } from "./components/ScriptModeEditorLayout";
import { ScriptModeEmptyState } from "./components/ScriptModeEmptyState";
import { ScriptModeDialogs } from "./components/ScriptModeDialogs";
import { useScriptMode } from "./components/useScriptMode";

interface ScriptModeProps {
  projectId?: string;
  projectName?: string;
  onOpenSettings?: () => void;
  onFocusModeChange?: (focused: boolean) => void;
}

export function ScriptMode({
  projectId,
  projectName,
  onOpenSettings,
  onFocusModeChange,
}: ScriptModeProps) {
  const {
    isLoadingLabels,
    isLoadingFiles,
    projectFiles,
    activeLabel,
    activeLabelId,
    showSyncDialog,
    setShowSyncDialog,
    showZipImportDialog,
    setShowZipImportDialog,
    focusModeState,
    handleFocusModeToggle,
    editorRef,
    activeFileId,
    activeProjectFile,
    activeFileContent,
    tabItems,
    handleSelectFileTab,
    handleCloseFileTab,
    handleGitLabFileSelect,
    handleGitLabSceneSelect,
    handleContentChange,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    scrollToLine,
    fileSaveStatus,
    onSaveRequest,
    labelTitles,
    initialExpandedFolders,
    projectCharacters,
    refreshFiles,
    isLinked,
    linkedRepo,
    primaryFileSourceType,
    saveConflict,
    generatedFiles,
    activeGeneratedFileId,
    onGeneratedFileSelect,
    isGeneratedPreview,
    generatedFileName,
  } = useScriptMode({ projectId });

  const isEditorMounted =
    !isLoadingLabels &&
    !isLoadingFiles &&
    (projectFiles.length > 0 ||
      isGeneratedPreview ||
      generatedFiles.some((file) => !file.isEmpty));

  useEffect(() => {
    onFocusModeChange?.(isEditorMounted && focusModeState.isFocusMode);
    return () => onFocusModeChange?.(false);
  }, [isEditorMounted, focusModeState.isFocusMode, onFocusModeChange]);

  if (isLoadingLabels || isLoadingFiles) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex flex-1 flex-col pt-16">
          <div className="flex flex-1 items-center justify-center">
            <p className="text-muted-foreground">Loading project…</p>
          </div>
        </div>
      </div>
    );
  }

  if (
    !projectFiles.length &&
    !isGeneratedPreview &&
    !generatedFiles.some((file) => !file.isEmpty)
  ) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <ScriptModeEmptyState
          projectId={projectId}
          projectName={projectName}
          isLinked={isLinked}
          linkedRepoDefaultBranch={linkedRepo?.defaultBranch ?? undefined}
          showSyncDialog={showSyncDialog}
          onShowSyncDialogChange={setShowSyncDialog}
          showZipImportDialog={showZipImportDialog}
          onShowZipImportDialogChange={setShowZipImportDialog}
          onOpenSettings={onOpenSettings}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1">
        <ScriptModeEditorLayout
          projectName={projectName}
          projectId={projectId}
          projectFiles={projectFiles}
          activeFileId={activeFileId}
          activeLabelId={activeLabelId}
          activeLabel={activeLabel}
          activeProjectFile={activeProjectFile}
          activeFileContent={activeFileContent}
          scrollToLine={scrollToLine}
          initialExpandedFolders={initialExpandedFolders}
          tabItems={tabItems}
          projectCharacters={projectCharacters}
          focusModeState={focusModeState}
          editorRef={editorRef}
          onFocusModeToggle={handleFocusModeToggle}
          onFileSelect={handleGitLabFileSelect}
          onSceneSelect={handleGitLabSceneSelect}
          onSelectTab={handleSelectFileTab}
          onCloseTab={handleCloseFileTab}
          onContentChange={handleContentChange}
          onRefreshFiles={refreshFiles}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={onUndo}
          onRedo={onRedo}
          saveStatus={activeProjectFile ? fileSaveStatus : undefined}
          saveConflict={saveConflict}
          onSaveRequest={onSaveRequest}
          labelTitles={labelTitles}
          gitlabBranch={linkedRepo?.defaultBranch}
          fileSourceType={primaryFileSourceType}
          onOpenZipImportDialog={() => setShowZipImportDialog(true)}
          generatedFiles={generatedFiles}
          activeGeneratedFileId={activeGeneratedFileId}
          onGeneratedFileSelect={onGeneratedFileSelect}
          isGeneratedPreview={isGeneratedPreview}
          generatedFileName={generatedFileName}
        />
      </div>

      <ScriptModeDialogs
        projectId={projectId}
        projectName={projectName}
        isLinked={isLinked}
        linkedRepo={linkedRepo}
        showSyncDialog={showSyncDialog}
        onSyncDialogChange={setShowSyncDialog}
        showZipImportDialog={showZipImportDialog}
        onZipImportDialogChange={setShowZipImportDialog}
      />
    </div>
  );
}
