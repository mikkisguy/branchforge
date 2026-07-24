/**
 * GitLab Import Dialog - Status Panels
 *
 * Renders the appropriate status panel based on the current import state.
 * Handles: no-integration alert, checking integration, importing, success, and error states.
 */

import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ImportState } from "./GitLabImportDialogReducer";

interface GitLabImportDialogStatusPanelsProps {
  importState: ImportState;
  hasIntegration: boolean;
  checkingIntegration: boolean;
  onConfigureClick: () => void;
  onRetry: () => void;
}

export function GitLabImportDialogStatusPanels({
  importState,
  hasIntegration,
  checkingIntegration,
  onConfigureClick,
  onRetry,
}: GitLabImportDialogStatusPanelsProps) {
  // Checking integration status
  if (checkingIntegration) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-6 animate-spin" />
        <span className="ml-2 text-sm text-muted-foreground">
          Checking GitLab integration…
        </span>
      </div>
    );
  }

  // Integration not configured
  if (importState.status === "idle" && !hasIntegration) {
    return (
      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="size-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-medium text-amber-600 dark:text-amber-400 mb-1">
              GitLab Integration Not Configured
            </h4>
            <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">
              To import from GitLab, you need to configure your GitLab access
              token first.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onConfigureClick}
            >
              Configure GitLab Integration
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Importing state
  if (importState.status === "importing") {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <Loader2 className="size-8 animate-spin mb-4" />
        <p className="text-sm text-muted-foreground">{importState.message}</p>
      </div>
    );
  }

  // Success state
  if (importState.status === "success") {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <CheckCircle2 className="size-12 text-green-500 mb-4" />
        <p className="text-sm text-foreground">{importState.message}</p>
      </div>
    );
  }

  // Error state
  if (importState.status === "error") {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="size-5 text-destructive flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-medium text-destructive mb-1">Import Failed</h4>
            <p className="text-sm text-destructive/90">{importState.message}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRetry}
              className="mt-3"
            >
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
