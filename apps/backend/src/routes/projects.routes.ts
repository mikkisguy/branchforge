/**
 * Projects Routes
 *
 * Routes for project management operations including listing, getting, creating, updating, and deleting projects.
 */

import type { FastifyInstance } from "fastify";
import type { FastifyRequest, FastifyReply } from "fastify";
import {
  listProjects,
  getProject,
  updateProject,
  deleteProject,
  getProjectFiles,
  createProjectFile,
  updateFileContent,
} from "../services/projects.service.js";
import type {
  CreateProjectFileResponse,
  PublicProject,
  SourceOrigin,
} from "@branchforge/shared";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  validateParams,
  validateBody,
  validateRequest,
} from "../middleware/validation.middleware.js";
import {
  updateProjectSchema,
  projectIdParamsSchema,
  projectFilesQuerySchema,
  createProjectFileSchema,
  fileIdParamsSchema,
  updateFileContentSchema,
  renameProjectFileSchema,
  type RenameProjectFileInput,
  type UpdateFileContentInput,
  type UpdateProjectInput,
  type CreateProjectFileInput,
} from "../lib/validation.js";
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
} from "../middleware/error-handler.middleware.js";
import {
  renameProjectFile,
  deleteProjectFile,
  getDeleteImpact,
  getPendingStructuralSummary,
  reverseOneOperation,
  discardAllOperations,
} from "../services/project-files-operations.service.js";

// ============================================================================
// Types
// ============================================================================

interface ListProjectsResponse {
  projects: PublicProject[];
}

interface GetProjectParams {
  projectId: string;
}

interface GetProjectResponse {
  project: PublicProject;
}

interface UpdateProjectResponse {
  project: PublicProject;
}

interface ErrorResponse {
  error: string;
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * List all projects for the authenticated user
 *
 * GET /projects
 * Requires authentication
 */
async function listProjectsHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const user = request.user!;

  const projects = await listProjects(user.id);

  reply.status(200).send({ projects } as ListProjectsResponse);
}

/**
 * Get a single project by ID
 *
 * GET /projects/:projectId
 * Requires authentication
 */
async function getProjectHandler(
  request: FastifyRequest<{ Params: GetProjectParams }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const user = request.user!;

  const project = await getProject(projectId, user.id);

  if (!project) {
    reply.status(404).send({ error: "Project not found" } as ErrorResponse);
    return;
  }

  reply.status(200).send({ project } as GetProjectResponse);
}

/**
 * NOTE: Generic project creation endpoint has been removed.
 *
 * Projects must be created through import flows:
 * - POST /api/gitlab/import-project (GitLab import)
 * - POST /api/projects/import/zip (ZIP file import)
 *
 * There is no generic project creation UI or API endpoint.
 */

/**
 * Update an existing project
 *
 * PATCH /projects/:projectId
 * Requires authentication
 */
async function updateProjectHandler(
  request: FastifyRequest<{
    Params: { projectId: string };
    Body: UpdateProjectInput;
  }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const body = request.body;
  const user = request.user!;

  try {
    const project = await updateProject(user.id, projectId, body);

    reply.status(200).send({ project } as UpdateProjectResponse);
  } catch (error) {
    request.log.error(
      { err: error, projectId },
      `updateProjectHandler: Failed to update project: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );

    if (error instanceof NotFoundError) {
      reply.status(404).send({ error: "Not found" } as ErrorResponse);
      return;
    }
    if (error instanceof ForbiddenError) {
      reply.status(403).send({ error: "Forbidden" } as ErrorResponse);
      return;
    }
    reply.status(500).send({ error: "Internal server error" } as ErrorResponse);
  }
}

/**
 * Delete a project permanently.
 *
 * DELETE /projects/:projectId
 * Requires authentication
 */
async function deleteProjectHandler(
  request: FastifyRequest<{ Params: { projectId: string } }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const user = request.user!;

  try {
    await deleteProject(user.id, projectId);

    reply.status(204).send();
  } catch (error) {
    request.log.error(
      { err: error, projectId },
      `deleteProjectHandler: Failed to delete project: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );

    if (error instanceof NotFoundError) {
      reply.status(404).send({ error: "Not found" } as ErrorResponse);
      return;
    }
    if (error instanceof ForbiddenError) {
      reply.status(403).send({ error: "Forbidden" } as ErrorResponse);
      return;
    }
    reply.status(500).send({ error: "Internal server error" } as ErrorResponse);
  }
}

