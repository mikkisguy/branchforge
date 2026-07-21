/**
 * GitLab Sync Routes
 *
 * Sub-plugin for GitLab sync operations: export, import, import-project,
 * get/list operations, and conflict detection.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  validateBody,
  validateParams,
} from "../middleware/validation.middleware.js";
import {
  ConflictError,
  NotFoundError,
} from "../middleware/error-handler.middleware.js";
import { checkRateLimit } from "../services/rate-limiter.service.js";
import {
  exportToGitlab,
  importFromGitlab,
  getSyncOperation,
  listSyncOperations,
  detectConflicts,
} from "../services/gitlab-sync.service.js";
import { importProjectFromGitLab } from "../services/gitlab.service.js";
import {
  exportToGitlabSchema,
  importFromGitlabSchema,
  importProjectSchema,
  detectConflictsSchema,
  operationIdParamsSchema,
  projectIdParamsSchema,
  type ExportToGitlabInput,
  type ImportFromGitlabInput,
  type ImportProjectInput,
  type DetectConflictsInput,
  type OperationIdParams,
} from "../lib/validation.js";
import {
  getAuthenticatedUserId,
  handleKnownRouteErrors,
} from "../lib/gitlab-route-helpers.js";

/**
 * Export to GitLab
 *
 * POST /api/gitlab/export
 * Body: { projectId: string, branch?: string, commitMessage: string }
 *
 * Exports BranchForge scenes to GitLab as RPY files.
 */
async function exportHandler(
  request: FastifyRequest<{ Body: ExportToGitlabInput }>,
  reply: FastifyReply
): Promise<void> {
  const userId = getAuthenticatedUserId(request);
  const { projectId, branch, commitMessage } = request.body;

  try {
    const operation = await exportToGitlab(
      projectId,
      userId,
      branch,
      commitMessage
    );
    reply.status(202).send(operation);
  } catch (err) {
    if (handleKnownRouteErrors(err, reply)) return;
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

/**
 * Import from GitLab
 *
 * POST /api/gitlab/import
 * Body: { projectId: string, branch: string, conflictResolution: ConflictResolution }
 *
 * Imports RPY files from GitLab to BranchForge.
 */
async function importHandler(
  request: FastifyRequest<{ Body: ImportFromGitlabInput }>,
  reply: FastifyReply
): Promise<void> {
  const userId = getAuthenticatedUserId(request);
  const { projectId, branch, conflictResolution } = request.body;

  try {
    const operation = await importFromGitlab(
      projectId,
      userId,
      branch,
      conflictResolution
    );
    reply.status(202).send(operation);
  } catch (err) {
    if (handleKnownRouteErrors(err, reply)) return;
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
  const clientIp = request.ip;

  // Check rate limit to prevent abuse
  const rateLimit = checkRateLimit(`gitlabImportProject:${clientIp}`);
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
      return;
    }
    if (err instanceof NotFoundError) {
      reply.status(404).send({ error: "Not Found", message: err.message });
      return;
    }
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

/**
 * Get sync operation status
 *
 * GET /api/gitlab/operations/:operationId
 *
 * Returns the status of a sync operation.
 */
async function getOperationHandler(
  request: FastifyRequest<{ Params: OperationIdParams }>,
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
    if (handleKnownRouteErrors(err, reply)) return;
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
    if (handleKnownRouteErrors(err, reply)) return;
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

/**
 * Detect conflicts
 *
 * POST /api/gitlab/detect-conflicts
 * Body: { projectId: string, branch: string }
 *
 * Detects conflicts between local and remote versions.
 */
async function detectConflictsHandler(
  request: FastifyRequest<{ Body: DetectConflictsInput }>,
  reply: FastifyReply
): Promise<void> {
  const userId = getAuthenticatedUserId(request);
  const { projectId, branch } = request.body;

  try {
    const result = await detectConflicts(projectId, userId, branch);
    reply.send(result);
  } catch (err) {
    if (handleKnownRouteErrors(err, reply)) return;
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

export async function gitlabSyncRoutes(
  fastify: FastifyInstance
): Promise<void> {
  // Sync operations (require auth)
  fastify.post<{ Body: ExportToGitlabInput }>(
    "/gitlab/export",
    {
      onRequest: [authenticate],
      preValidation: validateBody(exportToGitlabSchema),
    },
    exportHandler
  );

  fastify.post<{ Body: ImportFromGitlabInput }>(
    "/gitlab/import",
    {
      onRequest: [authenticate],
      preValidation: validateBody(importFromGitlabSchema),
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

  fastify.get<{ Params: OperationIdParams }>(
    "/gitlab/operations/:operationId",
    {
      onRequest: [authenticate],
      preValidation: validateParams(operationIdParamsSchema),
    },
    getOperationHandler
  );

  fastify.get<{ Params: { projectId: string } }>(
    "/gitlab/projects/:projectId/operations",
    {
      onRequest: [authenticate],
      preValidation: validateParams(projectIdParamsSchema),
    },
    listOperationsHandler
  );

  fastify.post<{ Body: DetectConflictsInput }>(
    "/gitlab/detect-conflicts",
    {
      onRequest: [authenticate],
      preValidation: validateBody(detectConflictsSchema),
    },
    detectConflictsHandler
  );
}
