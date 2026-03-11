/**
 * GitLab Integration Routes
 *
 * Routes for GitLab integration and sync operations.
 * All routes require authentication.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authenticate } from "../middleware/auth.middleware.js";
import { checkRateLimit } from "../services/rate-limiter.service.js";
import { getDb } from "../db/index.js";
import {
  projects,
  gitlabSyncOperations,
  gitlabFiles,
  labels,
} from "../db/schema/index.js";
import { eq, inArray } from "drizzle-orm";
import {
  validateGitlabPAT,
  storeGitlabIntegration,
  deleteGitlabIntegration,
  listGitlabRepositories,
  getGitlabProject,
  linkRepository,
  unlinkRepository,
  listBranches,
  listRpyFiles,
  getGitlabIntegration,
  listRepositoryLinks,
} from "../services/gitlab.service.js";
import {
  exportToGitlab,
  importFromGitlab,
  getSyncOperation,
  listSyncOperations,
  detectConflicts,
  type ConflictResolution,
} from "../services/gitlab-sync.service.js";
import { syncLabelsFromGitLabFile } from "../services/gitlab-file-sync.service.js";

/**
 * Helper to get the authenticated user ID from a request.
 * This is used for route handlers protected by the authenticate middleware,
 * which guarantees that request.user is defined.
 */
function getAuthenticatedUserId(request: FastifyRequest): string {
  // The authenticate middleware guarantees user is set
  return request.user!.id;
}

/**
 * Extract client IP from request, handling various proxy configurations
 */
function getClientIp(request: FastifyRequest): string {
  // Check for forwarded IP (behind proxy/load balancer)
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  if (Array.isArray(forwarded)) {
    return forwarded[0].trim();
  }

  // Check for other common headers
  const cfConnectingIp = request.headers["cf-connecting-ip"];
  if (typeof cfConnectingIp === "string") {
    return cfConnectingIp;
  }

  const xRealIp = request.headers["x-real-ip"];
  if (typeof xRealIp === "string") {
    return xRealIp;
  }

  // Fall back to socket address
  return request.ip;
}

// ============================================================================
// Types
// ============================================================================

interface ValidateTokenBody {
  token: string;
  gitlabUrl?: string;
}

interface StoreIntegrationBody {
  token: string;
  gitlabUrl?: string;
}

interface LinkRepositoryBody {
  projectId: string;
  gitlabProjectId: number;
  branch?: string;
}

interface ImportBody {
  projectId: string;
  branch: string;
  conflictResolution: ConflictResolution;
}

interface ExportBody {
  projectId: string;
  branch?: string;
  commitMessage?: string;
}

interface DetectConflictsBody {
  projectId: string;
  branch: string;
}

