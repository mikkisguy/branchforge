/**
 * GitLab Sync Dialog
 *
 * Dialog for GitLab export/import operations.
 * Shows progress and allows configuration of branch and commit message.
 */

import { useReducer, useCallback, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Upload } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useGitLabSync } from "@/hooks/useGitLabSync";
import { useToast } from "@/contexts/ToastContext";
import { useLabels } from "@/hooks/useLabels";
import { characterKeys, projectFilesKeys } from "@/lib/query-keys";
import { CharacterImportWizard } from "@/components/CharacterImportWizard.lazy";
import { charactersApi } from "@/lib/api/characters";
import { GitLabSyncDialogProgress } from "./GitLabSyncDialogProgress";
import { GitLabSyncSyncForm } from "./GitLabSyncSyncForm";
import { GitLabSyncDialogHeader } from "./GitLabSyncDialogHeader";
import { GitLabSyncDialogFooter } from "./GitLabSyncDialogFooter";
import {
  syncFormReducer,
  createInitialSyncFormState,
  type SyncOperationType,
} from "./GitLabSyncDialogReducer";

// Types
// ============================================================================

export type { SyncOperationType };
interface GitLabSyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operationType: SyncOperationType;
  projectId: string;
  projectName?: string;
  defaultBranch?: string;
}
// ============================================================================
// Component
// ============================================================================

