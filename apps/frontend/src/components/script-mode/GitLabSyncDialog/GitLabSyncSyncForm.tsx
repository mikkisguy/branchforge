/**
 * GitLab Sync Dialog — Sync Form
 *
 * Form fields for GitLab sync operations:
 * branch input, commit message, conflict resolution options.
 */

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ConflictResolution } from "@/lib/api/gitlab";

// ============================================================================
// Constants
// ============================================================================

const CONFLICT_RESOLUTIONS: Array<{
  value: ConflictResolution;
  label: string;
  description: string;
}> = [
  {
    value: "branchforge_wins",
    label: "BranchForge Wins",
    description: "Overwrite GitLab changes with local data",
  },
  {
    value: "gitlab_wins",
    label: "GitLab Wins",
    description: "Overwrite local data with GitLab changes",
  },
  {
    value: "manual_review",
    label: "Manual Review",
    description: "Review conflicts before applying changes",
  },
];

// ============================================================================
// Types
// ============================================================================

interface GitLabSyncSyncFormProps {
  branch: string;
  commitMessage: string;
  conflictResolution: ConflictResolution;
  operationType: "export" | "import";
  isFirstSync: boolean;
  isProcessing: boolean;
  error: string | null;
  onBranchChange: (value: string) => void;
  onCommitMessageChange: (value: string) => void;
  onConflictResolutionChange: (value: ConflictResolution) => void;
  defaultBranch: string;
}

// ============================================================================
// Component
// ============================================================================

export function GitLabSyncSyncForm({
  branch,
  commitMessage,
  conflictResolution,
  operationType,
  isFirstSync,
  isProcessing,
  error: syncError,
  onBranchChange,
  onCommitMessageChange,
  onConflictResolutionChange,
  defaultBranch,
}: GitLabSyncSyncFormProps) {
  return (
    <>
      {/* Branch Selection */}
      <div className="space-y-2">
        <Label htmlFor="sync-branch">Branch</Label>
        <Input
          id="sync-branch"
          type="text"
          placeholder={defaultBranch}
          value={branch}
          onChange={(e) => onBranchChange(e.target.value)}
          disabled={isProcessing}
          aria-required="true"
        />
        <p className="text-xs text-muted-foreground">
          The GitLab branch to{" "}
          {operationType === "export" ? "push to" : "pull from"}.
        </p>
      </div>

      {/* Commit Message (export only) */}
      {operationType === "export" && (
        <div className="space-y-2">
          <Label htmlFor="commit-message">Commit Message</Label>
          <Input
            id="commit-message"
            type="text"
            placeholder="Update scenes from BranchForge"
            value={commitMessage}
            onChange={(e) => onCommitMessageChange(e.target.value)}
            disabled={isProcessing}
          />
        </div>
      )}

      {/* Conflict Resolution (import only) */}
      {operationType === "import" && (
        <div className="space-y-2">
          {isFirstSync ? (
            // First sync — simple message
            <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                This will import all scenes from GitLab.
              </p>
            </div>
          ) : (
            // Existing data — show conflict resolution options
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                Conflict Resolution
              </legend>
              <div className="space-y-2">
                {CONFLICT_RESOLUTIONS.map((cr) => (
                  <button
                    key={cr.value}
                    type="button"
                    onClick={() => onConflictResolutionChange(cr.value)}
                    aria-pressed={conflictResolution === cr.value}
                    className={`w-full p-3 text-left rounded-md border transition-colors ${
                      conflictResolution === cr.value
                        ? "border-primary bg-primary/10"
                        : "border-border/30 hover:bg-muted/50"
                    }`}
                    disabled={isProcessing}
                  >
                    <p className="text-sm font-medium">{cr.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {cr.description}
                    </p>
                  </button>
                ))}
              </div>
            </fieldset>
          )}
        </div>
      )}

      {/* Error Display */}
      {syncError && (
        <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 rounded-md text-sm">
          {syncError}
        </div>
      )}
    </>
  );
}
