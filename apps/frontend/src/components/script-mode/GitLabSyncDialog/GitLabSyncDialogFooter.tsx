/**
 * GitLab Sync Dialog — Footer
 *
 * Context-aware action buttons at the bottom of the sync dialog:
 * cancel, export/import, close, and progress-driven states.
 */

import { Button } from "@/components/ui/button";

// ============================================================================
// Types
// ============================================================================

interface GitLabSyncDialogFooterProps {
  isProcessing: boolean;
  hasOperation: boolean;
  operationStatus: string | undefined;
  branch: string;
  operationType: "export" | "import";
  onSync: () => void;
  onClose: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function GitLabSyncDialogFooter({
  isProcessing,
  hasOperation,
  operationStatus,
  branch,
  operationType,
  onSync,
  onClose,
}: GitLabSyncDialogFooterProps) {
  return (
    <div className="p-6 max-sm:p-4 border-t border-border/30 flex justify-end gap-2">
      {!isProcessing && !hasOperation && (
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={onSync} disabled={!branch.trim()}>
            {operationType === "export" ? "Export" : "Import"}
          </Button>
        </>
      )}
      {(isProcessing || hasOperation) && operationStatus !== "COMPLETED" && (
        <Button
          type="button"
          onClick={onClose}
          variant="outline"
          disabled={isProcessing}
        >
          Close
        </Button>
      )}
      {operationStatus === "COMPLETED" && (
        <Button type="button" onClick={onClose}>
          Close
        </Button>
      )}
    </div>
  );
}