interface UpdateFileContentBody {
  content: string;
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * Authorization error response
 */
interface AuthzError {
  error: string;
  message: string;
}

/**
 * Verify that the authenticated user owns the specified project.
 *
 * This function checks that:
 * 1. The project exists
 * 2. The authenticated user is the owner (projects.userId matches)
 *
 * @param projectId - The project ID to verify
 * @param userId - The authenticated user's ID
 * @param reply - Fastify reply object for sending error responses
 * @returns true if authorized, false if an error response was sent
 */
async function authorizeProjectAccess(
  projectId: string,
  userId: string,
  reply: FastifyReply
): Promise<boolean> {
  const db = getDb();

  const [project] = await db
    .select({ userId: projects.userId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    const error: AuthzError = {
      error: "Not Found",
      message: "Project not found",
    };
    reply.status(404).send(error);
    return false;
  }

  if (project.userId !== userId) {
    const error: AuthzError = {
      error: "Forbidden",
      message: "You do not have access to this project",
    };
    reply.status(403).send(error);
    return false;
  }

  return true;
}

/**
 * Verify that the authenticated user owns the project associated with a sync operation.
 *
 * This function checks that:
 * 1. The sync operation exists
 * 2. The project associated with the operation exists
 * 3. The authenticated user is the owner of the project
 *
 * @param operationId - The sync operation ID to verify
 * @param userId - The authenticated user's ID
 * @param reply - Fastify reply object for sending error responses
 * @returns true if authorized, false if an error response was sent
 */
async function authorizeSyncOperationAccess(
  operationId: string,
  userId: string,
  reply: FastifyReply
): Promise<boolean> {
  const db = getDb();

  const [operation] = await db
    .select({ projectId: gitlabSyncOperations.projectId })
    .from(gitlabSyncOperations)
    .where(eq(gitlabSyncOperations.id, operationId))
    .limit(1);

  if (!operation) {
    const error: AuthzError = {
      error: "Not Found",
      message: "Sync operation not found",
    };
    reply.status(404).send(error);
    return false;
  }

  return authorizeProjectAccess(operation.projectId, userId, reply);
}

/**
 * Validate GitLab PAT
 *
 * POST /api/gitlab/validate
 * Body: { token: string, gitlabUrl?: string }
 *
 * Validates a GitLab Personal Access Token before storing it.
 */
async function validateTokenHandler(
  request: FastifyRequest<{ Body: ValidateTokenBody }>,
  reply: FastifyReply
): Promise<void> {
  const clientIp = getClientIp(request);

  // Check rate limit to prevent brute-force/DoS attacks
  const rateLimit = checkRateLimit(clientIp);
  if (!rateLimit.allowed) {
    request.log.warn(
      { ip: clientIp, retryAfter: rateLimit.retryAfter },
      "validateTokenHandler: Rate limit exceeded"
    );
    reply.status(429).send({
      error: "Too many validation attempts. Please try again later.",
      retryAfter: rateLimit.retryAfter,
    });
    return;
  }

  const { token, gitlabUrl } = request.body;

  if (!token) {
    reply.status(400).send({ error: "Token is required" });
    return;
  }

  try {
    const username = await validateGitlabPAT(token, gitlabUrl);

    if (!username) {
      reply.status(400).send({ error: "Invalid GitLab token" });
      return;
    }

    reply.send({ valid: true, username });
  } catch (err) {
    request.log.error(
      { err },
      "validateTokenHandler: Failed to validate GitLab token"
    );
    reply.status(500).send({
      error: "Failed to validate token",
      details: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

/**
 * Store GitLab integration
 *
 * POST /api/gitlab/integration
 * Body: { token: string, gitlabUrl?: string }
 *
 * Encrypts and stores the user's GitLab PAT.
 */
async function storeIntegrationHandler(
  request: FastifyRequest<{ Body: StoreIntegrationBody }>,
  reply: FastifyReply
): Promise<void> {
  const userId = getAuthenticatedUserId(request);
  const { token, gitlabUrl } = request.body;

  if (!token) {
    reply.status(400).send({ error: "Token is required" });
    return;
  }

  try {
    // Validate token before storing
    const username = await validateGitlabPAT(token, gitlabUrl);
    if (!username) {
      reply.status(400).send({ error: "Invalid GitLab token" });
      return;
    }

    await storeGitlabIntegration(userId, token, gitlabUrl);
    reply.status(201).send();
  } catch (err) {
    request.log.error(
      { err },
      "storeIntegrationHandler: Failed to store GitLab integration"
    );
    reply.status(500).send({
      error: "Failed to store integration",
      details: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

/**
 * Get GitLab integration
 *
 * GET /api/gitlab/integration
 *
 * Returns the user's GitLab integration metadata (excluding sensitive data).
 * Returns 204 No Content if integration is not configured.
 */
async function getIntegrationHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const userId = getAuthenticatedUserId(request);

  try {
    const integration = await getGitlabIntegration(userId);

    if (!integration) {
      reply.status(204).send();
      return;
    }

    // Return only non-sensitive fields
    reply.send({
      id: integration.id,
      username: integration.username,
      gitlabUrl: integration.gitlabUrl,
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt,
    });
  } catch (err) {
    request.log.error(
      { err },
      "getIntegrationHandler: Failed to get GitLab integration"
    );
    reply.status(500).send({
      error: "Failed to get integration",
      details: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

/**
 * Delete GitLab integration
 *
 * DELETE /api/gitlab/integration
 *
 * Removes the user's GitLab PAT and integration.
 */
async function deleteIntegrationHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const userId = getAuthenticatedUserId(request);

  try {
    await deleteGitlabIntegration(userId);
    reply.status(204).send();
  } catch (err) {
    request.log.error(
      { err },
      "deleteIntegrationHandler: Failed to delete GitLab integration"
    );
    reply.status(500).send({
      error: "Failed to delete integration",
      details: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

/**
 * List GitLab repositories
 *
 * GET /api/gitlab/repositories
 *
 * Returns a list of GitLab repositories accessible to the user.
 * Returns an empty array if GitLab integration is not configured.
 */
async function listProjectsHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const userId = getAuthenticatedUserId(request);
    const projects = await listGitlabRepositories(userId);
    reply.send(projects);
  } catch (err) {
    // Return empty array if integration not set up (normal state, not an error)
    if (
      err instanceof Error &&
      err.message === "GitLab integration not found"
    ) {
      reply.send([]);
      return;
    }

    request.log.error(
      { err },
      "listProjectsHandler: Failed to list GitLab repositories"
    );

    reply.status(500).send({
      error: "Failed to list GitLab repositories",
      details: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

/**
 * Link repository to project
 *
 * POST /api/gitlab/link
 * Body: { projectId: string, gitlabProjectId: number, branch?: string }
 *
 * Links a BranchForge project to a GitLab repository.
 */
async function linkRepositoryHandler(
  request: FastifyRequest<{ Body: LinkRepositoryBody }>,
  reply: FastifyReply
): Promise<void> {
  const userId = getAuthenticatedUserId(request);
  const { projectId, gitlabProjectId, branch = "main" } = request.body;

  if (!projectId || !gitlabProjectId) {
    reply
      .status(400)
      .send({ error: "projectId and gitlabProjectId are required" });
    return;
  }

  // Verify user owns the project
  if (!(await authorizeProjectAccess(projectId, userId, reply))) {
    return;
  }

  try {
    // Fetch GitLab project details to get the repository name
    const gitlabProject = await getGitlabProject(userId, gitlabProjectId);
    if (!gitlabProject) {
      reply.status(404).send({ error: "GitLab project not found" });
      return;
    }

    // Use path_with_namespace as the repository name (more descriptive)
    const repositoryName = gitlabProject.path_with_namespace;

    await linkRepository(projectId, gitlabProjectId, repositoryName, branch);
    reply.status(201).send();
  } catch (err) {
    request.log.error(
      { err },
      "linkRepositoryHandler: Failed to link repository"
    );

    if (err instanceof Error && err.message.includes("duplicate key value")) {
      reply.status(409).send({
        error: "Repository already linked",
        details: err.message,
      });
      return;
    }

    reply.status(500).send({
      error: "Failed to link repository",
      details: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

/**
 * Unlink repository from project
 *
 * DELETE /api/gitlab/unlink/:projectId
 *
 * Removes the GitLab repository link from a project.
 */
async function unlinkRepositoryHandler(
  request: FastifyRequest<{ Params: { projectId: string } }>,
  reply: FastifyReply
): Promise<void> {
  const userId = getAuthenticatedUserId(request);
  const { projectId } = request.params;

  // Verify user owns the project
  if (!(await authorizeProjectAccess(projectId, userId, reply))) {
    return;
  }

  try {
    await unlinkRepository(projectId);
    reply.status(204).send();
  } catch (err) {
    request.log.error(
      { err, projectId },
      "unlinkRepositoryHandler: Failed to unlink repository"
    );
    reply.status(500).send({
      error: "Failed to unlink repository",
      details: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

/**
 * List linked repositories
 *
 * GET /api/gitlab/linked-repositories
 *
 * Returns a list of all GitLab repositories linked to the user's projects.
 * Returns an empty array if no repositories are linked or integration not set up.
 */
async function listRepositoriesHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const userId = getAuthenticatedUserId(request);

  try {
    const repositories = await listRepositoryLinks(userId);
    reply.send(repositories);
  } catch (err) {
    // Return empty array if integration not set up (normal state, not an error)
    if (
      err instanceof Error &&
      err.message === "GitLab integration not found"
    ) {
      reply.send([]);
      return;
    }
    request.log.error(
      { err },
      "listRepositoriesHandler: Failed to list linked repositories"
    );
    reply.status(500).send({
      error: "Failed to list linked repositories",
      details: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

/**
 * List branches
 *
 * GET /api/gitlab/branches/:projectId
 *
 * Returns a list of branches in the linked GitLab repository.
 * Returns an empty array if the repository is not linked.
 */
async function listBranchesHandler(
  request: FastifyRequest<{ Params: { projectId: string } }>,
  reply: FastifyReply
): Promise<void> {
  const userId = getAuthenticatedUserId(request);
  const { projectId } = request.params;

  // Verify user owns the project
  if (!(await authorizeProjectAccess(projectId, userId, reply))) {
    return;
  }

  try {
    const branches = await listBranches(projectId);
    reply.send(branches);
  } catch (err) {
    // Return empty array if repository not linked (normal state, not an error)
    if (
      err instanceof Error &&
      (err.message === "GitLab repository not linked" ||
        err.message === "Project not found")
    ) {
      reply.send([]);
      return;
    }

    request.log.error(
      { err, projectId },
      "listBranchesHandler: Failed to list branches"
    );

    if (err instanceof Error && err.message.startsWith("GitLab API error:")) {
      reply.status(502).send({
        error: "Failed to fetch branches from GitLab",
        details: err.message,
      });
      return;
    }

    reply.status(500).send({
      error: "Failed to list branches",
      details: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

/**
 * List RPY files
 *
 * GET /api/gitlab/files/:projectId?branch=xxx
 *
 * Returns a list of .rpy files in the linked GitLab repository.
 * Returns an empty array if the repository is not linked.
 */
async function listFilesHandler(
  request: FastifyRequest<{
    Params: { projectId: string };
    Querystring: { branch?: string };
  }>,
  reply: FastifyReply
): Promise<void> {
  const userId = getAuthenticatedUserId(request);
  const { projectId } = request.params;
  const { branch } = request.query;

  if (!branch) {
    reply.status(400).send({ error: "Branch is required" });
    return;
  }

  // Verify user owns the project
  if (!(await authorizeProjectAccess(projectId, userId, reply))) {
    return;
  }

  try {
    const files = await listRpyFiles(projectId, branch);
    reply.send(files);
  } catch (err) {
    // Return empty array if repository not linked (normal state, not an error)
    if (
      err instanceof Error &&
      (err.message === "GitLab repository not linked" ||
        err.message === "Project not found")
    ) {
      reply.send([]);
      return;
    }

    request.log.error(
      { err, projectId, branch },
      "listFilesHandler: Failed to list RPY files"
    );

    if (err instanceof Error && err.message.startsWith("GitLab API error:")) {
      reply.status(502).send({
        error: "Failed to fetch files from GitLab",
        details: err.message,
      });
      return;
    }

    reply.status(500).send({
      error: "Failed to list RPY files",
      details: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

/**
 * Export to GitLab
 *
 * POST /api/gitlab/export
 * Body: { projectId: string, branch?: string, commitMessage?: string }
 *
 * Exports BranchForge scenes to GitLab as RPY files.
 */
async function exportHandler(
  request: FastifyRequest<{ Body: ExportBody }>,
  reply: FastifyReply
): Promise<void> {
  const userId = getAuthenticatedUserId(request);
  const { projectId, branch, commitMessage } = request.body;

  if (!projectId) {
    reply.status(400).send({ error: "projectId is required" });
    return;
  }

  // Verify user owns the project
  if (!(await authorizeProjectAccess(projectId, userId, reply))) {
    return;
  }

  try {
    const operation = await exportToGitlab(projectId, branch, commitMessage);
    reply.status(202).send(operation);
  } catch (err) {
    request.log.error(
      { err, projectId },
      "exportHandler: Failed to export to GitLab"
    );
    reply.status(500).send({
      error: "Failed to export to GitLab",
      details: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

/**
 * Import from GitLab
 *
 * POST /api/gitlab/import
 * Body: { projectId: string, branch: string, conflictResolution: ConflictResolution }
 *
 * Imports RPY files from GitLab to BranchForge.
 */
async function importHandler(
  request: FastifyRequest<{ Body: ImportBody }>,
  reply: FastifyReply
): Promise<void> {
  const userId = getAuthenticatedUserId(request);
  const { projectId, branch, conflictResolution } = request.body;

  if (!projectId || !branch) {
    reply.status(400).send({ error: "projectId and branch are required" });
    return;
  }

  const validResolutions: ConflictResolution[] = [
    "branchforge_wins",
    "gitlab_wins",
    "manual_review",
  ];
  if (!validResolutions.includes(conflictResolution)) {
    reply.status(400).send({ error: "Invalid conflictResolution" });
    return;
  }

  // Verify user owns the project
  if (!(await authorizeProjectAccess(projectId, userId, reply))) {
    return;
  }

  try {
    const operation = await importFromGitlab(
      projectId,
      branch,
      conflictResolution
    );
    reply.status(202).send(operation);
  } catch (err) {
    request.log.error(
      { err, projectId },
      "importHandler: Failed to import from GitLab"
    );
    reply.status(500).send({
      error: "Failed to import from GitLab",
      details: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

/**
 * Get sync operation status
 *
 * GET /api/gitlab/operations/:operationId
 *
 * Returns the status of a sync operation.
 */
async function getOperationHandler(
  request: FastifyRequest<{ Params: { operationId: string } }>,
  reply: FastifyReply
): Promise<void> {
  const userId = getAuthenticatedUserId(request);
  const { operationId } = request.params;

  // Verify user owns the project associated with this operation
  if (!(await authorizeSyncOperationAccess(operationId, userId, reply))) {
    return;
  }

  try {
    const operation = await getSyncOperation(operationId);

    if (!operation) {
      reply
        .status(404)
        .send({ error: "Not Found", message: "Sync operation not found" });
      return;
    }

    reply.send(operation);
  } catch (err) {
    request.log.error(
      { err, operationId },
      "getOperationHandler: Failed to get sync operation"
    );
    reply.status(500).send({
      error: "Failed to get sync operation",
      details: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

/**
 * List sync operations
 *
 * GET /api/gitlab/projects/:projectId/operations
 *
 * Returns a list of sync operations for a project.
 */
async function listOperationsHandler(
  request: FastifyRequest<{ Params: { projectId: string } }>,
  reply: FastifyReply
): Promise<void> {
  const userId = getAuthenticatedUserId(request);
  const { projectId } = request.params;

  // Verify user owns the project
  if (!(await authorizeProjectAccess(projectId, userId, reply))) {
    return;
  }

  try {
    const operations = await listSyncOperations(projectId);
    reply.send(operations);
  } catch (err) {
    request.log.error(
      { err, projectId },
      "listOperationsHandler: Failed to list sync operations"
    );
    reply.status(500).send({
      error: "Failed to list sync operations",
      details: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

/**
 * Detect conflicts
 *
 * POST /api/gitlab/detect-conflicts
 * Body: { projectId: string, branch: string }
 *
 * Detects conflicts between local and remote versions.
 */
async function detectConflictsHandler(
  request: FastifyRequest<{ Body: DetectConflictsBody }>,
  reply: FastifyReply
): Promise<void> {
  const userId = getAuthenticatedUserId(request);
  const { projectId, branch } = request.body;

  if (!projectId || !branch) {
    reply.status(400).send({ error: "projectId and branch are required" });
    return;
  }

  // Verify user owns the project
  if (!(await authorizeProjectAccess(projectId, userId, reply))) {
    return;
  }

  try {
    const result = await detectConflicts(projectId, branch);
    reply.send(result);
  } catch (err) {
    request.log.error(
      { err, projectId, branch },
      "detectConflictsHandler: Failed to detect conflicts"
    );
    reply.status(500).send({
      error: "Failed to detect conflicts",
      details: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

/**
 * Get GitLab files for a project
 *
 * GET /api/gitlab/files/stored/:projectId
 *
 * Returns all GitLab files with their associated scenes for the project.
 * This returns the stored files from the database, not the remote GitLab files.
 */
async function getGitLabFilesHandler(
  request: FastifyRequest<{ Params: { projectId: string } }>,
  reply: FastifyReply
): Promise<void> {
  const userId = getAuthenticatedUserId(request);
  const { projectId } = request.params;

  // Verify user owns the project
  if (!(await authorizeProjectAccess(projectId, userId, reply))) {
    return;
  }

  try {
    const db = getDb();

    // Get all GitLab files for the project
    const files = await db
      .select()
      .from(gitlabFiles)
      .where(eq(gitlabFiles.projectId, projectId));

    // Batch fetch all scenes for all files at once to avoid N+1 queries
    const fileIds = files.map((f) => f.id);

    // Define the scene type for the lookup
    type SceneWithFileId = {
      id: string;
      labelName: string | null;
      title: string;
      gitlabFileId: string | null;
    };

    const allScenes: SceneWithFileId[] =
      fileIds.length > 0
        ? await db
            .select({
              id: labels.id,
              labelName: labels.labelName,
              title: labels.title,
              gitlabFileId: labels.gitlabFileId,
            })
            .from(labels)
            .where(inArray(labels.gitlabFileId, fileIds))
        : [];

    // Create a lookup keyed by gitlabFileId
    const scenesByFileId = new Map<string, SceneWithFileId[]>();
    for (const scene of allScenes) {
      // Skip scenes without a gitlabFileId (defensive check)
      if (!scene.gitlabFileId) {
        continue;
      }
      if (!scenesByFileId.has(scene.gitlabFileId)) {
        scenesByFileId.set(scene.gitlabFileId, []);
      }
      scenesByFileId.get(scene.gitlabFileId)!.push(scene);
    }

    // Attach scenes to each file using the lookup
    const filesWithScenes = files.map((file) => ({
      ...file,
      scenes: scenesByFileId.get(file.id) ?? [],
    }));

    reply.send(filesWithScenes);
  } catch (err) {
    request.log.error(
      { err, projectId },
      "getGitLabFilesHandler: Failed to get GitLab files"
    );
    reply.status(500).send({
      error: "Failed to get GitLab files",
      details: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

/**
 * Update GitLab file content
 *
 * PUT /api/gitlab/files/:fileId
 * Body: { content: string }
 *
 * Updates file content (Script Mode editing)
 * Also re-parses the content to update associated scenes
 *
 * Uses gitlab-file-sync.service for reliable sync with:
 * - Atomic transactions
 * - Idempotency (same content skipped)
 * - Concurrent sync prevention
 * - Validation
 */
async function updateGitLabFileHandler(
  request: FastifyRequest<{
    Params: { fileId: string };
    Body: UpdateFileContentBody;
  }>,
  reply: FastifyReply
): Promise<void> {
  const userId = getAuthenticatedUserId(request);
  const { fileId } = request.params;
  const { content } = request.body;

  if (!content) {
    reply.status(400).send({ error: "Content is required" });
    return;
  }

  try {
    const db = getDb();

    // Get file to check project access
    const [file] = await db
      .select()
      .from(gitlabFiles)
      .where(eq(gitlabFiles.id, fileId))
      .limit(1);

    if (!file) {
      reply.status(404).send({ error: "File not found" });
      return;
    }

    // Verify user owns the project
    if (!(await authorizeProjectAccess(file.projectId, userId, reply))) {
      return;
    }

    // Update file content directly (Script Mode)
    await db
      .update(gitlabFiles)
      .set({
        content,
        updatedAt: new Date(),
      })
      .where(eq(gitlabFiles.id, fileId));

    const syncResult = await syncLabelsFromGitLabFile(fileId, content);

    if (!syncResult.success && syncResult.errors.length > 0) {
      // Check if it's a concurrent sync error
      const concurrentError = syncResult.errors.find((e) =>
        e.error.includes("already in progress")
      );

      if (concurrentError) {
        reply.status(409).send({
          error: "Sync already in progress",
          message: concurrentError.error,
        });
        return;
      }

      // Other sync errors - still return success for file update
      // but include sync errors in response
      request.log.warn(
        { errors: syncResult.errors },
        "updateGitLabFileHandler: Scene sync had errors"
      );
    }

    // Return success with sync details
    reply.send({
      success: true,
      sync: {
        skipped: syncResult.skipped,
        scenesCreated: syncResult.labelsCreated,
        scenesUpdated: syncResult.labelsUpdated,
        scenesDeleted: syncResult.labelsDeleted,
        linesProcessed: syncResult.linesProcessed,
        errors: syncResult.errors,
      },
    });
  } catch (err) {
    request.log.error(
      { err, fileId },
      "updateGitLabFileHandler: Failed to update GitLab file"
    );
    reply.status(500).send({
      error: "Failed to update GitLab file",
      details: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

// ============================================================================
// Routes Registration
// ============================================================================

export async function gitlabRoutes(fastify: FastifyInstance): Promise<void> {
  // Token validation (no auth required)
  fastify.post("/gitlab/validate", validateTokenHandler);

  // Integration management (require auth)
  fastify.get(
    "/gitlab/integration",
    {
      onRequest: [authenticate],
    },
    getIntegrationHandler
  );

  fastify.post<{ Body: StoreIntegrationBody }>(
    "/gitlab/integration",
    {
      onRequest: [authenticate],
    },
    storeIntegrationHandler
  );

  fastify.delete(
    "/gitlab/integration",
    {
      onRequest: [authenticate],
    },
    deleteIntegrationHandler
  );

  fastify.get(
    "/gitlab/repositories",
    {
      onRequest: [authenticate],
    },
    listProjectsHandler
  );

  // Repository linking (require auth)
  fastify.post<{ Body: LinkRepositoryBody }>(
    "/gitlab/link",
    {
      onRequest: [authenticate],
    },
    linkRepositoryHandler
  );

  fastify.delete<{ Params: { projectId: string } }>(
    "/gitlab/unlink/:projectId",
    {
      onRequest: [authenticate],
    },
    unlinkRepositoryHandler
  );

  fastify.get(
    "/gitlab/linked-repositories",
    {
      onRequest: [authenticate],
    },
    listRepositoriesHandler
  );

  fastify.get<{ Params: { projectId: string } }>(
    "/gitlab/branches/:projectId",
    {
      onRequest: [authenticate],
    },
    listBranchesHandler
  );

  fastify.get<{
    Params: { projectId: string };
    Querystring: { branch?: string };
  }>(
    "/gitlab/files/:projectId",
    {
      onRequest: [authenticate],
    },
    listFilesHandler
  );

  // Sync operations (require auth)
  fastify.post<{ Body: ExportBody }>(
    "/gitlab/export",
    {
      onRequest: [authenticate],
    },
    exportHandler
  );

  fastify.post<{ Body: ImportBody }>(
    "/gitlab/import",
    {
      onRequest: [authenticate],
    },
    importHandler
  );

  fastify.get<{ Params: { operationId: string } }>(
    "/gitlab/operations/:operationId",
    {
      onRequest: [authenticate],
    },
    getOperationHandler
  );

  fastify.get<{ Params: { projectId: string } }>(
    "/gitlab/projects/:projectId/operations",
    {
      onRequest: [authenticate],
    },
    listOperationsHandler
  );

  fastify.post<{ Body: DetectConflictsBody }>(
    "/gitlab/detect-conflicts",
    {
      onRequest: [authenticate],
    },
    detectConflictsHandler
  );

  // GitLab files management (require auth)
  // Get stored GitLab files from database (with associated scenes)
  fastify.get<{ Params: { projectId: string } }>(
    "/gitlab/files/stored/:projectId",
    {
      onRequest: [authenticate],
    },
    getGitLabFilesHandler
  );

  fastify.put<{ Params: { fileId: string }; Body: UpdateFileContentBody }>(
    "/gitlab/files/:fileId",
    {
      onRequest: [authenticate],
    },
    updateGitLabFileHandler
  );
}