/**
 * Get all project files with their labels
 *
 * GET /projects/:projectId/files
 * Requires authentication
 *
 * Returns all project files (GitLab, zip, etc.) with their associated labels.
 * Labels are only included for STORY type files.
 */
async function getProjectFilesHandler(
  request: FastifyRequest<{
    Params: { projectId: string };
    Querystring: { source?: SourceOrigin };
  }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const { source } = request.query;
  const user = request.user!;

  try {
    const result = await getProjectFiles(projectId, user.id, source);
    reply.send(result);
  } catch (err) {
    if (err instanceof NotFoundError) {
      reply.status(404).send({ error: "Project not found" });
      return;
    }
    if (err instanceof ForbiddenError) {
      reply.status(403).send({ error: "Forbidden" });
      return;
    }
    request.log.error(
      { err, projectId },
      `getProjectFilesHandler: Failed to get project files: ${
        err instanceof Error ? err.message : "Unknown error"
      }`
    );
    reply.status(500).send({ error: "Failed to get project files" });
  }
}

/**
 * Create a new empty project file
 *
 * POST /projects/:projectId/files
 * Body: { filePath: string }
 * Requires authentication and project ownership
 */
async function createProjectFileHandler(
  request: FastifyRequest<{
    Params: { projectId: string };
    Body: CreateProjectFileInput;
  }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const { filePath } = request.body;
  const user = request.user!;

  try {
    const file = await createProjectFile(projectId, user.id, filePath);
    const response: CreateProjectFileResponse = {
      file: {
        ...file,
        lastSyncedAt: file.lastSyncedAt?.toISOString() ?? null,
        createdAt: file.createdAt.toISOString(),
        updatedAt: file.updatedAt.toISOString(),
      },
    };
    reply.status(201).send(response);
  } catch (err) {
    if (err instanceof NotFoundError) {
      reply.status(404).send({ error: "Project not found" });
      return;
    }
    if (err instanceof ForbiddenError) {
      reply.status(403).send({ error: "Forbidden" });
      return;
    }
    if (err instanceof ValidationError) {
      reply.status(400).send({ error: err.userMessage } as ErrorResponse);
      return;
    }
    if (err instanceof ConflictError) {
      reply.status(409).send({ error: err.userMessage } as ErrorResponse);
      return;
    }
    request.log.error(
      { err, projectId },
      `createProjectFileHandler: Failed to create project file: ${
        err instanceof Error ? err.message : "Unknown error"
      }`
    );
    reply.status(500).send({ error: "Failed to create project file" });
  }
}

/**
 * Update file content
 *
 * PUT /projects/files/:fileId
 * Body: { content: string }
 *
 * Updates file content and syncs labels from the updated content.
 * This is the unified endpoint used by both script mode and write mode.
 */
