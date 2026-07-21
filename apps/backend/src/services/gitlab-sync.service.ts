// Backward-compatibility shim — implementation moved to services/gitlab/
// Only re-exports what gitlab-sync.service.ts historically exported.
export {
  exportToGitlab,
  importFromGitlab,
  getSyncOperation,
  listSyncOperations,
  cleanupStaleSyncOperations,
  detectConflicts,
  computeCommonDirectoryPrefix,
} from "./gitlab/index.js";

export type { ConflictInfo, ConflictDetectionResult } from "./gitlab/index.js";
