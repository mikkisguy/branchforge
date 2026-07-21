/**
 * GitLab Integration Routes
 *
 * Sub-plugin for GitLab integration management: validate token,
 * store/get/delete integration, and list repositories.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authenticate } from "../middleware/auth.middleware.js";
import { validateBody } from "../middleware/validation.middleware.js";
import { ValidationError } from "../middleware/error-handler.middleware.js";
import { checkRateLimit } from "../services/rate-limiter.service.js";
import {
  validateGitlabPAT,
  storeGitlabIntegration,
  deleteGitlabIntegration,
  listGitlabRepositories,
  getGitlabIntegration,
} from "../services/gitlab.service.js";
import {
  validateGitlabTokenSchema,
  type ValidateGitlabTokenInput,
} from "../lib/validation.js";
import { getAuthenticatedUserId } from "../lib/gitlab-route-helpers.js";

/**
 * Validate GitLab PAT
 *
 * POST /api/gitlab/validate
 * Body: { token: string, gitlabUrl?: string }
 *
 * Validates a GitLab Personal Access Token before storing it.
 */
async function validateTokenHandler(
  request: FastifyRequest<{ Body: ValidateGitlabTokenInput }>,
  reply: FastifyReply
): Promise<void> {
  const clientIp = request.ip;

  // Check rate limit to prevent brute-force/DoS attacks
  const rateLimit = checkRateLimit(`gitlabValidate:${clientIp}`);
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
  request: FastifyRequest<{ Body: ValidateGitlabTokenInput }>,
  reply: FastifyReply
): Promise<void> {
  const userId = getAuthenticatedUserId(request);
  const { token, gitlabUrl } = request.body;

  try {
    await storeGitlabIntegration(userId, token, gitlabUrl);
    reply.status(201).send();
  } catch (err) {
    if (err instanceof ValidationError) {
      reply.status(400).send({ error: "Invalid GitLab token" });
      return;
    }
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

export async function gitlabIntegrationRoutes(
  fastify: FastifyInstance
): Promise<void> {
  // Token validation — requires auth like every other /gitlab/* route.
  // Leaving it unauthenticated turned the server into an open
  // token-validation / amplification oracle (see security audit).
  fastify.post<{ Body: ValidateGitlabTokenInput }>(
    "/gitlab/validate",
    {
      onRequest: [authenticate],
      preValidation: validateBody(validateGitlabTokenSchema),
    },
    validateTokenHandler
  );

  // Integration management (require auth)
  fastify.get(
    "/gitlab/integration",
    {
      onRequest: [authenticate],
    },
    getIntegrationHandler
  );

  fastify.post<{ Body: ValidateGitlabTokenInput }>(
    "/gitlab/integration",
    {
      onRequest: [authenticate],
      preValidation: validateBody(validateGitlabTokenSchema),
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
}
