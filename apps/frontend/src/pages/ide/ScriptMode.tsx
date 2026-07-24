import { ScriptModeEditorLayout } from "./components/ScriptModeEditorLayout";
import { ScriptModeEmptyState } from "./components/ScriptModeEmptyState";
import { ScriptModeDialogs } from "./components/ScriptModeDialogs";
import { useScriptMode } from "./components/useScriptMode";
import { StatusBar } from "@/components/script-mode";

interface ScriptModeProps {
  projectId?: string;
  projectName?: string;
  onOpenSettings?: () => void;
}

export function ScriptMode({
  projectId,
  projectName,
  onOpenSettings,
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
    isLeftSidebarCollapsed,
    setIsLeftSidebarCollapsed,
    isRightSidebarCollapsed,
    setIsRightSidebarCollapsed,
    isMobile,
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
  } = useScriptMode({ projectId });

  if (isLoadingLabels || isLoadingFiles) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-1 flex flex-col pt-16">
          <div className="flex-1 flex items-center justify-center">
            <p className="text-muted-foreground">Loading project…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!projectFiles.length) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
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
    <div className="h-full flex flex-col overflow-hidden">
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
        isLeftSidebarCollapsed={isLeftSidebarCollapsed}
        setIsLeftSidebarCollapsed={setIsLeftSidebarCollapsed}
        isRightSidebarCollapsed={isRightSidebarCollapsed}
        setIsRightSidebarCollapsed={setIsRightSidebarCollapsed}
        isMobile={isMobile}
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
      />

      <StatusBar
        projectId={projectId}
        projectName={projectName}
        gitlabBranch={linkedRepo?.defaultBranch}
        fileSourceType={primaryFileSourceType}
        isFocusMode={focusModeState.isFocusMode}
        onOpenZipImportDialog={() => setShowZipImportDialog(true)}
      />

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
