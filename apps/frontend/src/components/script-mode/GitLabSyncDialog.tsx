/**
 * GitLab Sync Dialog
 *
 * Dialog for GitLab export/import operations.
 * Shows progress and allows configuration of branch and commit message.
 */

import { useReducer, useCallback, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X, Download, Upload, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { type ConflictResolution } from "@/lib/api/gitlab";
import { useGitLabSync } from "@/hooks/useGitLabSync";
import { useToast } from "@/contexts/ToastContext";
import { useLabels } from "@/hooks/useLabels";
import { characterKeys, projectFilesKeys } from "@/lib/query-keys";
import { CharacterImportWizard } from "@/components/CharacterImportWizard.lazy";
import {
  charactersApi,
  type DetectCharactersResponse,
} from "@/lib/api/characters";

// ============================================================================
// Types
// ============================================================================

export type SyncOperationType = "export" | "import";

interface GitLabSyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operationType: SyncOperationType;
  projectId: string;
  projectName?: string;
  defaultBranch?: string;
}

const CONFLICT_RESOLUTIONS: Array<{
  value: ConflictResolution;
  label: string;
  description: string;
}> = [
  {
    value: "branchforge_wins",
    label: "BranchForge Wins",
    description: "Overwrite GitLab changes with local data",
  },
  {
    value: "gitlab_wins",
    label: "GitLab Wins",
    description: "Overwrite local data with GitLab changes",
  },
  {
    value: "manual_review",
    label: "Manual Review",
    description: "Review conflicts before applying changes",
  },
];

// ============================================================================
// Types and Reducer
// ============================================================================

interface SyncFormState {
  userBranch: string | null;
  commitMessage: string;
  conflictResolution: ConflictResolution;
  showCharacterWizard: boolean;
  detectedCharacters: DetectCharactersResponse | null;
}

type SyncFormAction =
  | { type: "SET_USER_BRANCH"; value: string | null }
  | { type: "SET_COMMIT_MESSAGE"; value: string }
  | { type: "SET_CONFLICT_RESOLUTION"; value: ConflictResolution }
  | {
      type: "SET_CHARACTER_WIZARD";
      show: boolean;
      characters: DetectCharactersResponse | null;
    };

function createInitialSyncFormState(
  operationType: SyncOperationType
): SyncFormState {
  return {
    userBranch: null,
    commitMessage: `Sync ${operationType} from BranchForge`,
    conflictResolution: "branchforge_wins",
    showCharacterWizard: false,
    detectedCharacters: null,
  };
}

