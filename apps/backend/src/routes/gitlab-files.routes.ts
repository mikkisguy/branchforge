/**
 * GitLab Files Routes
 *
 * Sub-plugin for GitLab file operations: get stored files and update file content.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  validateBody,
  validateParams,
} from "../middleware/validation.middleware.js";
import { ConflictError } from "../middleware/error-handler.middleware.js";
import {
  getGitLabFilesWithScenes,
  updateGitLabFileContent,
} from "../services/gitlab.service.js";
import {
  projectIdParamsSchema,
  fileIdParamsSchema,
  updateGitLabFileContentSchema,
  type UpdateGitLabFileContentInput,
} from "../lib/validation.js";
import {
  getAuthenticatedUserId,
  handleKnownRouteErrors,
} from "../lib/gitlab-route-helpers.js";

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
    if (handleKnownRouteErrors(err, reply)) return;
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
    Body: UpdateGitLabFileContentInput;
  }>,
  reply: FastifyReply
): Promise<void> {
  const userId = getAuthenticatedUserId(request);
  const { fileId } = request.params;
  const { content } = request.body;

  try {
    const result = await updateGitLabFileContent(fileId, content, userId);
    reply.send(result);
  } catch (err) {
    if (err instanceof ConflictError) {
      reply.status(409).send({
        error: "Sync already in progress",
        message: err.message,
      });
      return;
    }
    if (handleKnownRouteErrors(err, reply)) return;
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

export async function gitlabFilesRoutes(
  fastify: FastifyInstance
): Promise<void> {
  // GitLab files management (require auth)
  // Get stored GitLab files from database (with associated scenes)
  fastify.get<{ Params: { projectId: string } }>(
    "/gitlab/files/stored/:projectId",
    {
      onRequest: [authenticate],
      preValidation: validateParams(projectIdParamsSchema),
    },
    getGitLabFilesHandler
  );

  fastify.put<{
    Params: { fileId: string };
    Body: UpdateGitLabFileContentInput;
  }>(
    "/gitlab/files/:fileId",
    {
      onRequest: [authenticate],
      preValidation: [
        validateParams(fileIdParamsSchema),
        validateBody(updateGitLabFileContentSchema),
      ],
    },
    updateGitLabFileHandler
  );
}
