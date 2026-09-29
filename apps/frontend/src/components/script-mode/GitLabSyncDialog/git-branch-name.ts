/**
 * Git branch name rules shared with the backend schema in
 * apps/backend/src/lib/validation/gitlab.ts.
 */

import { hasInvalidBranchComponent } from "@branchforge/shared";
import type { SyncOperationType } from "./GitLabSyncDialogReducer";

const GIT_BRANCH_NAME = /^[a-zA-Z0-9_/$.-]+$/;

export function gitBranchNameError(name: string): string | null {
  if (!name) return "Branch is required";
  if (name.length > 255) return "Branch name is too long";
  if (!GIT_BRANCH_NAME.test(name)) {
    return "Branch name contains invalid characters";
  }
  if (
    name.startsWith("-") ||
    name.startsWith("/") ||
    name.endsWith("/") ||
    name.includes("..")
  ) {
    return "Branch name cannot start with '-' or '/', end with '/', or contain '..'";
  }
  if (hasInvalidBranchComponent(name)) {
    return "Branch name components cannot be empty, start with '.', end with '.', or end with '.lock'";
  }
  return null;
}

/**
 * Resolves the branch value, validation state, and duplicate status for the
 * sync dialog.
 *
 * - Import always falls back to the linked default branch when the user has
 *   not entered a branch.
 * - Export existing-branch mode has no fallback; the user must select a
 *   branch from the fetched list.
 * - Export new-branch mode validates the entered name and flags names that
 *   already exist in the fetched list.
 */
export function resolveSyncBranchFields(input: {
  operationType: SyncOperationType;
  createNewBranch: boolean;
  userBranch: string | null;
  defaultBranch: string;
  knownBranches: readonly string[] | undefined;
}): {
  branch: string;
  branchNameError: string | null;
  branchAlreadyExists: boolean;
} {
  const creatingNewBranch =
    input.operationType === "export" && input.createNewBranch;
  const branch = creatingNewBranch
    ? (input.userBranch ?? "")
    : input.operationType === "import"
      ? (input.userBranch ?? input.defaultBranch)
      : (input.userBranch ?? "");
  const trimmedBranch = branch.trim();
  const branchNameError =
    creatingNewBranch && trimmedBranch.length > 0
      ? gitBranchNameError(trimmedBranch)
      : null;
  return {
    branch,
    branchNameError,
    branchAlreadyExists:
      creatingNewBranch &&
      branchNameError === null &&
      (input.knownBranches ?? []).includes(trimmedBranch),
  };
}

/** A loaded branch list is required before either export path can submit. */
export function canExportToBranch(input: {
  branch: string;
  createNewBranch: boolean;
  branchNameError: string | null;
  branchAlreadyExists: boolean;
  knownBranches: readonly string[] | undefined;
}): boolean {
  if (!input.knownBranches?.length || !input.branch.trim()) return false;
  if (input.createNewBranch) {
    return input.branchNameError === null && !input.branchAlreadyExists;
  }
  return input.knownBranches.includes(input.branch);
}
