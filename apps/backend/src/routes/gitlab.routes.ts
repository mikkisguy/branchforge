/**
 * GitLab Integration Routes
 *
 * Routes for GitLab integration and sync operations.
 * All routes require authentication.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  validateGitlabPAT,
  storeGitlabIntegration,
  deleteGitlabIntegration,
  listGitlabProjects,
  linkRepository,
  unlinkRepository,
  listBranches,
  listRpyFiles,
} from '../services/gitlab.service.js';
import {
  exportToGitlab,
  importFromGitlab,
  getSyncOperation,
  listSyncOperations,
  detectConflicts,
  type ConflictResolution,
} from '../services/gitlab-sync.service.js';

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
  const { token, gitlabUrl } = request.body;

  if (!token) {
    reply.status(400).send({ error: 'Token is required' });
    return;
  }

  const username = await validateGitlabPAT(token, gitlabUrl);

  if (!username) {
    reply.status(400).send({ error: 'Invalid GitLab token' });
    return;
  }

  reply.send({ valid: true, username });
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
  const userId = (request as any).userId;
  const { token, gitlabUrl } = request.body;

  if (!token) {
    reply.status(400).send({ error: 'Token is required' });
    return;
  }

  // Validate token before storing
  const username = await validateGitlabPAT(token, gitlabUrl);
  if (!username) {
    reply.status(400).send({ error: 'Invalid GitLab token' });
    return;
  }

  await storeGitlabIntegration(userId, token, gitlabUrl);
  reply.status(201).send();
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
  const userId = (request as any).userId;
  await deleteGitlabIntegration(userId);
  reply.status(204).send();
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
  reply: FastifyReply
): Promise<void> {
  const userId = (request as any).userId;
  const projects = await listGitlabProjects(userId);
  reply.send(projects);
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
  const { projectId, gitlabProjectId, branch = 'main' } = request.body;

  if (!projectId || !gitlabProjectId) {
    reply.status(400).send({ error: 'projectId and gitlabProjectId are required' });
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
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
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
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
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
  request: FastifyRequest<{ Params: { projectId: string }, Querystring: { branch?: string } }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const { branch } = request.query;

  if (!branch) {
    reply.status(400).send({ error: 'Branch is required' });
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
  reply: FastifyReply
): Promise<void> {
  const { projectId, branch, commitMessage } = request.body;

  if (!projectId) {
    reply.status(400).send({ error: 'projectId is required' });
    return;
  }

  const operation = await exportToGitlab(projectId, branch, commitMessage);
  reply.status(202).send(operation);
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
  const { projectId, branch, conflictResolution } = request.body;

  if (!projectId || !branch) {
    reply.status(400).send({ error: 'projectId and branch are required' });
    return;
  }

  const validResolutions: ConflictResolution[] = ['branchforge_wins', 'gitlab_wins', 'manual_review'];
  if (!validResolutions.includes(conflictResolution)) {
    reply.status(400).send({ error: 'Invalid conflictResolution' });
    return;
  }

  const operation = await importFromGitlab(projectId, branch, conflictResolution);
  reply.status(202).send(operation);
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
  const { operationId } = request.params;
  const operation = await getSyncOperation(operationId);

  if (!operation) {
    reply.status(404).send({ error: 'Operation not found' });
    return;
  }

  reply.send(operation);
}

/**
 * List sync operations
 *
 * GET /api/gitlab/operations/:projectId
 *
 * Returns a list of sync operations for a project.
 */
async function listOperationsHandler(
  request: FastifyRequest<{ Params: { projectId: string } }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
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
  reply: FastifyReply
): Promise<void> {
  const { projectId, branch } = request.body;

  if (!projectId || !branch) {
    reply.status(400).send({ error: 'projectId and branch are required' });
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
  fastify.post('/gitlab/validate', validateTokenHandler);

  // Integration management (require auth)
  fastify.post<{ Body: StoreIntegrationBody }>('/gitlab/integration', {
    onRequest: [authenticate],
  }, storeIntegrationHandler);

  fastify.delete('/gitlab/integration', {
    onRequest: [authenticate],
  }, deleteIntegrationHandler);

  fastify.get('/gitlab/projects', {
    onRequest: [authenticate],
  }, listProjectsHandler);

  // Repository linking (require auth)
  fastify.post<{ Body: LinkRepositoryBody }>('/gitlab/link', {
    onRequest: [authenticate],
  }, linkRepositoryHandler);

  fastify.delete<{ Params: { projectId: string } }>('/gitlab/unlink/:projectId', {
    onRequest: [authenticate],
  }, unlinkRepositoryHandler);

  fastify.get<{ Params: { projectId: string } }>('/gitlab/branches/:projectId', {
    onRequest: [authenticate],
  }, listBranchesHandler);

  fastify.get<{ Params: { projectId: string }, Querystring: { branch?: string } }>('/gitlab/files/:projectId', {
    onRequest: [authenticate],
  }, listFilesHandler);

  // Sync operations (require auth)
  fastify.post<{ Body: ExportBody }>('/gitlab/export', {
    onRequest: [authenticate],
  }, exportHandler);

  fastify.post<{ Body: ImportBody }>('/gitlab/import', {
    onRequest: [authenticate],
  }, importHandler);

  fastify.get<{ Params: { operationId: string } }>('/gitlab/operations/:operationId', {
    onRequest: [authenticate],
  }, getOperationHandler);

  fastify.get<{ Params: { projectId: string } }>('/gitlab/projects/:projectId/operations', {
    onRequest: [authenticate],
  }, listOperationsHandler);

  fastify.post<{ Body: DetectConflictsBody }>('/gitlab/detect-conflicts', {
    onRequest: [authenticate],
  }, detectConflictsHandler);
}
