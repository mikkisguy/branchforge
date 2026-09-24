/**
 * GitLab Sync Dialog
 *
 * Dialog for GitLab export/import operations.
 * Shows progress and allows configuration of branch and commit message.
 */

import { useReducer, useCallback, useRef, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FilePenLine, Upload } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useGitLabSync } from "@/hooks/useGitLabSync";
import { useToast } from "@/contexts/ToastContext";
import { useLabels } from "@/hooks/useLabels";
import { useGitLabPendingChanges } from "@/hooks/useGitLabPendingChanges";
import { gitlabApi } from "@/lib/api/gitlab";
import { characterKeys, gitlabKeys, projectFilesKeys } from "@/lib/query-keys";
import { formatGitLabSyncError } from "@/lib/format-gitlab-sync-error";
import { CharacterImportWizard } from "@/components/CharacterImportWizard/CharacterImportWizard.lazy";
import { charactersApi } from "@/lib/api/characters";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { GitLabSyncDialogProgress } from "./GitLabSyncDialogProgress";
import { GitLabSyncSyncForm } from "./GitLabSyncSyncForm";
import { GitLabSyncDialogHeader } from "./GitLabSyncDialogHeader";
import { GitLabSyncDialogFooter } from "./GitLabSyncDialogFooter";
import {
  syncFormReducer,
  createInitialSyncFormState,
  type SyncOperationType,
} from "./GitLabSyncDialogReducer";
import {
  branchAfterCreateNewToggle,
  resolveSyncBranchFields,
} from "./git-branch-name";

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
  const exportDialogOpen = isExportDialogOpen(open, operationType);
  const pendingChanges = useGitLabPendingChanges(projectId, {
    enabled: exportDialogOpen,
  });
  const branchesQuery = useQuery({
    queryKey: gitlabKeys.branches(projectId),
    queryFn: () => gitlabApi.getBranches(projectId),
    enabled: exportDialogOpen,
  });
  const [discardConfirmationOpen, setDiscardConfirmationOpen] = useState(false);

  // Check if this is a first sync (no local labels)
  const isFirstSync = isFirstLabelSync(isLoadingLabels, labels.length);

  // Form state — derive branch from prop, track user overrides separately
  const [formState, dispatch] = useReducer(
    syncFormReducer,
    operationType,
    createInitialSyncFormState
  );
  const { branch, branchNameError, branchAlreadyExists } =
    resolveSyncBranchFields({
      operationType,
      createNewBranch: formState.createNewBranch,
      userBranch: formState.userBranch,
      defaultBranch,
      knownBranches: branchesQuery.data,
    });

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
      pendingChanges.refetch();

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
      error(
        formatGitLabSyncError(
          result.errorMessage || "Operation failed",
          operationType
        )
      );
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
    pendingChanges,
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
    dispatch({ type: "SET_CREATE_NEW_BRANCH", value: false });
    if (formState.userBranch === "") {
      dispatch({ type: "SET_USER_BRANCH", value: null });
    }
    reset();
    onOpenChange(false);
  }, [clearAutoCloseTimeout, formState.userBranch, reset, onOpenChange]);

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

  const { label: dialogLabel, Icon: SyncIcon } =
    syncOperationPresentation(operationType);

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <Dialog
      open={open}
      onOpenChange={handleDialogOpenChange}
      aria-label={dialogLabel}
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
            <>
              {operationType === "export" && (
                <PendingFileChangesSection
                  changes={pendingChanges.changes}
                  contentChanges={pendingChanges.contentChanges}
                  contentChangedCount={pendingChanges.contentChangedCount}
                  isLoading={pendingChanges.isLoading}
                  error={pendingChanges.error}
                  isReversing={pendingChanges.isReversing}
                  onRetry={() => void pendingChanges.refetch()}
                  onReverse={(change) => {
                    const action =
                      change.kind === "CREATED"
                        ? pendingChanges.cancelCreation
                        : change.kind === "RENAMED"
                          ? pendingChanges.undoRename
                          : pendingChanges.restoreFile;
                    void action(change.fileId).catch((reason: unknown) => {
                      error(
                        reason instanceof Error
                          ? reason.message
                          : "Could not reverse the file change"
                      );
                    });
                  }}
                  onDiscardAll={() => setDiscardConfirmationOpen(true)}
                />
              )}
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
                createNewBranch={formState.createNewBranch}
                onCreateNewBranchChange={(value) => {
                  dispatch({ type: "SET_CREATE_NEW_BRANCH", value });
                  dispatch({
                    type: "SET_USER_BRANCH",
                    value: branchAfterCreateNewToggle(
                      value,
                      formState.userBranch,
                      defaultBranch
                    ),
                  });
                }}
                branchNameError={branchNameError}
                branchAlreadyExists={branchAlreadyExists}
              />
            </>
          )}
        </div>

        <GitLabSyncDialogFooter
          isProcessing={state.isProcessing}
          hasOperation={!!state.operation}
          operationStatus={state.operation?.status}
          branch={branch}
          branchInvalid={branchNameError !== null}
          operationType={operationType}
          onSync={handleSync}
          onClose={handleClose}
        />
      </DialogContent>

      <ConfirmDialog
        open={discardConfirmationOpen}
        onOpenChange={setDiscardConfirmationOpen}
        title="Discard pending file changes?"
        description="This restores the project file structure to the last GitLab sync point."
        confirmLabel="Discard all"
        isLoading={pendingChanges.isDiscarding}
        onConfirm={async () => {
          await pendingChanges.discardAll();
          setDiscardConfirmationOpen(false);
        }}
        onError={(reason) =>
          error(
            reason instanceof Error
              ? reason.message
              : "Could not discard changes"
          )
        }
      />

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