function syncFormReducer(
  state: SyncFormState,
  action: SyncFormAction
): SyncFormState {
  switch (action.type) {
    case "SET_USER_BRANCH":
      return { ...state, userBranch: action.value };
    case "SET_COMMIT_MESSAGE":
      return { ...state, commitMessage: action.value };
    case "SET_CONFLICT_RESOLUTION":
      return { ...state, conflictResolution: action.value };
    case "SET_CHARACTER_WIZARD":
      return {
        ...state,
        showCharacterWizard: action.show,
        detectedCharacters: action.characters,
      };
    default:
      return state;
  }
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

  /**
   * Handle sync operation
   */
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

      // Refresh scene list after successful sync
      await invalidateLabels();

      // For import operations, also refresh project files list
      // This ensures Script Mode shows imported files immediately
      if (operationType === "import") {
        void queryClient.refetchQueries({
          queryKey: projectFilesKeys.lists(projectId),
        });
      }

      // For import operations, show the character wizard if any
      // characters were detected. Issue #244 (PR #245) promotes
      // extracted characters into the `characters` table during
      // import, so on a fresh import `existingTags` is no longer
      // empty. Filtering to "new only" would suppress the wizard
      // entirely. The wizard's import endpoint is idempotent
      // (upsert), so re-confirming already-stored characters is a
      // safe no-op for unchanged rows.
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
      // Clear any existing timeout before scheduling a new one
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

  /**
   * Get sync icon
   */
  const SyncIcon = operationType === "export" ? Upload : Download;

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-md w-full p-0 gap-0">
        {/* Header */}
        <div className="p-6 border-b border-border/30 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-muted rounded-md">
              <SyncIcon className="size-5" />
            </div>
            <div>
              <h2 className="text-lg font-medium">
                {operationType === "export"
                  ? "Export to GitLab"
                  : "Import from GitLab"}
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {operationType === "export"
                  ? "Push your BranchForge labels to GitLab"
                  : "Pull changes from GitLab to BranchForge"}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            disabled={state.isProcessing}
            type="button"
            aria-label="Close sync dialog"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Progress / Status */}
          {state.isProcessing || state.operation ? (
            <div className="space-y-3">
              {/* Status Message */}
              {state.operation && (
                <div
                  className={
                    state.operation.status === "COMPLETED"
                      ? "text-green-600"
                      : state.operation.status === "FAILED"
                        ? "text-red-600"
                        : "text-amber-600"
                  }
                >
                  {state.operation.status === "COMPLETED" && (
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="size-4" />
                      <span>
                        {operationType === "export" ? "Export" : "Import"}{" "}
                        completed
                      </span>
                    </div>
                  )}
                  {state.operation.status === "FAILED" && (
                    <div className="flex items-center gap-2 text-sm">
                      <AlertCircle className="size-4" />
                      <span>{state.error || "Operation failed"}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Conflict Warning */}
              {state.operation?.conflictCount &&
                state.operation.conflictCount > 0 && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 rounded-md text-sm">
                    {state.operation.conflictCount} conflict(s) detected. Manual
                    review may be required.
                  </div>
                )}

              {/* Progress Bar - only show during processing */}
              {state.isProcessing && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {operationType === "export" ? "Exporting" : "Importing"}
                      ...
                    </span>
                    <span className="font-medium">{state.progress}%</span>
                  </div>
                  <progress
                    className="h-2 w-full rounded-full bg-muted [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-value]:bg-primary [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:transition-all [&::-webkit-progress-value]:duration-300 [&::-moz-progress-bar]:bg-primary [&::-moz-progress-bar]:rounded-full"
                    value={state.progress}
                    max={100}
                    aria-label="GitLab sync progress"
                  />
                </div>
              )}
            </div>
          ) : (
            // Form
            <>
              {/* Branch Selection */}
              <div className="space-y-2">
                <Label htmlFor="sync-branch">Branch</Label>
                <Input
                  id="sync-branch"
                  type="text"
                  placeholder={defaultBranch}
                  value={branch}
                  onChange={(e) =>
                    dispatch({ type: "SET_USER_BRANCH", value: e.target.value })
                  }
                  disabled={state.isProcessing}
                />
                <p className="text-xs text-muted-foreground">
                  The GitLab branch to{" "}
                  {operationType === "export" ? "push to" : "pull from"}.
                </p>
              </div>

              {/* Commit Message (export only) */}
              {operationType === "export" && (
                <div className="space-y-2">
                  <Label htmlFor="commit-message">Commit Message</Label>
                  <Input
                    id="commit-message"
                    type="text"
                    placeholder="Update scenes from BranchForge"
                    value={formState.commitMessage}
                    onChange={(e) =>
                      dispatch({
                        type: "SET_COMMIT_MESSAGE",
                        value: e.target.value,
                      })
                    }
                    disabled={state.isProcessing}
                  />
                </div>
              )}

              {/* Conflict Resolution (import only) */}
              {operationType === "import" && (
                <div className="space-y-2">
                  {isFirstSync ? (
                    // First sync - simple message
                    <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md">
                      <p className="text-sm text-blue-800 dark:text-blue-200">
                        This will import all scenes from GitLab.
                      </p>
                    </div>
                  ) : (
                    // Existing data - show conflict resolution options
                    <>
                      <Label>Conflict Resolution</Label>
                      <div className="space-y-2">
                        {CONFLICT_RESOLUTIONS.map((cr) => (
                          <button
                            key={cr.value}
                            type="button"
                            onClick={() =>
                              dispatch({
                                type: "SET_CONFLICT_RESOLUTION",
                                value: cr.value,
                              })
                            }
                            className={`w-full p-3 text-left rounded-md border transition-colors ${
                              formState.conflictResolution === cr.value
                                ? "border-primary bg-primary/10"
                                : "border-border/30 hover:bg-muted/50"
                            }`}
                            disabled={state.isProcessing}
                          >
                            <p className="text-sm font-medium">{cr.label}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {cr.description}
                            </p>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Error Display */}
              {state.error && (
                <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 rounded-md text-sm">
                  {state.error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border/30 flex justify-end gap-2">
          {!state.isProcessing && !state.operation && (
            <>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSync}
                disabled={!branch.trim()}
              >
                {operationType === "export" ? "Export" : "Import"}
              </Button>
            </>
          )}
          {(state.isProcessing || state.operation) &&
            state.operation?.status !== "COMPLETED" && (
              <Button
                type="button"
                onClick={handleClose}
                variant="outline"
                disabled={state.isProcessing}
              >
                Close
              </Button>
            )}
          {state.operation?.status === "COMPLETED" && (
            <Button type="button" onClick={handleClose}>
              Close
            </Button>
          )}
        </div>
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
          existingTags={formState.detectedCharacters.existingTags}
          onComplete={() => {
            // Refresh labels and characters after character import/linking
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
