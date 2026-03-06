/**
 * GitLab Sync Dialog
 *
 * Dialog for GitLab export/import operations.
 * Shows progress and allows configuration of branch and commit message.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { X, Download, Upload, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { type ConflictResolution } from "@/lib/api/gitlab";
import { useGitLabSync } from "@/hooks/useGitLabSync";
import { useToast } from "@/contexts/ToastContext";
import { useScenes } from "@/hooks/useScenes";

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
// Component
// ============================================================================

export function GitLabSyncDialog({
  open,
  onOpenChange,
  operationType,
  projectId,
  defaultBranch = "main",
}: GitLabSyncDialogProps) {
  const { state, exportToGitlab, importFromGitlab, reset } = useGitLabSync();
  const { success, error } = useToast();
  const { invalidateScenes, scenes, isLoadingScenes } = useScenes();

  // Check if this is a first sync (no local scenes)
  const isFirstSync = !isLoadingScenes && scenes.length === 0;

  // Form state
  const [branch, setBranch] = useState(defaultBranch);
  const [commitMessage, setCommitMessage] = useState(
    `Sync ${operationType} from BranchForge`,
  );
  const [conflictResolution, setConflictResolution] =
    useState<ConflictResolution>("branchforge_wins");

  // Ref to track the timeout so we can clear it on unmount
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Clear timeout on unmount to prevent running callbacks after unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

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
    const resolution = isFirstSync ? "gitlab_wins" : conflictResolution;

    // Capture the operation result directly rather than relying on state.operation
    // which may be stale due to React's asynchronous state updates
    const result =
      operationType === "export"
        ? await exportToGitlab(
            projectId,
            branch.trim(),
            commitMessage.trim() || undefined,
          )
        : await importFromGitlab(projectId, branch.trim(), resolution);

    // Use the returned result for toast notifications
    if (result?.status === "completed") {
      success(
        `${operationType === "export" ? "Export" : "Import"} completed successfully`,
      );

      // Refresh scene list after successful sync
      await invalidateScenes();

      // Clear any existing timeout before scheduling a new one
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        reset();
        onOpenChange(false);
      }, 1000);
    } else if (result?.status === "failed") {
      error(result.errorMessage || "Operation failed");
    }
  }, [
    branch,
    commitMessage,
    conflictResolution,
    operationType,
    projectId,
    exportToGitlab,
    importFromGitlab,
    reset,
    onOpenChange,
    success,
    error,
    invalidateScenes,
    isFirstSync,
  ]);

  /**
   * Reset and close
   */
  const handleClose = useCallback(() => {
    reset();
    onOpenChange(false);
  }, [reset, onOpenChange]);

  /**
   * Get sync icon
   */
  const SyncIcon = operationType === "export" ? Upload : Download;

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-full p-0 gap-0">
        {/* Header */}
        <div className="p-6 border-b border-border/30 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-muted rounded-md">
              <SyncIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-medium">
                {operationType === "export"
                  ? "Export to GitLab"
                  : "Import from GitLab"}
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {operationType === "export"
                  ? "Push your BranchForge scenes to GitLab"
                  : "Pull changes from GitLab to BranchForge"}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            disabled={state.isProcessing}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Progress / Status */}
          {state.isProcessing || state.operation ? (
            <div className="space-y-3">
              {/* Progress Bar */}
              {state.isProcessing && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {operationType === "export" ? "Exporting" : "Importing"}
                      ...
                    </span>
                    <span className="font-medium">{state.progress}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${state.progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Status Message */}
              {state.operation && (
                <div
                  className={
                    state.operation.status === "completed"
                      ? "text-green-600"
                      : "text-amber-600"
                  }
                >
                  {state.operation.status === "completed" && (
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {operationType === "export" ? "Export" : "Import"}{" "}
                        completed
                      </span>
                    </div>
                  )}
                  {state.operation.status === "failed" && (
                    <div className="flex items-center gap-2 text-sm">
                      <AlertCircle className="w-4 h-4" />
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
                  onChange={(e) => setBranch(e.target.value)}
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
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
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
                            onClick={() => setConflictResolution(cr.value)}
                            className={`w-full p-3 text-left rounded-md border transition-colors ${
                              conflictResolution === cr.value
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
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleSync} disabled={!branch.trim()}>
                {operationType === "export" ? "Export" : "Import"}
              </Button>
            </>
          )}
          {(state.isProcessing || state.operation) &&
            state.operation?.status !== "completed" && (
              <Button onClick={handleClose} variant="outline">
                Close
              </Button>
            )}
          {state.operation?.status === "completed" && (
            <Button onClick={handleClose}>Done</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

