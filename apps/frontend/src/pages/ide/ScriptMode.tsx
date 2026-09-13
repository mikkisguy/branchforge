import { ScriptModeEditorLayout } from "./components/ScriptModeEditorLayout";
import { WorkspaceFocusReporter } from "@/components/workspace/WorkspaceFocusReporter";
import { ScriptModeEmptyState } from "./components/ScriptModeEmptyState";
import { ScriptModeDialogs } from "./components/ScriptModeDialogs";
import { useScriptMode } from "./components/useScriptMode";
import { CreateFileDialog } from "@/components/ide-shared/CreateFileDialog";
import { RenameFileDialog } from "@/components/ide-shared/RenameFileDialog";
import { DeleteFileDialog } from "@/components/ide-shared/DeleteFileDialog";
import { useProject } from "@/hooks/useProject";

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
  const { currentProject } = useProject();
  const canCreateFile = currentProject?.visibility === "OWNER";
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
    showCreateFileDialog,
    handleOpenCreateFileDialog,
    handleCreateFileDialogOpenChange,
    handleCreateFile,
    isCreatingFile,
    createFileError,
    resetCreateFileError,
    foldersToExpand,
    fileActions,
    fileRowActions,
  } = useScriptMode({ projectId });

  const createFileDialog =
    projectId && canCreateFile ? (
      <CreateFileDialog
        open={showCreateFileDialog}
        onOpenChange={handleCreateFileDialogOpenChange}
        onCreate={handleCreateFile}
        isCreating={isCreatingFile}
        onDismissServerError={resetCreateFileError}
        serverError={createFileError?.message ?? null}
      />
    ) : null;

  const pendingFileAction = fileActions.pendingAction;
  const fileActionDialogs = pendingFileAction ? (
    pendingFileAction.kind === "rename" ? (
      <RenameFileDialog
        open
        onOpenChange={(open) => {
          if (!open) fileActions.closeDialog();
        }}
        currentFilePath={pendingFileAction.file.filePath}
        onRename={fileActions.confirmRename}
        isRenaming={fileActions.isRenaming}
        serverError={fileActions.renameError?.message ?? null}
      />
    ) : (
      <DeleteFileDialog
        open
        onOpenChange={(open) => {
          if (!open) fileActions.closeDialog();
        }}
        projectId={projectId ?? ""}
        file={{
          id: pendingFileAction.file.id,
          filePath: pendingFileAction.file.filePath,
        }}
        canForce={pendingFileAction.forceAllowed}
        onDelete={fileActions.confirmDelete}
        isDeleting={fileActions.isDeleting}
        serverError={fileActions.deleteError?.message ?? null}
      />
    )
  ) : null;

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
          onNewFile={canCreateFile ? handleOpenCreateFileDialog : undefined}
          projectVisibility={currentProject?.visibility}
        />
        {createFileDialog}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <WorkspaceFocusReporter
        active={focusModeState.isFocusMode}
        onFocusModeChange={onFocusModeChange}
      />
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
          foldersToExpand={foldersToExpand}
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
          onNewFile={canCreateFile ? handleOpenCreateFileDialog : undefined}
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
          projectVisibility={currentProject?.visibility}
          onOpenZipImportDialog={() => setShowZipImportDialog(true)}
          generatedFiles={generatedFiles}
          activeGeneratedFileId={activeGeneratedFileId}
          onGeneratedFileSelect={onGeneratedFileSelect}
          isGeneratedPreview={isGeneratedPreview}
          generatedFileName={generatedFileName}
          fileActions={fileRowActions}
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
        projectVisibility={currentProject?.visibility}
      />
      {createFileDialog}
      {fileActionDialogs}
    </div>
  );
}
