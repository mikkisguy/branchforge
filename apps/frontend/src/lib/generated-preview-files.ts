import type { QueryClient } from "@tanstack/react-query";
import { exportKeys } from "@/lib/query-keys";

/**
 * Generated BranchForge preview files.
 *
 * These files are regenerated from project data on every export, so users
 * must never rename, move, or delete them through the file UI. The backend
 * enforces the same rule; the frontend hides the actions and ignores the
 * F2 rename shortcut for these paths.
 */

export const GENERATED_PREVIEW_BASENAMES = [
  "branchforge_variables.rpy",
  "branchforge_stats.rpy",
  "branchforge_definitions.rpy",
] as const;

/**
 * Returns true when the given full relative path points at a generated
 * BranchForge preview file (e.g. `branchforge_definitions.rpy`).
 */
export function isGeneratedPreviewFilePath(filePath: string): boolean {
  const basename = (filePath.split("/").pop() ?? filePath).toLowerCase();
  return GENERATED_PREVIEW_BASENAMES.some((name) => name === basename);
}

/** Refresh mounted previews and mark cached previews stale for the next visit. */
export function invalidateGeneratedFiles(
  queryClient: QueryClient,
  projectId: string
) {
  const queryKey = exportKeys.preview(projectId);
  const state = queryClient.getQueryState(queryKey);

  // A refetch normally replaces an in-flight request only once the cache has
  // data. Restart a first load too, since it may predate this mutation.
  if (state?.data === undefined && state?.fetchStatus === "fetching") {
    void queryClient.cancelQueries({ queryKey });
  }

  return queryClient.invalidateQueries({ queryKey });
}
