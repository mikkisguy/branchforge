// Backward-compatibility shim — implementation moved to services/gitlab/
// Only re-exports what gitlab.service.ts historically exported.
export {
  validateGitlabPAT,
  getGitlabIntegration,
  storeGitlabIntegration,
  deleteGitlabIntegration,
  listGitlabRepositories,
  getGitlabProject,
  linkRepository,
  unlinkRepository,
  getRepositoryLink,
  listRepositoryLinks,
  listBranches,
  getBranchCommitSha,
  listRpyFiles,
  getFileContent,
  createOrUpdateFile,
  batchCommitFiles,
  importProjectFromGitLab,
  getGitLabFilesWithScenes,
  updateGitLabFileContent,
} from "./gitlab/index.js";
