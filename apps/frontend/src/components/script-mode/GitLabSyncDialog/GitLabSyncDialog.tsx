/**
 * GitLab Sync Dialog
 *
 * Dialog for GitLab export/import operations.
 * Shows progress and allows configuration of branch and commit message.
 */

import { useReducer, useCallback, useRef, useEffect, useState } from "react";
import { GITLAB_EXPORT_RECOVERY_REQUIRED } from "@branchforge/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, RotateCcw, Upload } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useGitLabExportReview } from "@/hooks/useGitLabExportReview";
import { useGitLabSync } from "@/hooks/useGitLabSync";
import { useToast } from "@/contexts/ToastContext";
import { useLabels } from "@/hooks/useLabels";
import { useGitLabPendingChanges } from "@/hooks/useGitLabPendingChanges";
import { gitlabApi } from "@/lib/api/gitlab";
import { characterKeys, gitlabKeys, projectFilesKeys } from "@/lib/query-keys";
import { formatGitLabSyncError } from "@/lib/format-gitlab-sync-error";
import { CharacterImportWizard } from "@/components/CharacterImportWizard/CharacterImportWizard.lazy";
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
import { canExportToBranch, resolveSyncBranchFields } from "./git-branch-name";

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
    enabled: open,
  });
  const structuralChanges = pendingChanges.changes.filter(
    (change) => change.kind !== "MODIFIED"
  );
  const importBlocked =
    operationType === "import" && structuralChanges.length > 0;
  const branchesQuery = useQuery({
    queryKey: gitlabKeys.branches(projectId),
    queryFn: () => gitlabApi.getBranches(projectId),
    enabled: exportDialogOpen,
    staleTime: 0,
    refetchOnMount: "always",
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
  const linkedTargetRef = useRef({ projectId, defaultBranch });
  useEffect(() => {
    const previousTarget = linkedTargetRef.current;
    if (
      previousTarget.projectId !== projectId ||
      previousTarget.defaultBranch !== defaultBranch
    ) {
      linkedTargetRef.current = { projectId, defaultBranch };
      dispatch({ type: "RESET_BRANCH_SELECTION" });
    }
  }, [projectId, defaultBranch]);
  const knownBranches = branchesQuery.isSuccess
    ? branchesQuery.data
    : undefined;
  const { branch, branchNameError, branchAlreadyExists } =
    resolveSyncBranchFields({
      operationType,
      createNewBranch: formState.createNewBranch,
      userBranch: formState.userBranch,
      defaultBranch,
      knownBranches,
    });
  const exportBranchInvalid = !canExportToBranch({
    branch,
    createNewBranch: formState.createNewBranch,
    branchNameError,
    branchAlreadyExists,
    knownBranches,
  });

  const review = useGitLabExportReview(
    projectId,
    branch.trim(),
    exportDialogOpen &&
      !exportBranchInvalid &&
      !state.isProcessing &&
      !state.operation
  );
  const [reviewNotice, setReviewNotice] = useState<string | null>(null);
  const recovery = useMutation({
    mutationFn: () => gitlabApi.recoverGitlabExport(projectId),
    onSuccess: ({ recovered }) => {
      setReviewNotice(
        recovered
          ? "Previous export recovered. Review the current changes before confirming."
          : "No previous export needs recovery. Review the current changes before confirming."
      );
      void review.refetch();
    },
  });
  const branchModeMismatch =
    review.isSuccess && review.data.branchExisted === formState.createNewBranch;
  const selectedBranchMissing =
    !formState.createNewBranch &&
    !!branch &&
    knownBranches !== undefined &&
    !knownBranches.includes(branch);
  const branchProblem = branchModeMismatch || selectedBranchMissing;
  const reviewBusy = review.isFetching || branchesQuery.isFetching;
  const reviewReady =
    exportDialogOpen &&
    !exportBranchInvalid &&
    !branchProblem &&
    !reviewBusy &&
    review.isSuccess &&
    review.data.targetBranch === branch.trim() &&
    review.data.actions.length > 0 &&
    !recovery.isPending &&
    !pendingChanges.isReversing &&
    !pendingChanges.isDiscarding;

  // Preselect the linked default branch in export existing-branch mode when
  // it is present in the freshly fetched list and the user has not made a
  // selection yet.
  useEffect(() => {
    if (
      operationType !== "export" ||
      !exportDialogOpen ||
      branchesQuery.isFetching ||
      formState.createNewBranch ||
      formState.userBranch !== null
    ) {
      return;
    }
    if (knownBranches?.includes(defaultBranch)) {
      dispatch({ type: "SET_USER_BRANCH", value: defaultBranch });
    }
  }, [
    operationType,
    exportDialogOpen,
    branchesQuery.isFetching,
    formState.createNewBranch,
    formState.userBranch,
    knownBranches,
    defaultBranch,
  ]);

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
    if (
      importBlocked ||
      (operationType === "import" && pendingChanges.isLoading)
    )
      return;
    if (operationType === "export" && (!reviewReady || !review.data)) return;
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
            formState.commitMessage.trim() || undefined,
            review.data!.reviewToken
          )
        : await importFromGitlab(projectId, branch.trim(), resolution);

    // The sync hook already exposes request errors in the dialog.
    // Refresh the list for a server-side conflict that raced our preflight.
    if (!result) {
      if (operationType === "import") void pendingChanges.refetch();
      else {
        setReviewNotice(
          "The push was not confirmed. Refresh the review and confirm again."
        );
        await queryClient.resetQueries({
          queryKey: gitlabKeys.exportReview(projectId, branch.trim()),
          exact: true,
        });
      }
      return;
    }

    // Use the returned result for toast notifications
    if (result?.status === "COMPLETED") {
      const noChanges = operationType === "export" && result.noChanges === true;

      await invalidateLabels();
      pendingChanges.refetch();

      // Export may have created a new branch; invalidate the cached list so
      // the next dialog open reflects the new branch.
      if (operationType === "export") {
        void queryClient.invalidateQueries({
          queryKey: gitlabKeys.branches(projectId),
        });
      }

      // For import operations, also refresh project files list
      // to ensure Script Mode shows imported files immediately
      if (operationType === "import") {
        void queryClient.refetchQueries({
          queryKey: projectFilesKeys.lists(projectId),
        });
      }

      if (noChanges) {
        // Keep the dialog open and show an explicit no-changes notice. The
        // progress view is already rendered by the sync hook state.
        return;
      }

      success(
        `${
          operationType === "export" ? "Export" : "Import"
        } completed successfully`
      );

      // Review only definitions accepted by this pull, against its pre-pull state.
      const characterReview = result.characterReview;
      if (operationType === "import" && characterReview) {
        const existingTags = new Set(characterReview.existingTags);
        const needsReview =
          characterReview.conflicts.length > 0 ||
          characterReview.characters.some((c) => !existingTags.has(c.tag));
        if (needsReview) {
          dispatch({
            type: "SET_CHARACTER_WIZARD",
            show: true,
            characters: characterReview,
          });
          return;
        }
      }

      // Close dialog after successful sync (if not showing character wizard)
      clearAutoCloseTimeout();
      timeoutRef.current = setTimeout(() => {
        dispatch({ type: "RESET_BRANCH_MODE" });
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
    importBlocked,
    branch,
    reviewReady,
    review.data,
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
    setReviewNotice,
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
    dispatch({ type: "RESET_BRANCH_MODE" });
    reset();
    setReviewNotice(null);
    onOpenChange(false);
  }, [clearAutoCloseTimeout, reset, onOpenChange, setReviewNotice]);

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
      <DialogContent className="max-w-md w-full p-0 max-sm:p-0 gap-0 flex flex-col max-h-[85vh] overflow-hidden">
        <GitLabSyncDialogHeader
          operationType={operationType}
          isProcessing={state.isProcessing}
          syncIcon={SyncIcon}
          onClose={handleClose}
        />

        {/* Content */}
        <div className="p-6 max-sm:p-4 space-y-4 flex-1 min-h-0 overflow-y-auto">
          {state.isProcessing || state.operation ? (
            <GitLabSyncDialogProgress
              operation={state.operation}
              isProcessing={state.isProcessing}
              progress={state.progress}
              error={state.error}
              operationType={operationType}
              createNewBranch={formState.createNewBranch}
            />
          ) : (
            <>
              {operationType === "import" && (
                <>
                  {pendingChanges.isLoading && (
                    <p role="status" className="text-sm text-muted-foreground">
                      Checking pending file changes…
                    </p>
                  )}
                  {pendingChanges.error && (
                    <div role="alert" className="text-sm">
                      Could not check pending file changes.{" "}
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0"
                        onClick={() => void pendingChanges.refetch()}
                      >
                        Retry
                      </Button>
                    </div>
                  )}
                  {importBlocked && (
                    <section
                      aria-label="File changes blocking pull"
                      className="rounded-md border border-border/50 bg-muted/30 p-3 space-y-2"
                    >
                      <h3 className="text-sm font-medium">
                        Push or discard file changes before pulling
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        These files were created, renamed, moved, or deleted
                        locally. Open Export to GitLab to push them or discard
                        the changes, then return here to pull.
                      </p>
                      <ul className="text-sm space-y-1">
                        {structuralChanges.map((change) => (
                          <li key={change.fileId} className="break-words">
                            {change.kind === "CREATED"
                              ? `Created: ${change.filePath}`
                              : change.kind === "RENAMED"
                                ? `Renamed: ${change.previousFilePath} → ${change.filePath}`
                                : `Deleted: ${change.filePath}`}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </>
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
                }}
                branchNameError={branchNameError}
                branchAlreadyExists={branchAlreadyExists && !branchModeMismatch}
                branches={branchesQuery.data}
                branchesLoading={branchesQuery.isPending}
                branchesError={
                  branchesQuery.isError ? branchesQuery.error : null
                }
                onBranchesRetry={() => void branchesQuery.refetch()}
              />
              {operationType === "export" &&
                (!exportBranchInvalid || branchProblem) && (
                  <section
                    className="space-y-2 border-t border-border/30 pt-4"
                    aria-labelledby="gitlab-export-review-title"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3
                        id="gitlab-export-review-title"
                        className="text-sm font-medium"
                      >
                        Changes to push
                      </h3>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-disabled={reviewBusy}
                        className="aria-disabled:opacity-50"
                        onClick={() => {
                          if (reviewBusy) return;
                          setReviewNotice(null);
                          if (branchProblem) void branchesQuery.refetch();
                          if (!exportBranchInvalid) void review.refetch();
                        }}
                      >
                        Refresh review
                      </Button>
                    </div>
                    {reviewNotice && (
                      <p role="alert" className="text-sm text-muted-foreground">
                        {reviewNotice}
                      </p>
                    )}
                    {branchProblem ? (
                      <p role="alert" className="text-sm text-destructive">
                        {formState.createNewBranch
                          ? "This branch already exists. Choose it from the branch list or enter a different name."
                          : "This branch no longer exists. Choose another branch or create a new one."}
                      </p>
                    ) : review.isFetching || review.isPending ? (
                      <p
                        role="status"
                        className="text-sm text-muted-foreground"
                      >
                        Reviewing changes…
                      </p>
                    ) : review.isError ? (
                      <div className="space-y-2">
                        <p role="alert" className="text-sm text-destructive">
                          {review.error.message}
                        </p>
                        {review.error.message ===
                          GITLAB_EXPORT_RECOVERY_REQUIRED && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={recovery.isPending}
                            onClick={() => recovery.mutate()}
                          >
                            {recovery.isPending
                              ? "Recovering previous export…"
                              : "Recover previous export"}
                          </Button>
                        )}
                        {recovery.isError && (
                          <p role="alert" className="text-sm text-destructive">
                            {recovery.error.message}
                          </p>
                        )}
                      </div>
                    ) : (
                      review.data && (
                        <>
                          {!review.data.branchExisted &&
                            review.data.baseBranch &&
                            review.data.actions.length > 0 && (
                              <p className="text-sm text-muted-foreground break-words">
                                New branch starts from {review.data.baseBranch}.
                              </p>
                            )}
                          {review.data.actions.length === 0 ? (
                            <p
                              role="status"
                              className="text-sm text-muted-foreground"
                            >
                              No changes to push.
                            </p>
                          ) : (
                            <ul
                              className="divide-y divide-border/30 text-sm"
                              aria-label="Files in export"
                            >
                              {review.data.actions.map((action, index) => (
                                <li
                                  key={`${index}:${action.filePath}`}
                                  className="break-words py-2"
                                >
                                  {action.action === "move"
                                    ? `Move: ${action.previousPath} → ${action.filePath}`
                                    : `${action.action[0].toUpperCase()}${action.action.slice(1)}: ${action.filePath}`}
                                </li>
                              ))}
                            </ul>
                          )}
                        </>
                      )
                    )}
                  </section>
                )}
              {operationType === "export" && (
                <UndoFileChanges
                  changes={structuralChanges}
                  error={pendingChanges.error}
                  isPending={
                    pendingChanges.isReversing || pendingChanges.isDiscarding
                  }
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
            </>
          )}
        </div>

        <GitLabSyncDialogFooter
          isProcessing={state.isProcessing}
          hasOperation={!!state.operation}
          operationStatus={state.operation?.status}
          branch={branch}
          branchInvalid={operationType === "export" && exportBranchInvalid}
          syncBlocked={
            operationType === "export"
              ? !reviewReady
              : importBlocked || pendingChanges.isLoading
          }
          createNewBranch={formState.createNewBranch}
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

function UndoFileChanges({
  changes,
  error,
  isPending,
  onRetry,
  onReverse,
  onDiscardAll,
}: {
  changes: import("@/lib/api/gitlab").PendingFileChange[];
  error: Error | null;
  isPending: boolean;
  onRetry: () => void;
  onReverse: (change: import("@/lib/api/gitlab").PendingFileChange) => void;
  onDiscardAll: () => void;
}) {
  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Could not load changes available for undo.{" "}
        <Button
          type="button"
          variant="link"
          className="h-auto p-0"
          onClick={onRetry}
        >
          Retry
        </Button>
      </p>
    );
  }
  if (!changes.length) return null;

  return (
    <details className="border-t border-border/30 pt-3 text-sm">
      <summary className="cursor-pointer rounded-sm py-1 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
        Undo file changes
      </summary>
      <ul className="mt-1 divide-y divide-border/30">
        {changes.map((change) => {
          const actionLabel =
            change.kind === "CREATED"
              ? "Cancel creation"
              : change.kind === "RENAMED"
                ? "Undo rename"
                : "Restore file";
          return (
            <li
              key={change.fileId}
              className="flex flex-wrap items-start justify-between gap-2 py-2"
            >
              <span className="min-w-0 flex-1 break-words leading-5">
                {change.kind === "RENAMED" && `${change.previousFilePath} → `}
                {change.filePath}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => onReverse(change)}
              >
                <RotateCcw aria-hidden="true" />
                {actionLabel}
              </Button>
            </li>
          );
        })}
      </ul>
      <Button
        type="button"
        variant="destructive-ghost"
        size="sm"
        disabled={isPending}
        onClick={onDiscardAll}
      >
        Discard all
      </Button>
    </details>
  );
}