async function updateFileContentHandler(
  request: FastifyRequest<{
    Params: { fileId: string };
    Body: UpdateFileContentInput;
  }>,
  reply: FastifyReply
): Promise<void> {
  const { fileId } = request.params;
  const { content, expectedContentHash } = request.body;
  const user = request.user!;

  try {
    const result = await updateFileContent(
      fileId,
      user.id,
      content,
      expectedContentHash
    );

    reply.status(200).send(result);
  } catch (err) {
    request.log.error(
      { err, fileId },
      `updateFileContentHandler: Failed to update file content: ${
        err instanceof Error ? err.message : "Unknown error"
      }`
    );

    if (err instanceof NotFoundError) {
      reply.status(404).send({ error: err.userMessage } as ErrorResponse);
      return;
    }
    if (err instanceof ForbiddenError) {
      reply.status(403).send({ error: err.userMessage } as ErrorResponse);
      return;
    }
    if (err instanceof ValidationError) {
      reply.status(400).send({ error: err.userMessage } as ErrorResponse);
      return;
    }
    if (err instanceof ConflictError) {
      if (err.reason && err.currentContentHash) {
        reply.status(409).send({
          success: false,
          conflict: {
            reason: err.reason,
            currentContentHash: err.currentContentHash,
          },
        });
        return;
      }
      reply.status(409).send({ error: err.userMessage } as ErrorResponse);
      return;
    }
    reply.status(500).send({ error: "Internal server error" } as ErrorResponse);
  }
}

/**
 * Rename or move a project file.
 *
 * PATCH /projects/files/:fileId
 * Body: { filePath: string, expectedContentHash?: string }
 */
async function renameProjectFileHandler(
  request: FastifyRequest<{
    Params: { fileId: string };
    Body: RenameProjectFileInput;
  }>,
  reply: FastifyReply
): Promise<void> {
  const { fileId } = request.params;
  const { filePath, expectedContentHash } = request.body;
  const user = request.user!;

  try {
    const result = await renameProjectFile(
      fileId,
      user.id,
      filePath,
      expectedContentHash
    );
    reply.status(200).send({
      file: {
        ...result.file,
        lastSyncedAt: result.file.lastSyncedAt?.toISOString() ?? null,
        createdAt: result.file.createdAt.toISOString(),
        updatedAt: result.file.updatedAt.toISOString(),
      },
      operation: result.operation,
    });
  } catch (err) {
    request.log.error(
      { err, fileId },
      `renameProjectFileHandler: Failed to rename file: ${
        err instanceof Error ? err.message : "Unknown error"
      }`
    );

    if (err instanceof NotFoundError) {
      reply.status(404).send({ error: err.userMessage } as ErrorResponse);
      return;
    }
    if (err instanceof ForbiddenError) {
      reply.status(403).send({ error: err.userMessage } as ErrorResponse);
      return;
    }
    if (err instanceof ValidationError) {
      reply.status(400).send({ error: err.userMessage } as ErrorResponse);
      return;
    }
    if (err instanceof ConflictError) {
      reply.status(409).send({ error: err.userMessage } as ErrorResponse);
      return;
    }
    reply.status(500).send({ error: "Internal server error" } as ErrorResponse);
  }
}

/**
 * Get delete-impact for a project file.
 *
 * POST /projects/files/:fileId/delete-impact
 */
async function getDeleteImpactHandler(
  request: FastifyRequest<{ Params: { fileId: string } }>,
  reply: FastifyReply
): Promise<void> {
  const { fileId } = request.params;
  const user = request.user!;

  try {
    const impact = await getDeleteImpact(fileId, user.id);
    reply.status(200).send({ impact });
  } catch (err) {
    request.log.error(
      { err, fileId },
      `getDeleteImpactHandler: Failed to get delete impact: ${
        err instanceof Error ? err.message : "Unknown error"
      }`
    );

    if (err instanceof NotFoundError) {
      reply.status(404).send({ error: err.userMessage } as ErrorResponse);
      return;
    }
    if (err instanceof ForbiddenError) {
      reply.status(403).send({ error: err.userMessage } as ErrorResponse);
      return;
    }
    reply.status(500).send({ error: "Internal server error" } as ErrorResponse);
  }
}

/**
 * Delete a project file.
 *
 * DELETE /projects/files/:fileId
 */
