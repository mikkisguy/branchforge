/**
 * GitLab Integration Routes
 *
 * Routes for GitLab integration and sync operations.
 * All routes require authentication.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authenticate } from "../middleware/auth.middleware.js";
import { validateBody } from "../middleware/validation.middleware.js";
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  ValidationError,
  RepositoryNotLinkedError,
} from "../middleware/error-handler.middleware.js";
import { checkRateLimit } from "../services/rate-limiter.service.js";
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
  importProjectFromGitLab,
  getGitLabFilesWithScenes,
  updateGitLabFileContent,
} from "../services/gitlab.service.js";
import {
  exportToGitlab,
  importFromGitlab,
  getSyncOperation,
  listSyncOperations,
  detectConflicts,
  type ConflictResolution,
} from "../services/gitlab-sync.service.js";
import {
  importProjectSchema,
  type ImportProjectInput,
  isValidConflictResolution,
} from "../lib/validation.js";

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
// Constants
// ============================================================================

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
      message: "An internal error occurred",
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
      message: "An internal error occurred",
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
      message: "An internal error occurred",
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
      message: "An internal error occurred",
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
      message: "An internal error occurred",
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

  try {
    // Fetch GitLab project details to get the repository name
    const gitlabProject = await getGitlabProject(userId, gitlabProjectId);
    if (!gitlabProject) {
      reply.status(404).send({ error: "GitLab project not found" });
      return;
    }

    // Use path_with_namespace as the repository name (more descriptive)
    const repositoryName = gitlabProject.path_with_namespace;

    await linkRepository(
      projectId,
      gitlabProjectId,
      repositoryName,
      branch,
      userId
    );
    reply.status(201).send();
  } catch (err) {
    request.log.error(
      { err },
      "linkRepositoryHandler: Failed to link repository"
    );

    // Rethrow NotFoundError and ConflictError to let global error handler return appropriate status
    if (err instanceof NotFoundError || err instanceof ConflictError) {
      throw err;
    }

    reply.status(500).send({
      error: "Failed to link repository",
      message: "An internal error occurred",
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

  try {
    await unlinkRepository(projectId, userId);
    reply.status(204).send();
  } catch (err) {
    if (err instanceof NotFoundError) {
      reply.status(404).send({ error: "Not Found", message: err.message });
    } else if (err instanceof ForbiddenError) {
      reply.status(403).send({ error: "Forbidden", message: err.message });
    } else {
      request.log.error(
        { err, projectId },
        "unlinkRepositoryHandler: Failed to unlink repository"
      );
      reply.status(500).send({
        error: "Failed to unlink repository",
        message: "An internal error occurred",
      });
    }
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
      message: "An internal error occurred",
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

  try {
    const branches = await listBranches(projectId, userId);
    reply.send(branches);
  } catch (err) {
    // Return empty array if repository not linked (normal state, not an error)
    if (err instanceof RepositoryNotLinkedError) {
      reply.send([]);
      return;
    }

    request.log.error(
      { err, projectId },
      "listBranchesHandler: Failed to list branches"
    );

    if (err instanceof NotFoundError) {
      reply.status(404).send({ error: "Not Found", message: err.message });
    } else if (err instanceof ForbiddenError) {
      reply.status(403).send({ error: "Forbidden", message: err.message });
    } else if (
      err instanceof Error &&
      err.message.startsWith("GitLab API error:")
    ) {
      reply.status(502).send({
        error: "Failed to fetch branches from GitLab",
        message: "Unable to communicate with GitLab. Please try again later.",
      });
      return;
    }

    reply.status(500).send({
      error: "Failed to list branches",
      message: "An internal error occurred",
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

  try {
    const files = await listRpyFiles(projectId, branch, userId);
    reply.send(files);
  } catch (err) {
    // Return empty array if repository not linked (normal state, not an error)
    if (err instanceof RepositoryNotLinkedError) {
      reply.send([]);
      return;
    }

    request.log.error(
      { err, projectId, branch },
      "listFilesHandler: Failed to list RPY files"
    );

    if (err instanceof NotFoundError) {
      reply.status(404).send({ error: "Not Found", message: err.message });
    } else if (err instanceof ForbiddenError) {
      reply.status(403).send({ error: "Forbidden", message: err.message });
    } else if (
      err instanceof Error &&
      err.message.startsWith("GitLab API error:")
    ) {
      reply.status(502).send({
        error: "Failed to fetch files from GitLab",
        message: "Unable to communicate with GitLab. Please try again later.",
      });
      return;
    }

    reply.status(500).send({
      error: "Failed to list RPY files",
      message: "An internal error occurred",
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

  try {
    const operation = await exportToGitlab(
      projectId,
      userId,
      branch,
      commitMessage
    );
    reply.status(202).send(operation);
  } catch (err) {
    if (err instanceof NotFoundError) {
      reply.status(404).send({ error: "Not Found", message: err.message });
    } else if (err instanceof ForbiddenError) {
      reply.status(403).send({ error: "Forbidden", message: err.message });
    } else {
      request.log.error(
        { err, projectId },
        "exportHandler: Failed to export to GitLab"
      );
      reply.status(500).send({
        error: "Failed to export to GitLab",
        message: "An internal error occurred",
      });
    }
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

  if (!isValidConflictResolution(conflictResolution)) {
    reply.status(400).send({ error: "Invalid conflictResolution" });
    return;
  }

  try {
    const operation = await importFromGitlab(
      projectId,
      userId,
      branch,
      conflictResolution
    );
    reply.status(202).send(operation);
  } catch (err) {
    if (err instanceof NotFoundError) {
      reply.status(404).send({ error: "Not Found", message: err.message });
    } else if (err instanceof ForbiddenError) {
      reply.status(403).send({ error: "Forbidden", message: err.message });
    } else {
      request.log.error(
        { err, projectId },
        "importHandler: Failed to import from GitLab"
      );
      reply.status(500).send({
        error: "Failed to import from GitLab",
        message: "An internal error occurred",
      });
    }
  }
}

/**
 * Import project from GitLab
 *
 * POST /api/gitlab/import-project
 * Body: { projectName, projectDescription?, gitlabProjectId, gitlabProjectName, branch, conflictResolution }
 *
 * Creates a new project, links it to a GitLab repository, and imports files.
 */
