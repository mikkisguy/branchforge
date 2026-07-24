/**
 * Conflict Review Dialog
 *
 * Dialog for manually resolving conflicts between BranchForge and GitLab versions.
 * Shows side-by-side comparison and allows user to choose which version to keep.
 */

import { useReducer, useCallback, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { gitlabApi, type ConflictDetectionResult } from "@/lib/api/gitlab";
import { useToast } from "@/contexts/ToastContext";
import type { UserRole } from "@branchforge/shared";
import { ConflictReviewDialogDiffViewer } from "./ConflictReviewDialogDiffViewer";
import { ConflictReviewDialogStates } from "./ConflictReviewDialogStates";
import { MOCK_CONFLICTS } from "./ConflictReviewDialog.mock";
import { ConflictReviewDialogFooter } from "./ConflictReviewDialogFooter";
import {
  conflictReducer,
  initialConflictState,
} from "./ConflictReviewDialogReducer";

// ============================================================================
// Types
// ============================================================================

interface ConflictResolution {
  label: string;
  choice: "local" | "remote" | "skip";
}

interface ConflictReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  branch: string;
  userRole?: UserRole;
  onApplyResolutions?: (resolutions: ConflictResolution[]) => void;
}

// ============================================================================
// Component
// ============================================================================

export function ConflictReviewDialog({
  open,
  onOpenChange,
  projectId,
  branch,
  userRole,
  onApplyResolutions,
}: ConflictReviewDialogProps) {
  const { success, error } = useToast();

  // State
  const [state, dispatch] = useReducer(conflictReducer, initialConflictState);

  /**
   * Fetch conflicts when dialog opens
   */
  useEffect(() => {
    if (!open || !projectId || !branch) {
      return;
    }

    const abortController = new AbortController();
    const { signal } = abortController;

    dispatch({ type: "RESET_FOR_NEW_FETCH" });

    gitlabApi
      .detectConflicts(projectId, branch, signal)
      .then((result: ConflictDetectionResult) => {
        if (signal.aborted) return;
        dispatch({ type: "FETCH_SUCCESS", conflicts: result.conflicts });
      })
      .catch((err: Error) => {
        if (signal.aborted) return;
        const message = err.message || "Failed to fetch conflicts";
        dispatch({ type: "FETCH_ERROR", error: message });
        error(message);
      });

    return () => {
      abortController.abort();
    };
  }, [open, projectId, branch, error]);

  const currentConflict = state.conflicts[state.currentIndex];
  const currentResolution = state.resolutions.get(currentConflict?.label || "");

  /**
   * Set resolution for current conflict
   */
  const setResolution = useCallback(
    (choice: "local" | "remote" | "skip") => {
      if (!currentConflict) return;
      dispatch({
        type: "SET_RESOLUTION",
        label: currentConflict.label,
        choice,
      });
    },
    [currentConflict]
  );

  /**
   * Navigate to previous conflict
   */
  const goPrevious = useCallback(() => {
    dispatch({ type: "DECREMENT_INDEX" });
  }, []);

  /**
   * Navigate to next conflict
   */
  const goNext = useCallback(() => {
    dispatch({ type: "INCREMENT_INDEX" });
  }, []);

  /**
   * Apply all resolutions
   */
  const handleApply = useCallback(async () => {
    dispatch({ type: "SET_LOADING", isLoading: true });

    try {
      // Convert resolutions to array
      const resolutionArray: ConflictResolution[] = Array.from(
        state.resolutions.entries()
      ).map(([label, choice]) => ({
        label,
        choice,
      }));

      // Validate resolution array
      if (resolutionArray.length === 0) {
        throw new Error("No resolutions to apply");
      }

      // Call callback if provided and await the result
      if (onApplyResolutions) {
        await onApplyResolutions(resolutionArray);
      }

      // Only show success and close dialog after successful application
      success(`Applied ${resolutionArray.length} conflict resolution(s)`);
      onOpenChange(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to apply resolutions";
      error(message);
    } finally {
      dispatch({ type: "SET_LOADING", isLoading: false });
    }
  }, [state.resolutions, onApplyResolutions, onOpenChange, success, error]);

  /**
   * Load mock conflicts (owner only)
   */
  const loadMockConflicts = useCallback(() => {
    dispatch({ type: "LOAD_MOCK", conflicts: MOCK_CONFLICTS });
  }, []);

  // Calculate progress
  const resolvedCount = state.resolutions.size;
  const totalCount = state.conflicts.length;
  const hasUnresolved = totalCount > resolvedCount;

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      aria-label="Review Sync Conflicts"
    >
      <DialogContent className="max-w-4xl w-full max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 max-sm:p-4 border-b border-border/30 flex items-start justify-between shrink-0">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-medium">Review Sync Conflicts</h2>
              {userRole === "OWNER" && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={loadMockConflicts}
                  disabled={state.isLoading}
                  className="text-xs"
                >
                  Load Mock Data
                </Button>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {resolvedCount} of {totalCount} conflicts resolved
            </p>
          </div>
          <button
            type="button"
            aria-label="Close conflict review"
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            disabled={state.isLoading}
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 max-sm:p-4">
          {/* Empty states before first conflict loaded */}
          {(state.isLoading && state.conflicts.length === 0) ||
          (state.fetchError && state.conflicts.length === 0) ||
          state.conflicts.length === 0 ? (
            <ConflictReviewDialogStates
              isLoading={state.isLoading}
              fetchError={state.fetchError}
              hasConflicts={state.conflicts.length > 0}
              userRole={userRole}
              onLoadMock={loadMockConflicts}
            />
          ) : currentConflict ? (
            <ConflictReviewDialogDiffViewer
              currentConflict={currentConflict}
              currentResolution={currentResolution}
              currentIndex={state.currentIndex}
              totalCount={totalCount}
              isLoading={state.isLoading}
              onSetResolution={setResolution}
              onGoPrevious={goPrevious}
              onGoNext={goNext}
            />
          ) : (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground mt-1">
                You can now apply your resolutions to complete the sync.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <ConflictReviewDialogFooter
          isLoading={state.isLoading}
          hasUnresolved={hasUnresolved}
          onCancel={() => onOpenChange(false)}
          onApply={handleApply}
        />
      </DialogContent>
    </Dialog>
  );
}
