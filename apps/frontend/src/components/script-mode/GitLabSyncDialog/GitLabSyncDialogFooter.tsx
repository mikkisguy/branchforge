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
  branchInvalid?: boolean;
  createNewBranch: boolean;
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
  branchInvalid = false,
  createNewBranch,
  operationType,
  onSync,
  onClose,
}: GitLabSyncDialogFooterProps) {
  return (
    <div className="p-6 max-sm:p-4 border-t border-border/30 flex justify-end gap-2 shrink-0 max-[380px]:flex-col">
      {!isProcessing && !hasOperation && (
        <>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="max-[380px]:w-full"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onSync}
            disabled={!branch.trim() || branchInvalid}
            className="max-[380px]:w-full"
          >
            {submitLabel({ operationType, createNewBranch, branch })}
          </Button>
        </>
      )}
      {(isProcessing || hasOperation) && operationStatus !== "COMPLETED" && (
        <Button
          type="button"
          onClick={onClose}
          variant="outline"
          disabled={isProcessing}
          className="max-[380px]:w-full"
        >
          Close
        </Button>
      )}
      {operationStatus === "COMPLETED" && (
        <Button type="button" onClick={onClose} className="max-[380px]:w-full">
          Close
        </Button>
      )}
    </div>
  );
}

function submitLabel({
  operationType,
  createNewBranch,
  branch,
}: {
  operationType: "export" | "import";
  createNewBranch: boolean;
  branch: string;
}): string {
  if (operationType === "import") {
    return "Import";
  }
  if (createNewBranch) {
    return "Create branch and export";
  }
  return `Export to ${branch || "branch"}`;
}