async function importProjectHandler(
  request: FastifyRequest<{ Body: ImportProjectInput }>,
  reply: FastifyReply
): Promise<void> {
  const clientIp = getClientIp(request);

  // Check rate limit to prevent abuse
  const rateLimit = checkRateLimit(clientIp);
  if (!rateLimit.allowed) {
    request.log.warn(
      { ip: clientIp, retryAfter: rateLimit.retryAfter },
      "importProjectHandler: Rate limit exceeded"
    );
    reply.status(429).send({
      error: "Too many import requests. Please try again later.",
      retryAfter: rateLimit.retryAfter,
    });
    return;
  }

  const userId = getAuthenticatedUserId(request);
  const {
    projectName,
    projectDescription,
    gitlabProjectId,
    branch,
    conflictResolution,
  } = request.body;

  try {
    const result = await importProjectFromGitLab(userId, {
      projectName,
      projectDescription,
      gitlabProjectId,
      branch,
      conflictResolution,
    });
    reply.status(202).send(result);
  } catch (err) {
    if (err instanceof ConflictError) {
      reply.status(409).send({
        error: "Repository already linked",
        message: "This repository is already linked to your project.",
      });
    } else if (err instanceof NotFoundError) {
      reply.status(404).send({ error: "Not Found", message: err.message });
    } else if (err instanceof ValidationError) {
      reply
        .status(400)
        .send({ error: "Validation Error", message: err.message });
    } else {
      request.log.error(
        { err },
        "importProjectHandler: Failed to import project from GitLab"
      );
      reply.status(500).send({
        error: "Failed to import project from GitLab",
        message: "An internal error occurred",
      });
    }
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

  try {
    const operation = await getSyncOperation(operationId, userId);

    if (!operation) {
      reply
        .status(404)
        .send({ error: "Not Found", message: "Sync operation not found" });
      return;
    }

    reply.send(operation);
  } catch (err) {
    if (err instanceof NotFoundError) {
      reply.status(404).send({ error: "Not Found", message: err.message });
    } else if (err instanceof ForbiddenError) {
      reply.status(403).send({ error: "Forbidden", message: err.message });
    } else {
      request.log.error(
        { err, operationId },
        "getOperationHandler: Failed to get sync operation"
      );
      reply.status(500).send({
        error: "Failed to get sync operation",
        message: "An internal error occurred",
      });
    }
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

  try {
    const operations = await listSyncOperations(projectId, userId);
    reply.send(operations);
  } catch (err) {
    if (err instanceof NotFoundError) {
      reply.status(404).send({ error: "Not Found", message: err.message });
    } else if (err instanceof ForbiddenError) {
      reply.status(403).send({ error: "Forbidden", message: err.message });
    } else {
      request.log.error(
        { err, projectId },
        "listOperationsHandler: Failed to list sync operations"
      );
      reply.status(500).send({
        error: "Failed to list sync operations",
        message: "An internal error occurred",
      });
    }
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

  try {
    const result = await detectConflicts(projectId, userId, branch);
    reply.send(result);
  } catch (err) {
    if (err instanceof NotFoundError) {
      reply.status(404).send({ error: "Not Found", message: err.message });
    } else if (err instanceof ForbiddenError) {
      reply.status(403).send({ error: "Forbidden", message: err.message });
    } else {
      request.log.error(
        { err, projectId, branch },
        "detectConflictsHandler: Failed to detect conflicts"
      );
      reply.status(500).send({
        error: "Failed to detect conflicts",
        message: "An internal error occurred",
      });
    }
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

  try {
    const files = await getGitLabFilesWithScenes(projectId, userId);
    reply.send(files);
  } catch (err) {
    if (err instanceof NotFoundError) {
      reply.status(404).send({ error: "Not Found", message: err.message });
    } else if (err instanceof ForbiddenError) {
      reply.status(403).send({ error: "Forbidden", message: err.message });
    } else {
      request.log.error(
        { err, projectId },
        "getGitLabFilesHandler: Failed to get GitLab files"
      );
      reply.status(500).send({
        error: "Failed to get GitLab files",
        message: "An internal error occurred",
      });
    }
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
    const result = await updateGitLabFileContent(fileId, content, userId);
    reply.send(result);
  } catch (err) {
    if (err instanceof NotFoundError) {
      reply.status(404).send({ error: "Not Found", message: err.message });
    } else if (err instanceof ForbiddenError) {
      reply.status(403).send({ error: "Forbidden", message: err.message });
    } else if (err instanceof ConflictError) {
      reply.status(409).send({
        error: "Sync already in progress",
        message: err.message,
      });
    } else {
      request.log.error(
        { err, fileId },
        "updateGitLabFileHandler: Failed to update GitLab file"
      );
      reply.status(500).send({
        error: "Failed to update GitLab file",
        message: "An internal error occurred",
      });
    }
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

  fastify.post<{ Body: ImportProjectInput }>(
    "/gitlab/import-project",
    {
      onRequest: [authenticate],
      preValidation: validateBody(importProjectSchema),
    },
    importProjectHandler
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
