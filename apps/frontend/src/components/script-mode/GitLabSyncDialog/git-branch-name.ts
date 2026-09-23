/**
 * Git branch name rules shared with the backend schema in
 * apps/backend/src/lib/validation/gitlab.ts.
 */

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