export function GitLabSyncDialog({
  open,
  onOpenChange,
  operationType,
  projectId,
  defaultBranch = "main",
}: GitLabSyncDialogProps) {
  const queryClient = useQueryClient();
  const { state, exportToGitlab, importFromGitlab, reset } = useGitLabSync();
  const { success, error } = useToast();
  const { invalidateLabels, labels, isLoadingLabels } = useLabels();

  // Check if this is a first sync (no local labels)
  const isFirstSync = !isLoadingLabels && labels.length === 0;

  // Form state — derive branch from prop, track user overrides separately
  const [formState, dispatch] = useReducer(
    syncFormReducer,
    operationType,
    createInitialSyncFormState
  );
  const branch = formState.userBranch ?? defaultBranch;

  // Ref to track the timeout so we can clear it on unmount
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );

  const clearAutoCloseTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
  }, []);

  // Clear timeout on unmount to prevent running callbacks after unmount
  useEffect(() => {
    return () => {
      clearAutoCloseTimeout();
    };
  }, [clearAutoCloseTimeout]);

  /** Handle sync operation */
  const handleSync = useCallback(async () => {
    if (!branch.trim()) {
      error("Branch name is required");
      return;
    }

    // For first sync, use gitlab_wins as the conflict resolution
    // (there's no local data to preserve anyway)
    const resolution = isFirstSync
      ? "gitlab_wins"
      : formState.conflictResolution;

    // Capture the operation result directly rather than relying on state.operation
    // which may be stale due to React's asynchronous state updates
    const result =
      operationType === "export"
        ? await exportToGitlab(
            projectId,
            branch.trim(),
            formState.commitMessage.trim() || undefined
          )
        : await importFromGitlab(projectId, branch.trim(), resolution);

    // Use the returned result for toast notifications
    if (result?.status === "COMPLETED") {
      success(
        `${
          operationType === "export" ? "Export" : "Import"
        } completed successfully`
      );

      await invalidateLabels();

      // For import operations, also refresh project files list
      // to ensure Script Mode shows imported files immediately
      if (operationType === "import") {
        void queryClient.refetchQueries({
          queryKey: projectFilesKeys.lists(projectId),
        });
      }

      // For import operations, show the character wizard if any
      // characters were detected.
      if (operationType === "import") {
        try {
          const detectionResult =
            await charactersApi.detectCharacters(projectId);

          if (detectionResult.characters.length > 0) {
            dispatch({
              type: "SET_CHARACTER_WIZARD",
              show: true,
              characters: detectionResult,
            });
            return;
          }
        } catch (err) {
          console.error("Failed to detect characters:", err);
        }
      }

      // Close dialog after successful sync (if not showing character wizard)
      clearAutoCloseTimeout();
      timeoutRef.current = setTimeout(() => {
        reset();
        onOpenChange(false);
      }, 1000);
    } else if (result?.status === "FAILED") {
      error(result.errorMessage || "Operation failed");
    } else {
      console.warn("Unexpected sync result:", result);
      error("Failed to complete sync operation");
    }
  }, [
    branch,
    formState.commitMessage,
    formState.conflictResolution,
    operationType,
    projectId,
    exportToGitlab,
    importFromGitlab,
    reset,
    onOpenChange,
    success,
    error,
    invalidateLabels,
    isFirstSync,
    queryClient,
    clearAutoCloseTimeout,
  ]);

  /**
   * Reset and close
   */
  const handleClose = useCallback(() => {
    clearAutoCloseTimeout();
    dispatch({
      type: "SET_CHARACTER_WIZARD",
      show: false,
      characters: null,
    });
    reset();
    onOpenChange(false);
  }, [clearAutoCloseTimeout, reset, onOpenChange]);

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        onOpenChange(true);
        return;
      }

      if (state.isProcessing) {
        return;
      }

      handleClose();
    },
    [handleClose, onOpenChange, state.isProcessing]
  );

  const SyncIcon = operationType === "export" ? Upload : Download;

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <Dialog
      open={open}
      onOpenChange={handleDialogOpenChange}
      aria-label={
        operationType === "export" ? "Export to GitLab" : "Import from GitLab"
      }
    >
      <DialogContent className="max-w-md w-full p-0 gap-0">
        <GitLabSyncDialogHeader
          operationType={operationType}
          isProcessing={state.isProcessing}
          syncIcon={SyncIcon}
          onClose={handleClose}
        />

        {/* Content */}
        <div className="p-6 max-sm:p-4 space-y-4">
          {state.isProcessing || state.operation ? (
            <GitLabSyncDialogProgress
              operation={state.operation}
              isProcessing={state.isProcessing}
              progress={state.progress}
              error={state.error}
              operationType={operationType}
            />
          ) : (
            <GitLabSyncSyncForm
              branch={branch}
              commitMessage={formState.commitMessage}
              conflictResolution={formState.conflictResolution}
              operationType={operationType}
              isFirstSync={isFirstSync}
              isProcessing={state.isProcessing}
              error={state.error}
              onBranchChange={(value) =>
                dispatch({ type: "SET_USER_BRANCH", value })
              }
              onCommitMessageChange={(value) =>
                dispatch({ type: "SET_COMMIT_MESSAGE", value })
              }
              onConflictResolutionChange={(value) =>
                dispatch({ type: "SET_CONFLICT_RESOLUTION", value })
              }
              defaultBranch={defaultBranch}
            />
          )}
        </div>

        <GitLabSyncDialogFooter
          isProcessing={state.isProcessing}
          hasOperation={!!state.operation}
          operationStatus={state.operation?.status}
          branch={branch}
          operationType={operationType}
          onSync={handleSync}
          onClose={handleClose}
        />
      </DialogContent>

      {/* Character Import Wizard */}
      {formState.detectedCharacters && (
        <CharacterImportWizard
          open={formState.showCharacterWizard}
          onOpenChange={(open) => {
            if (!open) {
              handleClose();
            }
          }}
          projectId={projectId}
          detectedCharacters={formState.detectedCharacters.characters}
          conflicts={formState.detectedCharacters.conflicts}
          excludedTags={formState.detectedCharacters.excludedTags}
          narratorTags={formState.detectedCharacters.narratorCharacterTags}
          existingTags={formState.detectedCharacters.existingTags}
          onComplete={() => {
            void invalidateLabels();
            void queryClient.invalidateQueries({
              queryKey: characterKeys.lists(projectId),
              refetchType: "all",
            });
          }}
        />
      )}
    </Dialog>
  );
}
