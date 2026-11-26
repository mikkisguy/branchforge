/**
 * GitLab Sync Dialog — Header
 *
 * Dialog title, description, and close button.
 */

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <div className="p-6 max-sm:p-4 border-b border-border/30 flex items-center justify-between gap-3 shrink-0">
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
          {operationType === "import" && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              Pull changes from GitLab to BranchForge
            </p>
          )}
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onClose}
        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
        disabled={isProcessing}
        aria-label="Close sync dialog"
      >
        <X className="size-5" />
      </Button>
    </div>
  );
}
