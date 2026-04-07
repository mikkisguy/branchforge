import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Download, Package, Sparkles, X } from "lucide-react";
import {
  StatusBar,
  ScriptEditor,
  CharacterReferencePanel,
} from "@/components/script-mode";
import { ProjectFileTree } from "@/components/script-mode/ProjectFileTree";
import { EditorTabBar, type EditorTabBarItem } from "@/components/ide-shared";
import { useLabels } from "@/hooks/useLabels";
import { useGitLab } from "@/hooks/useGitLab";
import { useCharacters } from "@/hooks/useCharacters";
import { useProjectFiles } from "@/hooks/useProjectFiles";
import { useAutosave } from "@/hooks/useAutosave";
import { sanitizeLabelName } from "@/lib/label-utils";
import { GitLabSyncDialog } from "@/components/script-mode/GitLabSyncDialog";
import { ZipImportDialog } from "@/components/zip-import";
import { Button } from "@/components/ui/button";
import { queryClient } from "@/lib/query-client";
import { labelKeys, projectFilesKeys } from "@/lib/query-keys";
import { useToast } from "@/contexts/ToastContext";
import { ApiRequestError } from "@/lib/api/client";
import { registerModeFlushHandler } from "@/lib/editor-sync-coordinator";
import type { FileSourceType } from "@branchforge/shared";

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

  // Sync dialog state
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [showZipImportDialog, setShowZipImportDialog] = useState(false);

  // Track open tabs with project-scoped persistence
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const tabsLoadedRef = useRef<string | undefined>(undefined);

  const tabsStorageKey = projectId
    ? `branchforge:scriptTabs:${projectId}`
    : null;
  const activeFileStorageKey = projectId
    ? `branchforge:activeScriptFile:${projectId}`
    : null;

  // Track edited file content for autosave
  const [editedFileContent, setEditedFileContent] = useState<string>("");
  const [currentEditFileId, setCurrentEditFileId] = useState<string | null>(
    null
  );
  const [currentEditFileHash, setCurrentEditFileHash] = useState<string | null>(
    null
  );
  const [hasSaveConflict, setHasSaveConflict] = useState(false);

  // Simple hash function for file content
  const hashFileContent = useCallback((content: string) => {
    let hash = 0x811c9dc5;
    for (let i = 0; i < content.length; i++) {
      hash ^= content.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
  }, []);

  // Autosave hook for file content
  const {
    saveStatus: fileSaveStatus,
    isDirty: isFileDirty,
    retrySave: retryFileSave,
    triggerSave: triggerFileSave,
    resetSavedHash,
  } = useAutosave({
    data: editedFileContent,
    hashFn: hashFileContent,
    debounceMs: 1000, // Reduced from 2000ms for faster feedback
    onSave: useCallback(
      async (content: string) => {
        if (currentEditFileId) {
          const result = await updateFileContent(currentEditFileId, content, {
            expectedContentHash: currentEditFileHash ?? undefined,
          });

          if (result.success) {
            setCurrentEditFileHash(result.contentHash);
            setHasSaveConflict(false);

            // Invalidate both files and labels queries after save
            if (projectId) {
              queryClient.invalidateQueries({
                queryKey: projectFilesKeys.lists(projectId),
              });
              void queryClient.refetchQueries({
                queryKey: labelKeys.lists(projectId),
              });

              // Also invalidate the specific label detail if we're viewing a label
              if (activeLabelId) {
                void queryClient.refetchQueries({
                  queryKey: labelKeys.detail(projectId, activeLabelId),
                });
              }
            }
          }
        }
      },
      [
        currentEditFileId,
        updateFileContent,
        projectId,
        activeLabelId,
        currentEditFileHash,
      ]
    ),
    onError: useCallback(
      (error: Error) => {
        if (error instanceof ApiRequestError && error.status === 409) {
          setHasSaveConflict(true);
          showErrorToast(
            "This file changed elsewhere. Reload project files before editing again.",
            "Script conflict detected"
          );
          return;
        }
        console.error("Failed to save file content:", error);
      },
      [showErrorToast]
    ),
  });

  // Keep latest autosave state for unmount cleanup without re-running cleanup
  const triggerFileSaveRef = useRef(triggerFileSave);

  useEffect(() => {
    triggerFileSaveRef.current = triggerFileSave;
  }, [triggerFileSave]);

  useEffect(() => {
    const unregister = registerModeFlushHandler("script", async () => {
      return await triggerFileSaveRef.current();
    });

    return unregister;
  }, []);

  // Flush pending file save on unmount (e.g., mode switch Script -> Write)
  useEffect(() => {
    return () => {
      // Always trigger on unmount so we don't miss very recent edits during
      // rapid mode switches; useAutosave will no-op if nothing changed.
      void triggerFileSaveRef.current();
    };
  }, []);

  // Track active file for Script Mode
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const activeProjectFile = useMemo(
    () => projectFiles.find((f) => f.id === activeFileId) || null,
    [projectFiles, activeFileId]
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

  // Track the line number to scroll to when switching modes
  const [scrollToLine, setScrollToLine] = useState<number | null>(null);

  // Helper: Find the line number where a label starts in the file content
  const findLabelLineNumber = useCallback(
    (fileContent: string, labelTitle: string): number | null => {
      const labelName = sanitizeLabelName(labelTitle);
      const lines = fileContent.split("\n");

      // Find the line with "label {name}:" pattern
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith("label ") && line.endsWith(":")) {
          const extractedLabel = line.slice(6, -1).trim();
          if (extractedLabel === labelName) {
            return i + 1; // Line numbers are 1-indexed
          }
        }
      }

      return null;
    },
    []
  );

  // Helper: Switch to a file with dirty state checking
  // Auto-saves unsaved changes before switching to prevent data loss
  const switchToFile = useCallback(
    async (file: { id: string; content: string }) => {
      // Skip if already on this file
      if (currentEditFileId === file.id) {
        return true;
      }

      // Save unsaved changes before switching
      if (currentEditFileId && (isFileDirty || fileSaveStatus === "error")) {
        const flushed = await triggerFileSave();
        if (!flushed) {
          showErrorToast(
            "Could not save pending edits. Resolve the save error before switching files.",
            "File switch blocked"
          );
          return false;
        }
      }

      // Switch to the new file
      setActiveFileId(file.id);
      setOpenTabs((prev) => {
        if (prev.includes(file.id)) {
          return prev;
        }
        return [...prev, file.id];
      });
      setEditedFileContent(file.content);
      setCurrentEditFileId(file.id);
      const nextFile = projectFiles.find((f) => f.id === file.id);
      setCurrentEditFileHash(nextFile?.contentHash ?? null);
      setHasSaveConflict(false);
      resetSavedHash(file.content);
      return true;
    },
    [
      currentEditFileId,
      isFileDirty,
      fileSaveStatus,
      triggerFileSave,
      resetSavedHash,
      projectFiles,
      showErrorToast,
    ]
  );

  // When script mode has an active label, select its file and scroll to the label line
  useEffect(() => {
    if (!activeLabelId) {
      return;
    }

    const fileWithLabel = projectFiles.find((f) =>
      f.labels.some((l) => l.id === activeLabelId)
    );

    if (!fileWithLabel) {
      return;
    }

    const labelMetadata = fileWithLabel.labels.find(
      (l) => l.id === activeLabelId
    );
    if (!labelMetadata) {
      setScrollToLine(null);
      return;
    }

    const lineNumber = findLabelLineNumber(
      fileWithLabel.content,
      labelMetadata.title
    );

    // Switch to the file with dirty state checking, then scroll to label
    void (async () => {
      const switched = await switchToFile(fileWithLabel);
      if (!switched) {
        return;
      }
      setScrollToLine(lineNumber);
    })();
  }, [activeLabelId, projectFiles, findLabelLineNumber, switchToFile]);

  // Refresh files on mount to ensure fresh data when switching from write mode
  // This ensures that any changes made in write mode are reflected immediately
  const hasRefreshed = useRef(false);
  useEffect(() => {
    if (projectId && !isLoadingFiles && !hasRefreshed.current) {
      refreshFiles();
      hasRefreshed.current = true;
    }
  }, [projectId, isLoadingFiles, refreshFiles]);

  // Persist open tabs after project state has been hydrated from storage
  useEffect(() => {
    if (tabsStorageKey && tabsLoadedRef.current === projectId) {
      localStorage.setItem(tabsStorageKey, JSON.stringify(openTabs));
    }
  }, [openTabs, projectId, tabsStorageKey]);

  // Persist active file to localStorage
  useEffect(() => {
    if (!activeFileStorageKey) {
      return;
    }

    if (activeFileId) {
      localStorage.setItem(activeFileStorageKey, activeFileId);
    } else {
      localStorage.removeItem(activeFileStorageKey);
    }
  }, [activeFileId, activeFileStorageKey]);

  // Refs for project reset effect to avoid unwanted reruns
  const currentEditFileIdRef = useRef(currentEditFileId);
  const isFileDirtyRef = useRef(isFileDirty);
  const fileSaveStatusRef = useRef(fileSaveStatus);
  const showErrorToastRef = useRef(showErrorToast);

  useEffect(() => {
    currentEditFileIdRef.current = currentEditFileId;
  }, [currentEditFileId]);

  useEffect(() => {
    isFileDirtyRef.current = isFileDirty;
  }, [isFileDirty]);

  useEffect(() => {
    fileSaveStatusRef.current = fileSaveStatus;
  }, [fileSaveStatus]);

  useEffect(() => {
    showErrorToastRef.current = showErrorToast;
  }, [showErrorToast]);

  useEffect(() => {
    const resetProjectState = async () => {
      if (
        currentEditFileIdRef.current &&
        (isFileDirtyRef.current || fileSaveStatusRef.current === "error")
      ) {
        const flushed = await triggerFileSaveRef.current();
        if (!flushed) {
          showErrorToastRef.current(
            "Could not save pending edits. The save failed when switching projects.",
            "Project switch warning"
          );
        }
      }

      hasRefreshed.current = false;
      tabsLoadedRef.current = undefined;
      setOpenTabs([]);
      setActiveFileId(null);
      setCurrentEditFileId(null);
      setCurrentEditFileHash(null);
      setEditedFileContent("");
      setScrollToLine(null);
      setHasSaveConflict(false);
    };

    void resetProjectState();
  }, [projectId]);

  // Handle Ctrl+S for immediate save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyS") {
        e.preventDefault();
        triggerFileSave();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [triggerFileSave]);

  // Get active file content directly for Script Mode editing
  // Use edited content if available, otherwise use original content
  const activeFileContent =
    activeProjectFile && currentEditFileId === activeProjectFile.id
      ? editedFileContent
      : activeProjectFile?.content || "";

  // Handle GitLab file selection
  const handleGitLabFileSelect = (fileId: string) => {
    const file = projectFiles.find((f) => f.id === fileId);
    if (!file) {
      return;
    }

    void (async () => {
      const switched = await switchToFile(file);
      if (!switched) {
        return;
      }
      setScrollToLine(null);
      // Also clear the active scene since we're now in file mode
      setActiveLabelId(null);
    })();
  };

  const handleSelectFileTab = useCallback(
    async (fileId: string) => {
      const file = projectFiles.find(
        (projectFile) => projectFile.id === fileId
      );
      if (!file) {
        return;
      }

      const switched = await switchToFile(file);
      if (!switched) {
        return;
      }

      setScrollToLine(null);
      setActiveLabelId(null);
    },
    [projectFiles, switchToFile, setActiveLabelId]
  );

  const handleCloseFileTab = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent, fileId: string) => {
      e.stopPropagation();

      const isActive = fileId === activeFileId;
      setOpenTabs((prev) => {
        const index = prev.indexOf(fileId);
        if (index === -1) {
          return prev;
        }

        return prev.filter((id) => id !== fileId);
      });

      if (isActive) {
        const nextTabs = openTabs.filter((id) => id !== fileId);

        if (nextTabs.length === 0) {
          setActiveFileId(null);
          setCurrentEditFileId(null);
          setCurrentEditFileHash(null);
          setEditedFileContent("");
          setActiveLabelId(null);
          setScrollToLine(null);
        } else {
          const index = openTabs.indexOf(fileId);
          const fallbackFileId = openTabs[index - 1] ?? nextTabs[0];

          void handleSelectFileTab(fallbackFileId);
        }
      }
    },
    [
      activeFileId,
      openTabs,
      handleSelectFileTab,
      setActiveLabelId,
      setActiveFileId,
      setCurrentEditFileId,
      setCurrentEditFileHash,
      setEditedFileContent,
      setScrollToLine,
    ]
  );

  // Update edited content when active file changes (manual selection)
  useEffect(() => {
    if (activeProjectFile && activeProjectFile.id !== currentEditFileId) {
      void switchToFile(activeProjectFile);
    }
  }, [activeProjectFile, switchToFile, currentEditFileId]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isFileDirty) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isFileDirty]);

  // Handle GitLab scene selection (label within a file)
  const handleGitLabSceneSelect = (sceneId: string) => {
    setActiveLabelId(sceneId);
  };

  // Determine which folders should be expanded by default
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

  const tabItems = useMemo<EditorTabBarItem[]>(
    () =>
      openTabs
        .map((tabId) =>
          projectFiles.find((projectFile) => projectFile.id === tabId)
        )
        .filter((file): file is NonNullable<typeof file> => file !== undefined)
        .map((file) => {
          const fileName = file.filePath.split("/").pop() || file.filePath;
          const fileKind = file.fileType === "SETTINGS" ? "Settings" : "Story";

          return {
            id: file.id,
            title: fileName,
            meta: fileKind,
            closeLabel: `Close ${fileName}`,
          };
        }),
    [openTabs, projectFiles]
  );

  // Load persisted tabs and active file once per project after files load
  useEffect(() => {
    if (!projectId || isLoadingFiles || tabsLoadedRef.current === projectId) {
      return;
    }

    let isMounted = true;

    const fileIds = new Set(projectFiles.map((file) => file.id));
    const savedTabsRaw = tabsStorageKey
      ? localStorage.getItem(tabsStorageKey)
      : null;

    let nextOpenTabs: string[] = [];
    if (savedTabsRaw) {
      try {
        const parsedTabs = JSON.parse(savedTabsRaw) as unknown;
        if (Array.isArray(parsedTabs)) {
          nextOpenTabs = parsedTabs.filter(
            (id): id is string => typeof id === "string" && fileIds.has(id)
          );
        }
      } catch {
        // Invalid JSON, ignore
      }
    }

    const savedActiveFileId = activeFileStorageKey
      ? localStorage.getItem(activeFileStorageKey)
      : null;
    const resolvedActiveFileId =
      savedActiveFileId && fileIds.has(savedActiveFileId)
        ? savedActiveFileId
        : activeFileId && fileIds.has(activeFileId)
          ? activeFileId
          : null;

    if (resolvedActiveFileId && !nextOpenTabs.includes(resolvedActiveFileId)) {
      nextOpenTabs = [...nextOpenTabs, resolvedActiveFileId];
    }

    setOpenTabs(nextOpenTabs);

    const loadActiveFile = async () => {
      if (resolvedActiveFileId && resolvedActiveFileId !== activeFileId) {
        await handleSelectFileTab(resolvedActiveFileId);
      }

      if (isMounted) {
        tabsLoadedRef.current = projectId;
      }
    };

    void loadActiveFile();

    return () => {
      isMounted = false;
    };
  }, [
    projectId,
    isLoadingFiles,
    projectFiles,
    tabsStorageKey,
    activeFileStorageKey,
    activeFileId,
    handleSelectFileTab,
  ]);

  // Keep tab bar aligned with externally changed active file
  useEffect(() => {
    if (
      !activeFileId ||
      !projectFiles.some((file) => file.id === activeFileId)
    ) {
      return;
    }

    setOpenTabs((prev) => {
      if (prev.includes(activeFileId)) {
        return prev;
      }
      return [...prev, activeFileId];
    });
  }, [activeFileId, projectFiles]);

  // Prune tabs if files disappear from the project
  useEffect(() => {
    const fileIds = new Set(projectFiles.map((file) => file.id));
    setOpenTabs((prev) => {
      const nextTabs = prev.filter((tabId) => fileIds.has(tabId));
      return nextTabs.length === prev.length ? prev : nextTabs;
    });
  }, [projectFiles]);

  const isLinked = projectId ? isProjectLinked(projectId) : false;
  const linkedRepo = projectId ? getLinkedRepository(projectId) : null;

  // Determine the primary file source type from project files
  // If no files exist but project is GitLab-linked, assume GITLAB type
  const primaryFileSourceType: FileSourceType | undefined = useMemo(() => {
    if (projectFiles.length === 0) {
      // No files yet - check if project is GitLab-linked
      if (isLinked) {
        return "GITLAB";
      }
      return undefined;
    }
    // Use the first file's source type as the primary type
    // (projects typically use a single source type)
    return projectFiles[0].sourceType;
  }, [projectFiles, isLinked]);

  // Loading state
  if (isLoadingLabels || isLoadingFiles) {
    return (
      <div className="flex-1 flex flex-col pt-16">
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Loading labels...</p>
        </div>
      </div>
    );
  }

  // No files state
  if (!projectFiles.length) {
    return (
      <div className="flex-1 flex flex-col pt-16">
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-muted-foreground">No files imported yet</p>
          <p className="text-sm text-muted-foreground">
            Import from GitLab or import from a zip file to get started
          </p>
          <div className="flex gap-2">
            {isLinked && (
              <Button
                variant="outline"
                onClick={() => setShowSyncDialog(true)}
                className="mt-2"
              >
                <Download className="w-4 h-4 mr-2" />
                Import from GitLab
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => setShowZipImportDialog(true)}
              className="mt-2"
            >
              <Package className="w-4 h-4 mr-2" />
              Import from Zip
            </Button>
          </div>
        </div>

        {/* Sync Dialog */}
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

        {/* Zip Import Dialog */}
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

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Main Editor Layout */}
      <div className="flex-1 flex gap-4 px-4 pb-4 overflow-hidden min-h-0 min-w-0">
        {/* Left Sidebar */}
        <div className="w-56 min-h-0 shrink-0 rounded-lg border border-border bg-card/50 overflow-hidden mt-3">
          <div className="h-full overflow-y-auto">
            <div className="sticky top-0 z-20 bg-card border-b border-border px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded bg-[var(--theme-color)] flex items-center justify-center shadow-sm shrink-0">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  <span className="text-sm font-medium block truncate">
                    {projectName || "Script Mode"}
                  </span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {projectFiles.length} file
                    {projectFiles.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-3 space-y-3">
              <button
                type="button"
                className="w-full py-2 px-3 rounded-lg text-sm font-medium transition-colors bg-[var(--theme-color)] text-white hover:opacity-90"
              >
                + New Chapter
              </button>

              <ProjectFileTree
                files={projectFiles}
                activeFileId={activeFileId ?? undefined}
                activeSceneId={activeLabelId ?? undefined}
                onFileSelect={handleGitLabFileSelect}
                onSceneSelect={handleGitLabSceneSelect}
                initialExpandedFolders={initialExpandedFolders}
              />
            </div>
          </div>
        </div>

        {/* Center Column: Tab Bar + Editor */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0 mt-3">
          <EditorTabBar
            items={tabItems}
            activeItemId={activeFileId}
            onSelect={handleSelectFileTab}
            onClose={handleCloseFileTab}
            idPrefix="script-tab-"
            titleMaxWidthClassName="max-w-[240px]"
          />

          {/* Main Editor */}
          <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
            <div className="bg-card/50 border border-border rounded-lg h-full overflow-hidden min-h-0 min-w-0">
              {activeProjectFile ? (
                <ScriptEditor
                  content={activeFileContent}
                  scrollToLine={scrollToLine}
                  onChange={(value) => {
                    setEditedFileContent(value);
                  }}
                />
              ) : activeLabel ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
                  <div className="flex items-center gap-2 text-destructive">
                    <X size={16} />
                    <span className="font-medium">Scene not found</span>
                  </div>
                  <p className="text-sm max-w-md text-center">
                    The file containing this scene could not be found. It may
                    have been deleted or there was an error loading the project
                    files.
                  </p>
                  <Button variant="outline" size="sm" onClick={refreshFiles}>
                    Refresh files
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Select a file or scene to view its content
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <CharacterReferencePanel
          sceneCharacters={sceneCharacters}
          projectCharacters={projectCharacters}
          activeLabel={activeLabel}
          statusColor={statusColor}
        />
      </div>

      {/* Status Bar */}
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

      {/* Sync Dialog */}
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

      {/* Zip Import Dialog (always available for non-empty projects too) */}
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
