/**
 * Conflict Review Dialog — States
 *
 * Empty-state views for the conflict review dialog:
 * loading spinner, fetch error, and no-conflicts-detected.
 */

import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UserRole } from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

interface ConflictReviewDialogStatesProps {
  isLoading: boolean;
  fetchError: string | null;
  hasConflicts: boolean;
  userRole?: UserRole;
  onLoadMock: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function ConflictReviewDialogStates({
  isLoading,
  fetchError,
  hasConflicts,
  userRole,
  onLoadMock,
}: ConflictReviewDialogStatesProps) {
  // Loading state — first fetch only
  if (isLoading && !hasConflicts) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full size-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Detecting conflicts…</p>
        </div>
      </div>
    );
  }

  // Error state — first fetch only
  if (fetchError && !hasConflicts) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-sm text-destructive mb-2">{fetchError}</p>
          {userRole === "OWNER" && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onLoadMock}
            >
              Load Mock Data
            </Button>
          )}
        </div>
      </div>
    );
  }

  // No conflicts at all
  if (!hasConflicts) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <CheckCircle2 className="size-12 mx-auto text-green-500 mb-4" />
          <h3 className="text-lg font-medium">No Conflicts Detected</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Your BranchForge and GitLab versions are in sync.
          </p>
        </div>
      </div>
    );
  }

  // Has conflicts — render nothing (the parent handles this via DiffViewer)
  return null;
}
