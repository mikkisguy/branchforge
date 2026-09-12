/**
 * Generated BranchForge preview files.
 *
 * These files are regenerated from project data on every export, so users
 * must never rename, move, or delete them through the file UI. The backend
 * enforces the same rule; the frontend hides the actions and ignores the
 * F2 rename shortcut for these paths.
 */

const GENERATED_PREVIEW_BASENAMES = new Set([
  "branchforge_variables.rpy",
  "branchforge_stats.rpy",
  "branchforge_definitions.rpy",
]);

/**
 * Returns true when the given full relative path points at a generated
 * BranchForge preview file (e.g. `branchforge_definitions.rpy`).
 */
export function isGeneratedPreviewFilePath(filePath: string): boolean {
  const basename = filePath.split("/").pop() ?? filePath;
  return GENERATED_PREVIEW_BASENAMES.has(basename.toLowerCase());
}
