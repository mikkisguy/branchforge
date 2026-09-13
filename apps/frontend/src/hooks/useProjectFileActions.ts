/**
 * useProjectFileActions Hook
 *
 * Orchestrates rename/move and delete flows for project files, shared by
 * Script Mode and Write Mode:
 *
 * - Owner-only: requests are ignored when `canModify` is false.
 * - Generated BranchForge preview files are protected from both actions.
 * - Coordinates with the mode's autosave: pending changes are flushed
 *   normally before opening a dialog; a failed flush **blocks rename**
 *   entirely and only enables the force-delete pathway for delete.
 * - Registers the F2 "rename active/selected file" shortcut, which is
 *   ignored while focus is inside an editable control. There is
 *   deliberately no Delete-key shortcut for file deletion.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useProjectFileMutations } from "@/hooks/useProjectFileMutations";
import { isGeneratedPreviewFilePath } from "@/lib/generated-preview-files";
import {
  matchesShortcut,
  shouldIgnoreAppShortcut,
  isNativeEditableTarget,
} from "@/lib/keyboard-shortcuts";
import type { ProjectFileNode } from "@/hooks/useProjectFiles";

export type FileActionKind = "rename" | "delete";

export interface PendingFileAction {
  kind: FileActionKind;
  file: ProjectFileNode;
  /**
   * True when a pending autosave could not be flushed before opening the
   * dialog. Only delete dialogs may offer the force pathway.
   */
  forceAllowed: boolean;
}

export interface UseProjectFileActionsOptions {
  projectId: string | undefined;
  /** Owner-only gating; false hides all actions and disables F2. */
  canModify: boolean;
  /**
   * Flush the mode's pending autosave. Return false when the flush failed
   * (save error or conflict) and the operation must be blocked.
   */
  flushAutosave?: (fileId: string) => Promise<boolean>;
  /**
   * Resolves the file the F2 shortcut should target (active/selected file).
   * Called on each keydown; return null when no file is active.
   */
  getActiveFile?: () => ProjectFileNode | null;
  /** Called after a successful delete for tab/label repair. */
  onFileDeleted?: (file: ProjectFileNode) => void;
  /** Called after a successful rename/move. */
  onFileRenamed?: (file: ProjectFileNode) => void;
  showErrorToast: (message: string, title: string) => void;
}

export interface UseProjectFileActionsReturn {
  /** Currently open dialog action, or null when no dialog is open. */
  pendingAction: PendingFileAction | null;
  requestRename: (file: ProjectFileNode) => Promise<void>;
  requestDelete: (file: ProjectFileNode) => Promise<void>;
  confirmRename: (newFilePath: string) => Promise<boolean>;
  confirmDelete: (options: { force: boolean }) => Promise<boolean>;
  closeDialog: () => void;
  /** Error from the last rename attempt, shown inside the rename dialog. */
  renameError: Error | null;
  /** Error from the last delete attempt, shown inside the delete dialog. */
  deleteError: Error | null;
  isRenaming: boolean;
  isDeleting: boolean;
}

