/**
 * Conflict Review Dialog — Footer
 *
 * Action buttons at the bottom of the conflict review dialog:
 * close, and a disabled apply control (apply does not write files yet).
 */

import { Button } from "@/components/ui/button";

// ============================================================================
// Types
// ============================================================================

interface ConflictReviewDialogFooterProps {
  isLoading: boolean;
  hasUnresolved: boolean;
  onCancel: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function ConflictReviewDialogFooter({
  isLoading,
  hasUnresolved,
  onCancel,
}: ConflictReviewDialogFooterProps) {
  return (
    <div className="p-6 max-sm:p-4 border-t border-border/30 flex justify-between items-end gap-4 shrink-0">
      <Button
        type="button"
        variant="outline"
        onClick={onCancel}
        disabled={isLoading}
      >
        Close
      </Button>
      <div className="flex flex-col items-end gap-1">
        <p className="text-sm text-muted-foreground text-right max-w-sm">
          Review is read-only in this beta. Resolve conflicts in GitLab or
          locally, then pull again.
        </p>
        {hasUnresolved && (
          <span className="text-sm text-muted-foreground">
            Not all conflicts have a selected side
          </span>
        )}
        <Button
          type="button"
          disabled
          title="Applying resolutions is not implemented yet"
        >
          Apply (not available yet)
        </Button>
      </div>
    </div>
  );
}
