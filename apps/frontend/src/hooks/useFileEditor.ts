import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAutosave, type SaveStatus } from "@/hooks/useAutosave";
import { labelKeys, projectFilesKeys } from "@/lib/query-keys";
import { registerModeFlushHandler } from "@/lib/editor-sync-coordinator";
import {
  matchesShortcut,
  shouldIgnoreAppShortcut,
} from "@/lib/keyboard-shortcuts";
import { ApiRequestError } from "@/lib/api/client";
import type { ProjectFileNode, UseProjectFilesReturn } from "./useProjectFiles";

interface UseFileEditorProps {
  projectId: string | undefined;
  projectFiles: ProjectFileNode[];
  updateFileContent: UseProjectFilesReturn["updateFileContent"];
  showErrorToast: (message: string, title: string) => void;
  skipSaveRef?: RefObject<boolean>;
}

interface SwitchFileTarget {
  id: string;
  content: string;
  contentHash?: string | null;
  updatedAt?: string;
}

interface UseFileEditorReturn {
  fileSaveStatus: SaveStatus;
  isFileDirty: boolean;
  editedFileContent: string;
  currentEditFileId: string | null;
  hasSaveConflict: boolean;
  setEditedFileContent: (content: string) => void;
  triggerFileSave: () => Promise<boolean>;
  retryFileSave: () => Promise<boolean>;
  switchToFile: (file: SwitchFileTarget) => Promise<boolean>;
  clearEditorState: (flush?: boolean) => Promise<boolean>;
}

class SaveConflictError extends Error {
  constructor() {
    super("Save conflict detected");
    this.name = "SaveConflictError";
  }
}

function hashFileContent(content: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function useFileEditor({
  projectId,
  projectFiles,
  updateFileContent,
  showErrorToast,
  skipSaveRef,
}: UseFileEditorProps): UseFileEditorReturn {
  const queryClient = useQueryClient();

  const [editedFileContent, setEditedFileContent] = useState("");
  const [currentEditFileId, setCurrentEditFileId] = useState<string | null>(
    null
  );
  const currentEditFileHashRef = useRef<string | null>(null);
  const currentEditFileIdRef = useRef<string | null>(null);
  const editedFileContentRef = useRef<string>("");
  const latestSavedFileByIdRef = useRef<
    Record<string, { content: string; contentHash: string; updatedAt: string }>
  >({});
  const [hasSaveConflict, setHasSaveConflict] = useState(false);

  useEffect(() => {
    currentEditFileIdRef.current = currentEditFileId;
  }, [currentEditFileId]);

  useEffect(() => {
    editedFileContentRef.current = editedFileContent;
  }, [editedFileContent]);

  const {
    saveStatus: fileSaveStatus,
    isDirty: isFileDirty,
    retrySave: retryFileSave,
    triggerSave: triggerFileSave,
    resetSavedHash,
  } = useAutosave({
    data: editedFileContent,
    hashFn: hashFileContent,
    debounceMs: 1000,
    skipSaveRef,
    onSave: useCallback(
      async (content: string) => {
        const fileIdAtSave = currentEditFileId;
        if (!fileIdAtSave) {
          return;
        }

        const result = await updateFileContent(fileIdAtSave, content, {
          expectedContentHash: currentEditFileHashRef.current ?? undefined,
        });

        if (!result.success) {
          throw new SaveConflictError();
        }

        latestSavedFileByIdRef.current[fileIdAtSave] = {
          content: result.normalizedContent ?? content,
          contentHash: result.contentHash,
          updatedAt: result.updatedAt,
        };

        if (currentEditFileIdRef.current === fileIdAtSave) {
          currentEditFileHashRef.current = result.contentHash;
          setHasSaveConflict(false);
        }

        if (projectId) {
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: projectFilesKeys.lists(projectId),
            }),
            queryClient.invalidateQueries({
              // Invalidate all label caches scoped to this project so Write Mode
              // mounts with stale data and refetches immediately.
              queryKey: labelKeys.scoped(projectId),
            }),
          ]);
        }

        // Apply server-normalized content only when the user is still on the
        // same file and has not typed newer text since this save started.
        if (
          fileIdAtSave === currentEditFileIdRef.current &&
          editedFileContentRef.current === content &&
          result.normalizedContent !== undefined
        ) {
          const normalized = result.normalizedContent;
          setEditedFileContent((current) =>
            current === content ? normalized : current
          );
        }
        return result.normalizedContent;
      },
      [currentEditFileId, projectId, queryClient, updateFileContent]
    ),
    onError: useCallback(
      (error: Error) => {
        if (
          error instanceof SaveConflictError ||
          (error instanceof ApiRequestError && error.status === 409)
        ) {
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

  // Best-effort save on unmount - may not complete if page closes quickly
  // react-doctor-disable-next-line react-doctor/exhaustive-deps
  useEffect(() => {
    return () => {
      void triggerFileSaveRef.current().catch((error) => {
        console.error("Best-effort save on unmount failed:", error);
      });
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreAppShortcut(event)) {
        return;
      }
      if (matchesShortcut(event, "save")) {
        event.preventDefault();
        void triggerFileSave();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [triggerFileSave]);

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

  const switchToFile = useCallback(
    async (file: SwitchFileTarget) => {
      if (currentEditFileId === file.id) {
        return true;
      }

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

      // A tab selection can hold a snapshot from before the flush above.
      // Resolve the newest content as well as its hash before resetting autosave.
      const cachedFiles = projectId
        ? queryClient
            .getQueriesData<ProjectFileNode[]>({
              queryKey: projectFilesKeys.lists(projectId),
            })
            .flatMap(([, files]) => files ?? [])
        : [];
      const latestFile = [...projectFiles, ...cachedFiles]
        .filter((candidate) => candidate.id === file.id)
        .reduce(
          (latest, candidate) =>
            Date.parse(candidate.updatedAt) >
            (Date.parse(latest.updatedAt ?? "") || 0)
              ? candidate
              : latest,
          file
        );
      const saved = latestSavedFileByIdRef.current[file.id];
      const target =
        saved &&
        Date.parse(saved.updatedAt) >=
          (Date.parse(latestFile.updatedAt ?? "") || 0)
          ? saved
          : latestFile;
      setEditedFileContent(target.content);
      setCurrentEditFileId(file.id);
      currentEditFileHashRef.current = target.contentHash ?? null;
      setHasSaveConflict(false);
      resetSavedHash(target.content);
      return true;
    },
    [
      currentEditFileId,
      fileSaveStatus,
      isFileDirty,
      projectFiles,
      projectId,
      queryClient,
      resetSavedHash,
      showErrorToast,
      triggerFileSave,
    ]
  );

  const clearEditorState = useCallback(
    async (flush = false) => {
      if (flush && isFileDirty) {
        const flushed = await triggerFileSave();
        if (!flushed) {
          return false;
        }
      }

      setCurrentEditFileId(null);
      currentEditFileHashRef.current = null;
      setEditedFileContent("");
      setHasSaveConflict(false);
      resetSavedHash("");
      return true;
    },
    [isFileDirty, resetSavedHash, triggerFileSave]
  );

  return {
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
  };
}
