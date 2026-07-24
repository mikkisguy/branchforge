/**
 * GitLab Sync Dialog — Header
 *
 * Dialog title, description, and close button.
 */

import { X } from "lucide-react";
import type { SyncOperationType } from "./GitLabSyncDialogReducer";

// ============================================================================
// Types
// ============================================================================

interface GitLabSyncDialogHeaderProps {
  operationType: SyncOperationType;
  isProcessing: boolean;
  syncIcon: React.ComponentType<{ className?: string }>;
  onClose: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function GitLabSyncDialogHeader({
  operationType,
  isProcessing,
  syncIcon: SyncIcon,
  onClose,
}: GitLabSyncDialogHeaderProps) {
  return (
    <div className="p-6 max-sm:p-4 border-b border-border/30 flex items-start justify-between">
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
        onClick={onClose}
        className="text-muted-foreground hover:text-foreground transition-colors"
        disabled={isProcessing}
        type="button"
        aria-label="Close sync dialog"
      >
        <X className="size-5" />
      </button>
    </div>
  );
}