function isExportDialogOpen(
  open: boolean,
  operationType: SyncOperationType
): boolean {
  return open && operationType === "export";
}

function isFirstLabelSync(
  isLoadingLabels: boolean,
  labelCount: number
): boolean {
  return !isLoadingLabels && labelCount === 0;
}

function syncOperationPresentation(operationType: SyncOperationType): {
  label: string;
  Icon: typeof Upload;
} {
  if (operationType === "export") {
    return { label: "Export to GitLab", Icon: Upload };
  }
  return { label: "Import from GitLab", Icon: Download };
}

function PendingFileChangesSection({
  changes,
  contentChanges,
  contentChangedCount,
  isLoading,
  error,
  isReversing,
  onRetry,
  onReverse,
  onDiscardAll,
}: {
  changes: import("@/lib/api/gitlab").PendingFileChange[];
  contentChanges: Array<{ fileId: string; filePath: string }>;
  contentChangedCount: number;
  isLoading: boolean;
  error: Error | null;
  isReversing: boolean;
  onRetry: () => void;
  onReverse: (change: import("@/lib/api/gitlab").PendingFileChange) => void;
  onDiscardAll: () => void;
}) {
  if (isLoading)
    return (
      <p className="text-sm text-muted-foreground">
        Loading pending file changes…
      </p>
    );
  if (error)
    return (
      <div className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
        Could not load pending file changes.{" "}
        <Button variant="link" className="h-auto p-0" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  if (changes.length === 0 && contentChanges.length === 0) return null;

  return (
    <section
      className="space-y-2 rounded-md border border-border/60 p-3"
      aria-label="Pending file changes"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">Pending file changes</h3>
        {changes.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDiscardAll}
          >
            Discard all
          </Button>
        )}
      </div>
      {changes.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            File structure
          </p>
          <ul className="space-y-1.5 text-sm">
            {changes.map((change) => {
              const actionLabel =
                change.kind === "CREATED"
                  ? "Cancel creation"
                  : change.kind === "RENAMED"
                    ? "Undo rename"
                    : "Restore file";
              const description =
                change.kind === "CREATED"
                  ? `Created: ${change.filePath}`
                  : change.kind === "RENAMED"
                    ? `${change.previousFilePath} → ${change.filePath}`
                    : `Deleted: ${change.filePath}`;
              return (
                <li
                  key={change.fileId}
                  className="flex items-start justify-between gap-3 rounded-md bg-muted/40 px-2.5 py-2"
                >
                  <span className="min-w-0 flex-1 break-all leading-5">
                    {description}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isReversing}
                    onClick={() => onReverse(change)}
                  >
                    {actionLabel}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {contentChangedCount > 0 && (
        <div
          className={
            changes.length > 0
              ? "space-y-1.5 border-t border-border/60 pt-2.5"
              : "space-y-1.5"
          }
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-muted-foreground">
              Content updates
            </p>
            <Badge variant="secondary" className="shrink-0 text-[11px]">
              {contentChangedCount}
            </Badge>
          </div>
          <ul
            className="space-y-1.5 text-sm"
            aria-label="Files with content changes"
          >
            {contentChanges.map((change) => (
              <li
                key={change.fileId}
                className="flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-2 text-muted-foreground"
              >
                <FilePenLine className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 break-all leading-5">
                  {change.filePath}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