async function deleteProjectFileHandler(
  request: FastifyRequest<{ Params: { fileId: string } }>,
  reply: FastifyReply
): Promise<void> {
  const { fileId } = request.params;
  const user = request.user!;

  try {
    const result = await deleteProjectFile(fileId, user.id);
    reply.status(200).send({
      file: {
        ...result.file,
        lastSyncedAt: result.file.lastSyncedAt?.toISOString() ?? null,
        createdAt: result.file.createdAt.toISOString(),
        updatedAt: result.file.updatedAt.toISOString(),
      },
      operation: result.operation,
      hardDeleted: result.hardDeleted,
    });
  } catch (err) {
    request.log.error(
      { err, fileId },
      `deleteProjectFileHandler: Failed to delete file: ${
        err instanceof Error ? err.message : "Unknown error"
      }`
    );

    if (err instanceof NotFoundError) {
      reply.status(404).send({ error: err.userMessage } as ErrorResponse);
      return;
    }
    if (err instanceof ForbiddenError) {
      reply.status(403).send({ error: err.userMessage } as ErrorResponse);
      return;
    }
    if (err instanceof ValidationError) {
      reply.status(400).send({ error: err.userMessage } as ErrorResponse);
      return;
    }
    if (err instanceof ConflictError) {
      reply.status(409).send({ error: err.userMessage } as ErrorResponse);
      return;
    }
    reply.status(500).send({ error: "Internal server error" } as ErrorResponse);
  }
}

/**
 * Get pending structural summary for a project.
 *
 * GET /projects/:projectId/files/pending-structural
 */
async function getPendingStructuralSummaryHandler(
  request: FastifyRequest<{ Params: { projectId: string } }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const user = request.user!;

  try {
    const summary = await getPendingStructuralSummary(projectId, user.id);
    reply.status(200).send(summary);
  } catch (err) {
    request.log.error(
      { err, projectId },
      `getPendingStructuralSummaryHandler: Failed to get pending summary: ${
        err instanceof Error ? err.message : "Unknown error"
      }`
    );

    if (err instanceof NotFoundError) {
      reply.status(404).send({ error: err.userMessage } as ErrorResponse);
      return;
    }
    if (err instanceof ForbiddenError) {
      reply.status(403).send({ error: err.userMessage } as ErrorResponse);
      return;
    }
    reply.status(500).send({ error: "Internal server error" } as ErrorResponse);
  }
}

/**
 * Reverse the most recent pending operation on a file.
 *
 * POST /projects/files/:fileId/reverse
 */
async function reverseOneOperationHandler(
  request: FastifyRequest<{ Params: { fileId: string } }>,
  reply: FastifyReply
): Promise<void> {
  const { fileId } = request.params;
  const user = request.user!;

  try {
    const result = await reverseOneOperation(fileId, user.id);
    reply.status(200).send({
      success: result.reversed,
      reversed: result.reversed,
      operation: result.operation,
    });
  } catch (err) {
    request.log.error(
      { err, fileId },
      `reverseOneOperationHandler: Failed to reverse operation: ${
        err instanceof Error ? err.message : "Unknown error"
      }`
    );

    if (err instanceof NotFoundError) {
      reply.status(404).send({ error: err.userMessage } as ErrorResponse);
      return;
    }
    if (err instanceof ForbiddenError) {
      reply.status(403).send({ error: err.userMessage } as ErrorResponse);
      return;
    }
    reply.status(500).send({ error: "Internal server error" } as ErrorResponse);
  }
}

/**
 * Discard all pending structural operations in a project, restoring every
 * affected file to its actual pre-operation state.
 *
 * POST /projects/:projectId/files/discard-all
 */
async function discardAllOperationsHandler(
  request: FastifyRequest<{ Params: { projectId: string } }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const user = request.user!;

  try {
    const result = await discardAllOperations(projectId, user.id);
    reply.status(200).send({
      success: result.discarded,
      discarded: result.discarded,
      count: result.count,
    });
  } catch (err) {
    request.log.error(
      { err, projectId },
      `discardAllOperationsHandler: Failed to discard operations: ${
        err instanceof Error ? err.message : "Unknown error"
      }`
    );

    if (err instanceof NotFoundError) {
      reply.status(404).send({ error: err.userMessage } as ErrorResponse);
      return;
    }
    if (err instanceof ForbiddenError) {
      reply.status(403).send({ error: err.userMessage } as ErrorResponse);
      return;
    }
    reply.status(500).send({ error: "Internal server error" } as ErrorResponse);
  }
}

