import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFileEditor } from "@/hooks/useFileEditor";
import { useFileTabs } from "@/hooks/useFileTabs";
import { useLabelFileSync } from "@/hooks/useLabelFileSync";
import { useProjectReset } from "@/hooks/useProjectReset";
import { useScriptModeRefresh } from "@/hooks/useScriptModeRefresh";
import { useTextUndo } from "@/hooks/useTextUndo";
import type { LabelTitleMap } from "@/lib/codemirror/label-title-decoration";
import type { SourceOrigin } from "@branchforge/shared";
import { useScriptModeData } from "./useScriptModeData";
import { useExportPreview } from "@/hooks/useExportPreview";

export function useScriptMode({ projectId }: { projectId?: string }) {
  const data = useScriptModeData({ projectId });
  const {
    setActiveLabelId,
    projectFiles,
    skipSaveRef,
    labels,
    showErrorToast,
  } = data;
  const previousEditFileIdRef = useRef<string | null>(null);
  const [scrollToLine, setScrollToLine] = useState<number | null>(null);

  const [generatedPreview, setGeneratedPreview] = useState<{
    fileName: string;
    content: string;
  } | null>(null);
  const previewQuery = useExportPreview(projectId);
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
    updateFileContent: data.updateFileContent,
    showErrorToast: data.showErrorToast,
    skipSaveRef,
  });

  const handleScriptFileSelect = useCallback(
    async (fileId: string) => {
      const file = projectFiles.find(
        (projectFile) => projectFile.id === fileId
      );
      if (!file) return false;
      return await switchToFile(file);
    },
    [projectFiles, switchToFile]
  );

  const handleGeneratedFileSelect = useCallback(
    async (fileName: string) => {
      if (!previewQuery.data) return;

      const file = previewQuery.data.files.find((f) => f.fileName === fileName);
      if (!file || file.isEmpty) return;

      // If there's a dirty save pending, save before switching
      if (!!currentEditFileId && (isFileDirty || fileSaveStatus === "error")) {
        const saved = await triggerFileSave();
        if (!saved) {
          showErrorToast(
            "Could not save changes before preview. Please resolve conflicts and try again.",
            "Save failed"
          );
          return;
        }
      }

      setGeneratedPreview({ fileName: file.fileName, content: file.content });
      setActiveLabelId(null);
    },
    [
      previewQuery.data,
      currentEditFileId,
      isFileDirty,
      fileSaveStatus,
      triggerFileSave,
      showErrorToast,
      setActiveLabelId,
    ]
  );

  const handleNoTabsRemaining = useCallback(() => {
    void clearEditorState();
    setActiveLabelId(null);
    setScrollToLine(null);
    setGeneratedPreview(null);
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
    isLoadingFiles: data.isLoadingFiles,
    isResettingRef: data.isResettingRef,
    onFileSelect: handleScriptFileSelect,
    onFileActivated: handleFileActivated,
    onNoTabsRemaining: handleNoTabsRemaining,
  });

  const { resetRefreshState } = useScriptModeRefresh({
    projectId,
    isLoadingFiles: data.isLoadingFiles,
    refreshFiles: data.refreshFiles,
  });

  const hasPendingSave =
    !!currentEditFileId && (isFileDirty || fileSaveStatus === "error");

  const handleResetState = useCallback(() => {
    resetRefreshState();
    clearTabsState();
    void clearEditorState();
    setScrollToLine(null);
    setGeneratedPreview(null);
  }, [clearEditorState, clearTabsState, resetRefreshState]);

  const setSkipSave = useCallback(
    (value: boolean) => {
      skipSaveRef.current = value;
    },
    [skipSaveRef]
  );

  useProjectReset({
    projectId,
    isResettingRef: data.isResettingRef,
    hasPendingSave,
    triggerSave: triggerFileSave,
    showErrorToast: data.showErrorToast,
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
    activeLabelId: data.activeLabelId,
    onFileSelect: handleLabelDrivenFileSelect,
    onSetScrollToLine: setScrollToLine,
  });

  const activeProjectFile = useMemo(
    () => projectFiles.find((file) => file.id === activeFileId) || null,
    [activeFileId, projectFiles]
  );

  const labelTitles: LabelTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    if (activeProjectFile) {
      for (const label of labels) {
        if (label.projectFileId === activeProjectFile.id && label.labelName) {
          map.set(label.labelName, label.title);
        }
      }
    }
    return map;
  }, [labels, activeProjectFile]);

  useEffect(() => {
    if (!activeProjectFile) return;
    if (currentEditFileId === activeProjectFile.id) return;

    const targetFile = activeProjectFile;
    const previousFileId = currentEditFileId;
    previousEditFileIdRef.current = previousFileId;
    let cancelled = false;

    (async () => {
      const success = await switchToFile(targetFile);
      if (cancelled) return;
      if (!success && previousFileId) {
        void selectFileTab(previousFileId, { notify: false });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeProjectFile, currentEditFileId, switchToFile, selectFileTab]);

  const activeFileContent = generatedPreview
    ? generatedPreview.content
    : activeProjectFile && currentEditFileId === activeProjectFile.id
      ? editedFileContent
      : activeProjectFile?.content || "";

  const handleUndoRedoChange = useCallback(
    (content: string) => {
      setEditedFileContent(content);
    },
    [setEditedFileContent]
  );

  const { canUndo, canRedo, undo, redo, recordChange, clear } = useTextUndo(
    activeFileContent,
    handleUndoRedoChange
  );

  const handleContentChange = useCallback(
    (value: string) => {
      setEditedFileContent(value);
      recordChange(value);
    },
    [recordChange, setEditedFileContent]
  );

  const previousUndoFileIdRef = useRef<string | null>(activeFileId);

  useEffect(() => {
    if (activeFileId && previousUndoFileIdRef.current !== activeFileId) {
      previousUndoFileIdRef.current = activeFileId;
      // react-doctor-disable-next-line react-doctor/no-pass-data-to-parent
      clear(activeFileContent);
    }
  }, [activeFileId, activeFileContent, clear]);

  const handleGitLabFileSelect = useCallback(
    (fileId: string) => {
      setGeneratedPreview(null);
      void selectFileTab(fileId);
    },
    [selectFileTab]
  );

  const handleSelectFileTab = useCallback(
    async (fileId: string) => {
      setGeneratedPreview(null);
      await selectFileTab(fileId);
    },
    [selectFileTab]
  );

  const handleGitLabSceneSelect = useCallback(
    (sceneId: string) => {
      setGeneratedPreview(null);
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

  const isLinked = projectId ? data.isProjectLinked(projectId) : false;
  const linkedRepo = projectId ? data.getLinkedRepository(projectId) : null;
  const linkedRepoInfo = useMemo(
    () => (linkedRepo ? { defaultBranch: linkedRepo.defaultBranch } : null),
    [linkedRepo]
  );

  const primaryFileSourceType: SourceOrigin | undefined = useMemo(() => {
    if (projectFiles.length === 0) {
      return isLinked ? "GITLAB" : undefined;
    }
    return projectFiles[0].source;
  }, [projectFiles, isLinked]);

  const saveConflict = activeProjectFile ? hasSaveConflict : undefined;
  const onSaveRequest: (() => Promise<boolean>) | undefined = activeProjectFile
    ? retryFileSave
    : undefined;

  // Always expose the three generated files so the filetree section is
  // visible even while the preview request is in flight.
  const generatedFiles = useMemo(() => {
    if (previewQuery.isError) {
      return [
        {
          fileName: "branchforge_variables.rpy",
          isEmpty: true,
          emptyReason: "Failed to load generated preview",
        },
        {
          fileName: "branchforge_stats.rpy",
          isEmpty: true,
          emptyReason: "Failed to load generated preview",
        },
        {
          fileName: "branchforge_definitions.rpy",
          isEmpty: true,
          emptyReason: "Failed to load generated preview",
        },
      ];
    }
    if (previewQuery.data?.files?.length) {
      return previewQuery.data.files.map((f) => ({
        fileName: f.fileName,
        isEmpty: f.isEmpty,
        emptyReason: f.emptyReason,
      }));
    }
    return [
      {
        fileName: "branchforge_variables.rpy",
        isEmpty: true,
        emptyReason: "Loading generated preview…",
      },
      {
        fileName: "branchforge_stats.rpy",
        isEmpty: true,
        emptyReason: "Loading generated preview…",
      },
      {
        fileName: "branchforge_definitions.rpy",
        isEmpty: true,
        emptyReason: "Loading generated preview…",
      },
    ];
  }, [previewQuery.data, previewQuery.isError]);

  const previewErrorShownRef = useRef(false);
  useEffect(() => {
    if (previewQuery.isError && !previewErrorShownRef.current) {
      previewErrorShownRef.current = true;
      showErrorToast("Failed to load generated preview", "Preview Error");
    }
  }, [previewQuery.isError, showErrorToast]);

  const activeGeneratedFileId = generatedPreview?.fileName ?? null;
  const isGeneratedPreview = !!generatedPreview;
  const generatedFileName = generatedPreview?.fileName;

  return {
    isLoadingLabels: data.isLoadingLabels,
    isLoadingFiles: data.isLoadingFiles,
    labels: data.labels,
    activeLabel: data.activeLabel,
    activeLabelId: data.activeLabelId,
    projectFiles: data.projectFiles,
    refreshFiles: data.refreshFiles,
    showSyncDialog: data.showSyncDialog,
    setShowSyncDialog: data.setShowSyncDialog,
    showZipImportDialog: data.showZipImportDialog,
    setShowZipImportDialog: data.setShowZipImportDialog,
    isLeftSidebarCollapsed: data.isLeftSidebarCollapsed,
    setIsLeftSidebarCollapsed: data.setIsLeftSidebarCollapsed,
    isRightSidebarCollapsed: data.isRightSidebarCollapsed,
    setIsRightSidebarCollapsed: data.setIsRightSidebarCollapsed,
    isMobile: data.isMobile,
    focusModeState: data.focusModeState,
    handleFocusModeToggle: data.handleFocusModeToggle,
    editorRef: data.editorRef,
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
    onUndo: undo,
    onRedo: redo,
    scrollToLine,
    fileSaveStatus,
    onSaveRequest,
    labelTitles,
    initialExpandedFolders,
    projectCharacters: data.projectCharacters,
    isLinked,
    linkedRepo: linkedRepoInfo,
    primaryFileSourceType,
    saveConflict,
    // Generated preview
    generatedFiles,
    activeGeneratedFileId,
    onGeneratedFileSelect: handleGeneratedFileSelect,
    isGeneratedPreview,
    generatedFileName,
  };
}
