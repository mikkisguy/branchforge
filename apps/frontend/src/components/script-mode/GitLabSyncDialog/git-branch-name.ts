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
 * Branch field value after toggling "Create new branch".
 * Turning it on clears a prefilled default name so export does not
 * target that branch by accident. Turning it off restores the default
 * when the field was cleared.
 */
export function branchAfterCreateNewToggle(
  createNewBranch: boolean,
  userBranch: string | null,
  defaultBranch: string
): string | null {
  if (createNewBranch) {
    if (userBranch === null || userBranch === defaultBranch) {
      return "";
    }
    return userBranch;
  }
  return userBranch === "" ? null : userBranch;
}

/**
 * Branch field shown in the sync dialog, including validation for a
 * newly created export branch.
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
  const branch = input.userBranch ?? input.defaultBranch;
  const trimmedBranch = branch.trim();
  const creatingNewBranch =
    input.operationType === "export" && input.createNewBranch;
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
