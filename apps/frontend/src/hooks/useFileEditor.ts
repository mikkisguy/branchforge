import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAutosave, type SaveStatus } from "@/hooks/useAutosave";
import { labelKeys, projectFilesKeys } from "@/lib/query-keys";
import { registerModeFlushHandler } from "@/lib/editor-sync-coordinator";
import { ApiRequestError } from "@/lib/api/client";
import type { ProjectFileNode, UseProjectFilesReturn } from "./useProjectFiles";

interface UseFileEditorProps {
  projectId: string | undefined;
  projectFiles: ProjectFileNode[];
  updateFileContent: UseProjectFilesReturn["updateFileContent"];
  showErrorToast: (message: string, title: string) => void;
  skipSaveRef?: RefObject<boolean>;
}

export interface SwitchFileTarget {
  id: string;
  content: string;
  contentHash?: string | null;
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
  const latestServerHashByFileIdRef = useRef<Record<string, string>>({});
  const [hasSaveConflict, setHasSaveConflict] = useState(false);

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
        if (!currentEditFileId) {
          return;
        }

        const result = await updateFileContent(currentEditFileId, content, {
          expectedContentHash: currentEditFileHashRef.current ?? undefined,
        });

        if (!result.success) {
          throw new SaveConflictError();
        }

        if (currentEditFileId && result.contentHash) {
          latestServerHashByFileIdRef.current[currentEditFileId] =
            result.contentHash;
        }

        currentEditFileHashRef.current = result.contentHash;
        setHasSaveConflict(false);

        if (!projectId) {
          return;
        }

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
  useEffect(() => {
    return () => {
      void triggerFileSaveRef.current().catch((error) => {
        console.error("Best-effort save on unmount failed:", error);
      });
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.code === "KeyS") {
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

      setEditedFileContent(file.content);
      setCurrentEditFileId(file.id);

      let serverHash: string | null =
        latestServerHashByFileIdRef.current[file.id] ?? null;

      if (!serverHash) {
        const projectFile = projectFiles.find((f) => f.id === file.id);
        serverHash = projectFile?.contentHash ?? file.contentHash ?? null;
      }

      currentEditFileHashRef.current = serverHash;
      setHasSaveConflict(false);
      resetSavedHash(file.content);
      return true;
    },
    [
      currentEditFileId,
      fileSaveStatus,
      isFileDirty,
      projectFiles,
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
