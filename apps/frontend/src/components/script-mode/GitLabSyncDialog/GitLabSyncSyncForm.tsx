/**
 * GitLab Sync Dialog — Sync Form
 *
 * Form fields for GitLab sync operations:
 * branch input, commit message, conflict resolution options.
 */

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
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
  createNewBranch: boolean;
  onCreateNewBranchChange: (value: boolean) => void;
  branchNameError: string | null;
  branchAlreadyExists: boolean;
  branches: readonly string[] | undefined;
  branchesLoading: boolean;
  branchesError: Error | null;
  onBranchesRetry: () => void;
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
  createNewBranch,
  onCreateNewBranchChange,
  branchNameError,
  branchAlreadyExists,
  branches,
  branchesLoading,
  branchesError,
  onBranchesRetry,
}: GitLabSyncSyncFormProps) {
  const isExport = operationType === "export";
  const hasBranchControl =
    !isExport ||
    createNewBranch ||
    (!branchesLoading && !branchesError && !!branches?.length);
  const branchHelp = branchHelpText({
    operationType,
    createNewBranch,
    defaultBranch,
    branchNameError,
    branchAlreadyExists,
  });

  return (
    <>
      {/* Branch Selection */}
      <div className="space-y-2">
        {hasBranchControl ? (
          <Label htmlFor="sync-branch">
            {isExport && createNewBranch ? "New branch name" : "Branch"}
          </Label>
        ) : (
          <span className="text-sm font-medium leading-none">Branch</span>
        )}
        {isExport ? (
          createNewBranch ? (
            <Input
              id="sync-branch"
              type="text"
              placeholder="feature/my-changes"
              value={branch}
              onChange={(e) => onBranchChange(e.target.value)}
              disabled={isProcessing}
              aria-required="true"
              aria-invalid={
                branchNameError || branchAlreadyExists ? true : undefined
              }
              aria-describedby="sync-branch-help"
            />
          ) : (
            <BranchSelect
              branch={branch}
              branches={branches}
              branchesLoading={branchesLoading}
              branchesError={branchesError}
              onBranchesRetry={onBranchesRetry}
              isProcessing={isProcessing}
              onBranchChange={onBranchChange}
            />
          )
        ) : (
          <Input
            id="sync-branch"
            type="text"
            placeholder={defaultBranch}
            value={branch}
            onChange={(e) => onBranchChange(e.target.value)}
            disabled={isProcessing}
            aria-required="true"
            aria-describedby="sync-branch-help"
          />
        )}
        <p
          id="sync-branch-help"
          className={
            branchNameError || branchAlreadyExists
              ? "text-xs text-red-800 dark:text-red-200"
              : "text-xs text-muted-foreground"
          }
        >
          {branchHelp}
        </p>
        {isExport && (
          <div className="flex items-center gap-2 pt-1">
            {createNewBranch ? (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0"
                onClick={() => onCreateNewBranchChange(false)}
                disabled={isProcessing}
              >
                Choose an existing branch
              </Button>
            ) : (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0"
                onClick={() => onCreateNewBranchChange(true)}
                disabled={
                  isProcessing ||
                  branchesLoading ||
                  !!branchesError ||
                  !branches?.length
                }
              >
                Create a new branch
              </Button>
            )}
          </div>
        )}
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

function BranchSelect({
  branch,
  branches,
  branchesLoading,
  branchesError,
  onBranchesRetry,
  isProcessing,
  onBranchChange,
}: {
  branch: string;
  branches: readonly string[] | undefined;
  branchesLoading: boolean;
  branchesError: Error | null;
  onBranchesRetry: () => void;
  isProcessing: boolean;
  onBranchChange: (value: string) => void;
}) {
  if (branchesLoading) {
    return (
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Loading branches…
      </p>
    );
  }

  if (branchesError) {
    return (
      <div
        role="alert"
        className="rounded-md border border-destructive/40 p-3 text-sm text-destructive"
      >
        Could not load branches.{" "}
        <Button
          type="button"
          variant="link"
          className="h-auto p-0"
          onClick={onBranchesRetry}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (!branches || branches.length === 0) {
    return (
      <div className="text-sm text-muted-foreground" aria-live="polite">
        No branches found. Check that the linked repository has a default
        branch.{" "}
        <Button
          type="button"
          variant="link"
          className="h-auto p-0"
          onClick={onBranchesRetry}
        >
          Retry
        </Button>
      </div>
    );
  }

  const options = branches.map((name) => ({ value: name, label: name }));

  return (
    <Select
      id="sync-branch"
      options={options}
      value={branch || undefined}
      onChange={onBranchChange}
      placeholder="Select branch…"
      disabled={isProcessing}
      aria-required="true"
      aria-label="Branch"
      aria-describedby="sync-branch-help"
    />
  );
}

function branchHelpText({
  operationType,
  createNewBranch,
  defaultBranch,
  branchNameError,
  branchAlreadyExists,
}: {
  operationType: "export" | "import";
  createNewBranch: boolean;
  defaultBranch: string;
  branchNameError: string | null;
  branchAlreadyExists: boolean;
}): string {
  if (operationType === "import") {
    return "The GitLab branch to pull from.";
  }
  if (createNewBranch) {
    if (branchNameError) return branchNameError;
    if (branchAlreadyExists) {
      return "A branch with this name already exists. Choose an existing branch to export to it.";
    }
    return `A new branch is created from ${defaultBranch} and your labels are committed onto it.`;
  }
  return "The GitLab branch to push to.";
}
