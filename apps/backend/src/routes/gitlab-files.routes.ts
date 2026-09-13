/**
 * GitLab Files Routes
 *
 * Sub-plugin for reading stored GitLab files.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authenticate } from "../middleware/auth.middleware.js";
import { validateParams } from "../middleware/validation.middleware.js";
import { getGitLabFilesWithScenes } from "../services/gitlab.service.js";
import { projectIdParamsSchema } from "../lib/validation.js";
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
}
