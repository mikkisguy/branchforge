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
  updateFileContent,
} from "../services/projects.service.js";
import type { SourceOrigin, PublicProject } from "@branchforge/shared";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  validateParams,
  validateRequest,
} from "../middleware/validation.middleware.js";
import {
  updateProjectSchema,
  projectIdParamsSchema,
  projectFilesQuerySchema,
  fileIdParamsSchema,
  updateFileContentSchema,
  type UpdateFileContentInput,
  type UpdateProjectInput,
} from "../lib/validation.js";
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
} from "../middleware/error-handler.middleware.js";

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

    if (!result.success) {
      reply.status(409).send(result);
      return;
    }

    reply.status(200).send(result);
  } catch (err) {
    request.log.error(
      { err, fileId },
      `updateFileContentHandler: Failed to update file content: ${
        err instanceof Error ? err.message : "Unknown error"
      }`
    );

    if (err instanceof NotFoundError) {
      reply.status(404).send({ error: "Not found" } as ErrorResponse);
      return;
    }
    if (err instanceof ForbiddenError) {
      reply.status(403).send({ error: "Forbidden" } as ErrorResponse);
      return;
    }
    if (err instanceof ValidationError) {
      reply.status(400).send({ error: err.userMessage } as ErrorResponse);
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
}