// ============================================================================
// Routes Registration
// ============================================================================

export async function projectsRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.get("/projects", { onRequest: authenticate }, listProjectsHandler);
  fastify.get<{ Params: GetProjectParams }>(
    "/projects/:projectId",
    {
      onRequest: authenticate,
      preValidation: validateParams(projectIdParamsSchema),
    },
    getProjectHandler
  );
  fastify.patch<{ Params: { projectId: string }; Body: UpdateProjectInput }>(
    "/projects/:projectId",
    {
      onRequest: authenticate,
      preValidation: validateRequest({
        params: projectIdParamsSchema,
        body: updateProjectSchema,
      }),
    },
    updateProjectHandler
  );
  fastify.delete<{ Params: { projectId: string } }>(
    "/projects/:projectId",
    {
      onRequest: authenticate,
      preValidation: validateParams(projectIdParamsSchema),
    },
    deleteProjectHandler
  );
  // Project files routes
  fastify.get<{
    Params: { projectId: string };
    Querystring: { source?: SourceOrigin };
  }>(
    "/projects/:projectId/files",
    {
      onRequest: authenticate,
      preValidation: validateRequest({
        params: projectIdParamsSchema,
        query: projectFilesQuerySchema,
      }),
    },
    getProjectFilesHandler
  );

  fastify.post<{ Params: { projectId: string }; Body: CreateProjectFileInput }>(
    "/projects/:projectId/files",
    {
      onRequest: authenticate,
      preValidation: [
        validateParams(projectIdParamsSchema),
        validateBody(createProjectFileSchema),
      ],
    },
    createProjectFileHandler
  );

  // Update file content (unified endpoint for both script mode and write mode)
  fastify.put<{
    Params: { fileId: string };
    Body: UpdateFileContentInput;
  }>(
    "/projects/files/:fileId",
    {
      onRequest: authenticate,
      preValidation: validateRequest({
        params: fileIdParamsSchema,
        body: updateFileContentSchema,
      }),
    },
    updateFileContentHandler
  );

  // Rename/move a project file
  fastify.patch<{
    Params: { fileId: string };
    Body: RenameProjectFileInput;
  }>(
    "/projects/files/:fileId",
    {
      onRequest: authenticate,
      preValidation: validateRequest({
        params: fileIdParamsSchema,
        body: renameProjectFileSchema,
      }),
    },
    renameProjectFileHandler
  );

  // Delete impact
  fastify.post<{ Params: { fileId: string } }>(
    "/projects/files/:fileId/delete-impact",
    {
      onRequest: authenticate,
      preValidation: validateParams(fileIdParamsSchema),
    },
    getDeleteImpactHandler
  );

  // Delete a project file
  fastify.delete<{ Params: { fileId: string } }>(
    "/projects/files/:fileId",
    {
      onRequest: authenticate,
      preValidation: validateParams(fileIdParamsSchema),
    },
    deleteProjectFileHandler
  );

  // Pending structural summary for a project
  fastify.get<{ Params: { projectId: string } }>(
    "/projects/:projectId/files/pending-structural",
    {
      onRequest: authenticate,
      preValidation: validateParams(projectIdParamsSchema),
    },
    getPendingStructuralSummaryHandler
  );

  // Reverse one operation
  fastify.post<{ Params: { fileId: string } }>(
    "/projects/files/:fileId/reverse",
    {
      onRequest: authenticate,
      preValidation: validateParams(fileIdParamsSchema),
    },
    reverseOneOperationHandler
  );

  // Discard all pending structural operations (project-wide)
  fastify.post<{ Params: { projectId: string } }>(
    "/projects/:projectId/files/discard-all",
    {
      onRequest: authenticate,
      preValidation: validateParams(projectIdParamsSchema),
    },
    discardAllOperationsHandler
  );
}