export function useProjectFileActions({
  projectId,
  canModify,
  flushAutosave,
  getActiveFile,
  onFileDeleted,
  onFileRenamed,
  showErrorToast,
}: UseProjectFileActionsOptions): UseProjectFileActionsReturn {
  const [pendingAction, setPendingAction] = useState<PendingFileAction | null>(
    null
  );
  const [renameError, setRenameError] = useState<Error | null>(null);
  const [deleteError, setDeleteError] = useState<Error | null>(null);

  const { renameFile, deleteFile, isRenaming, isDeleting } =
    useProjectFileMutations(projectId);

  const flushAutosaveRef = useRef(flushAutosave);
  useEffect(() => {
    flushAutosaveRef.current = flushAutosave;
  }, [flushAutosave]);

  const getActiveFileRef = useRef(getActiveFile);
  useEffect(() => {
    getActiveFileRef.current = getActiveFile;
  }, [getActiveFile]);

  const onFileDeletedRef = useRef(onFileDeleted);
  useEffect(() => {
    onFileDeletedRef.current = onFileDeleted;
  }, [onFileDeleted]);

  const onFileRenamedRef = useRef(onFileRenamed);
  useEffect(() => {
    onFileRenamedRef.current = onFileRenamed;
  }, [onFileRenamed]);

  const showErrorToastRef = useRef(showErrorToast);
  useEffect(() => {
    showErrorToastRef.current = showErrorToast;
  }, [showErrorToast]);

  const canModifyRef = useRef(canModify);
  useEffect(() => {
    canModifyRef.current = canModify;
  }, [canModify]);

  const projectIdRef = useRef(projectId);
  useEffect(() => {
    projectIdRef.current = projectId;
    // react-doctor-disable-next-line react-doctor/no-adjust-state-on-prop-change -- project switches must close a dialog bound to the previous project's file
    setPendingAction(null);
  }, [projectId]);

  /**
   * Flush pending autosave changes before a structural operation.
   * Returns "clean" when nothing blocks the operation, "blocked" when the
   * flush failed (save error or conflict).
   */
  const flushBeforeStructuralChange = useCallback(
    async (fileId: string): Promise<"clean" | "blocked"> => {
      const operationProjectId = projectIdRef.current;
      if (!operationProjectId) return "blocked";
      const flush = flushAutosaveRef.current;
      if (!flush) return "clean";
      const flushed = await flush(fileId);
      if (projectIdRef.current !== operationProjectId) return "blocked";
      return flushed ? "clean" : "blocked";
    },
    []
  );

  const requestRename = useCallback(
    async (file: ProjectFileNode) => {
      const operationProjectId = projectIdRef.current;
      if (!canModifyRef.current || !operationProjectId) return;
      if (isGeneratedPreviewFilePath(file.filePath)) return;

      const flushResult = await flushBeforeStructuralChange(file.id);
      if (projectIdRef.current !== operationProjectId) return;
      if (flushResult === "blocked") {
        showErrorToastRef.current(
          "Resolve unsaved changes or save conflicts before renaming this file.",
          "Rename blocked"
        );
        return;
      }

      setRenameError(null);
      setPendingAction({ kind: "rename", file, forceAllowed: false });
    },
    [flushBeforeStructuralChange]
  );

  const requestDelete = useCallback(
    async (file: ProjectFileNode) => {
      const operationProjectId = projectIdRef.current;
      if (!canModifyRef.current || !operationProjectId) return;
      if (isGeneratedPreviewFilePath(file.filePath)) return;

      // Wait for the autosave normally; a failed flush only enables the
      // force-delete pathway — it never silently discards changes.
      const flushResult = await flushBeforeStructuralChange(file.id);
      if (projectIdRef.current !== operationProjectId) return;
      const forceAllowed = flushResult === "blocked";
      if (forceAllowed) {
        showErrorToastRef.current(
          "Unsaved changes could not be saved. You can force delete and discard them.",
          "Unsaved changes"
        );
      }

      setDeleteError(null);
      setPendingAction({ kind: "delete", file, forceAllowed });
    },
    [flushBeforeStructuralChange]
  );

  const confirmRename = useCallback(
    async (newFilePath: string): Promise<boolean> => {
      if (!pendingAction || pendingAction.kind !== "rename") return false;
      try {
        const renamedFile = await renameFile(
          pendingAction.file.id,
          newFilePath
        );
        setPendingAction(null);
        onFileRenamedRef.current?.(renamedFile);
        return true;
      } catch (error) {
        setRenameError(
          error instanceof Error ? error : new Error("Failed to rename file")
        );
        return false;
      }
    },
    [pendingAction, renameFile]
  );

  const confirmDelete = useCallback(
    async ({ force }: { force: boolean }): Promise<boolean> => {
      if (!pendingAction || pendingAction.kind !== "delete") return false;
      try {
        await deleteFile(pendingAction.file.id, { force });
        setPendingAction(null);
        onFileDeletedRef.current?.(pendingAction.file);
        return true;
      } catch (error) {
        setDeleteError(
          error instanceof Error ? error : new Error("Failed to delete file")
        );
        return false;
      }
    },
    [pendingAction, deleteFile]
  );

  const closeDialog = useCallback(() => {
    setPendingAction(null);
    setRenameError(null);
    setDeleteError(null);
  }, []);

  // F2 renames the active/selected file. Ignored inside editable controls
  // (inputs, textareas, contentEditable such as CodeMirror) and inside open
  // dialogs. There is intentionally no Delete-key shortcut.
  useEffect(() => {
    if (!canModify) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!matchesShortcut(event, "file-rename")) return;
      if (shouldIgnoreAppShortcut(event)) return;
      if (isNativeEditableTarget(event.target)) return;

      const targetFile = getActiveFileRef.current?.();
      if (!targetFile) return;
      if (isGeneratedPreviewFilePath(targetFile.filePath)) return;

      event.preventDefault();
      void requestRename(targetFile);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canModify, requestRename]);

  return {
    pendingAction,
    requestRename,
    requestDelete,
    confirmRename,
    confirmDelete,
    closeDialog,
    renameError,
    deleteError,
    isRenaming,
    isDeleting,
  };
}
