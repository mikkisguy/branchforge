/**
 * GitLab Sync Dialog — Progress
 *
 * Displays sync status, progress bar, and conflict warnings
 * during GitLab export/import operations.
 */

import { CheckCircle2, AlertCircle } from "lucide-react";
// ============================================================================
// Types
// ============================================================================

interface SyncOperation {
  status: string;
  conflictCount?: number;
}

interface GitLabSyncDialogProgressProps {
  operation: SyncOperation | null;
  isProcessing: boolean;
  progress: number;
  error: string | null;
  operationType: "export" | "import";
}

// ============================================================================
// Component
// ============================================================================

export function GitLabSyncDialogProgress({
  operation,
  isProcessing,
  progress,
  error: syncError,
  operationType,
}: GitLabSyncDialogProgressProps) {
  return (
    <div className="space-y-3">
      {/* Status Message */}
      {operation && (
        <div
          className={
            operation.status === "COMPLETED"
              ? "text-green-600"
              : operation.status === "FAILED"
                ? "text-red-600"
                : "text-amber-600"
          }
        >
          {operation.status === "COMPLETED" && (
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="size-4" />
              <span>
                {operationType === "export" ? "Export" : "Import"} completed
              </span>
            </div>
          )}
          {operation.status === "FAILED" && (
            <div className="flex items-center gap-2 text-sm">
              <AlertCircle className="size-4" />
              <span>{syncError || "Operation failed"}</span>
            </div>
          )}
        </div>
      )}

      {/* Conflict Warning */}
      {operation?.conflictCount && operation.conflictCount > 0 && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 rounded-md text-sm">
          {operation.conflictCount} conflict(s) detected. Manual review may be
          required.
        </div>
      )}

      {/* Progress Bar — only show during processing */}
      {isProcessing && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {operationType === "export" ? "Exporting" : "Importing"}...
            </span>
            <span className="font-medium">{progress}%</span>
          </div>
          <progress
            className="h-2 w-full rounded-full bg-muted [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-value]:bg-primary [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:transition-all [&::-webkit-progress-value]:duration-300 [&::-moz-progress-bar]:bg-primary [&::-moz-progress-bar]:rounded-full"
            value={progress}
            max={100}
            aria-label="GitLab sync progress"
          />
        </div>
      )}
    </div>
  );
}
