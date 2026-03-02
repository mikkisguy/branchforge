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
import { projects, gitlabSyncOperations } from "../db/schema/index.js";
import { eq } from "drizzle-orm";
import {
  validateGitlabPAT,
  storeGitlabIntegration,
  deleteGitlabIntegration,
  listGitlabProjects,
  linkRepository,
  unlinkRepository,
  listBranches,
  listRpyFiles,
} from "../services/gitlab.service.js";
import {
  exportToGitlab,
  importFromGitlab,
  getSyncOperation,
  listSyncOperations,
  detectConflicts,
  type ConflictResolution,
} from "../services/gitlab-sync.service.js";

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

interface ValidateTokenResponse {
  valid: boolean;
  username?: string;
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
  reply: FastifyReply,
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
  reply: FastifyReply,
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
  reply: FastifyReply,
): Promise<void> {
  const clientIp = getClientIp(request);

  // Check rate limit to prevent brute-force/DoS attacks
  const rateLimit = checkRateLimit(clientIp);
  if (!rateLimit.allowed) {
    request.log.warn(
      { ip: clientIp, retryAfter: rateLimit.retryAfter },
      "validateTokenHandler: Rate limit exceeded",
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
      "validateTokenHandler: Failed to validate GitLab token",
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
  reply: FastifyReply,
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
      "storeIntegrationHandler: Failed to store GitLab integration",
    );
    reply.status(500).send({
      error: "Failed to store integration",
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
  reply: FastifyReply,
): Promise<void> {
  const userId = getAuthenticatedUserId(request);

  try {
    await deleteGitlabIntegration(userId);
    reply.status(204).send();
  } catch (err) {
    request.log.error(
      { err },
      "deleteIntegrationHandler: Failed to delete GitLab integration",
    );
    reply.status(500).send({
      error: "Failed to delete integration",
      details: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

/**
 * List GitLab projects
 *
 * GET /api/gitlab/projects
 *
 * Returns a list of GitLab projects accessible to the user.
 */
async function listProjectsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const userId = getAuthenticatedUserId(request);
    const projects = await listGitlabProjects(userId);
    reply.send(projects);
  } catch (err) {
    if (
      err instanceof Error &&
      err.message === "GitLab integration not found"
    ) {
      reply.status(404).send({ error: "GitLab integration not found" });
    } else {
      reply.status(500).send({
        error: "Failed to list GitLab projects",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
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
  reply: FastifyReply,
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

  await linkRepository(projectId, gitlabProjectId, branch);
  reply.status(201).send();
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
  reply: FastifyReply,
): Promise<void> {
  const userId = getAuthenticatedUserId(request);
  const { projectId } = request.params;

  // Verify user owns the project
  if (!(await authorizeProjectAccess(projectId, userId, reply))) {
    return;
  }

  await unlinkRepository(projectId);
  reply.status(204).send();
}

/**
 * List branches
 *
 * GET /api/gitlab/branches/:projectId
 *
 * Returns a list of branches in the linked GitLab repository.
 */
async function listBranchesHandler(
  request: FastifyRequest<{ Params: { projectId: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = getAuthenticatedUserId(request);
  const { projectId } = request.params;

  // Verify user owns the project
  if (!(await authorizeProjectAccess(projectId, userId, reply))) {
    return;
  }

  const branches = await listBranches(projectId);
  reply.send(branches);
}

/**
 * List RPY files
 *
 * GET /api/gitlab/files/:projectId?branch=xxx
 *
 * Returns a list of .rpy files in the linked GitLab repository.
 */
async function listFilesHandler(
  request: FastifyRequest<{
    Params: { projectId: string };
    Querystring: { branch?: string };
  }>,
  reply: FastifyReply,
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

  const files = await listRpyFiles(projectId, branch);
  reply.send(files);
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
  reply: FastifyReply,
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
      "exportHandler: Failed to export to GitLab",
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
  reply: FastifyReply,
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
      conflictResolution,
    );
    reply.status(202).send(operation);
  } catch (err) {
    request.log.error(
      { err, projectId },
      "importHandler: Failed to import from GitLab",
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
  reply: FastifyReply,
): Promise<void> {
  const userId = getAuthenticatedUserId(request);
  const { operationId } = request.params;

  // Verify user owns the project associated with this operation
  if (!(await authorizeSyncOperationAccess(operationId, userId, reply))) {
    return;
  }

  const operation = await getSyncOperation(operationId);

  if (!operation) {
    reply.status(404).send({ error: "Not Found", message: "Sync operation not found" });
    return;
  }

  reply.send(operation);
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
  reply: FastifyReply,
): Promise<void> {
  const userId = getAuthenticatedUserId(request);
  const { projectId } = request.params;

  // Verify user owns the project
  if (!(await authorizeProjectAccess(projectId, userId, reply))) {
    return;
  }

  const operations = await listSyncOperations(projectId);
  reply.send(operations);
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
  reply: FastifyReply,
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

  const result = await detectConflicts(projectId, branch);
  reply.send(result);
}

// ============================================================================
// Routes Registration
// ============================================================================

export async function gitlabRoutes(fastify: FastifyInstance): Promise<void> {
  // Token validation (no auth required)
  fastify.post("/gitlab/validate", validateTokenHandler);

  // Integration management (require auth)
  fastify.post<{ Body: StoreIntegrationBody }>(
    "/gitlab/integration",
    {
      onRequest: [authenticate],
    },
    storeIntegrationHandler,
  );

  fastify.delete(
    "/gitlab/integration",
    {
      onRequest: [authenticate],
    },
    deleteIntegrationHandler,
  );

  fastify.get(
    "/gitlab/projects",
    {
      onRequest: [authenticate],
    },
    listProjectsHandler,
  );

  // Repository linking (require auth)
  fastify.post<{ Body: LinkRepositoryBody }>(
    "/gitlab/link",
    {
      onRequest: [authenticate],
    },
    linkRepositoryHandler,
  );

  fastify.delete<{ Params: { projectId: string } }>(
    "/gitlab/unlink/:projectId",
    {
      onRequest: [authenticate],
    },
    unlinkRepositoryHandler,
  );

  fastify.get<{ Params: { projectId: string } }>(
    "/gitlab/branches/:projectId",
    {
      onRequest: [authenticate],
    },
    listBranchesHandler,
  );

  fastify.get<{
    Params: { projectId: string };
    Querystring: { branch?: string };
  }>(
    "/gitlab/files/:projectId",
    {
      onRequest: [authenticate],
    },
    listFilesHandler,
  );

  // Sync operations (require auth)
  fastify.post<{ Body: ExportBody }>(
    "/gitlab/export",
    {
      onRequest: [authenticate],
    },
    exportHandler,
  );

  fastify.post<{ Body: ImportBody }>(
    "/gitlab/import",
    {
      onRequest: [authenticate],
    },
    importHandler,
  );

  fastify.get<{ Params: { operationId: string } }>(
    "/gitlab/operations/:operationId",
    {
      onRequest: [authenticate],
    },
    getOperationHandler,
  );

  fastify.get<{ Params: { projectId: string } }>(
    "/gitlab/projects/:projectId/operations",
    {
      onRequest: [authenticate],
    },
    listOperationsHandler,
  );

  fastify.post<{ Body: DetectConflictsBody }>(
    "/gitlab/detect-conflicts",
    {
      onRequest: [authenticate],
    },
    detectConflictsHandler,
  );
}

