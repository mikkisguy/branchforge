/**
 * Conflict Review Dialog — Footer
 *
 * Action buttons at the bottom of the conflict review dialog:
 * cancel, apply resolutions, and unresolved conflict hint.
 */

import { Button } from "@/components/ui/button";

// ============================================================================
// Types
// ============================================================================

interface ConflictReviewDialogFooterProps {
  isLoading: boolean;
  hasUnresolved: boolean;
  onCancel: () => void;
  onApply: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function ConflictReviewDialogFooter({
  isLoading,
  hasUnresolved,
  onCancel,
  onApply,
}: ConflictReviewDialogFooterProps) {
  return (
    <div className="p-6 max-sm:p-4 border-t border-border/30 flex justify-between shrink-0">
      <Button
        type="button"
        variant="outline"
        onClick={onCancel}
        disabled={isLoading}
      >
        Cancel
      </Button>
      <div className="flex items-center gap-2">
        {hasUnresolved && (
          <span className="text-sm text-muted-foreground">
            Resolve all conflicts first
          </span>
        )}
        <Button
          type="button"
          onClick={onApply}
          disabled={isLoading || hasUnresolved}
        >
          {isLoading ? <>Applying…</> : <>Apply Resolutions</>}
        </Button>
      </div>
    </div>
  );
}
