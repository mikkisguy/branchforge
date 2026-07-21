/**
 * GitLab Repository Routes
 *
 * Sub-plugin for GitLab repository linking/unlinking, listing linked repos,
 * listing branches, and listing RPY files.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../middleware/validation.middleware.js";
import {
  ConflictError,
  RepositoryNotLinkedError,
} from "../middleware/error-handler.middleware.js";
import {
  getGitlabProject,
  linkRepository,
  unlinkRepository,
  listRepositoryLinks,
  listBranches,
  listRpyFiles,
} from "../services/gitlab.service.js";
import {
  linkRepositorySchema,
  projectIdParamsSchema,
  gitLabFileListQuerySchema,
  type LinkRepositoryInput,
  type GitLabFileListQuery,
} from "../lib/validation.js";
import {
  getAuthenticatedUserId,
  handleKnownRouteErrors,
} from "../lib/gitlab-route-helpers.js";

/**
 * Link repository to project
 *
 * POST /api/gitlab/link
 * Body: { projectId: string, gitlabProjectId: number, branch?: string }
 *
 * Links a BranchForge project to a GitLab repository.
 */
async function linkRepositoryHandler(
  request: FastifyRequest<{ Body: LinkRepositoryInput }>,
  reply: FastifyReply
): Promise<void> {
  const userId = getAuthenticatedUserId(request);
  const { projectId, gitlabProjectId, branch = "main" } = request.body;

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
      userId,
      branch
    );
    reply.status(201).send();
  } catch (err) {
    if (err instanceof ConflictError) {
      reply.status(409).send({ error: "Conflict", message: err.message });
      return;
    }
    if (handleKnownRouteErrors(err, reply)) return;
    request.log.error(
      { err },
      "linkRepositoryHandler: Failed to link repository"
    );
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
    if (handleKnownRouteErrors(err, reply)) return;
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

    if (handleKnownRouteErrors(err, reply)) return;

    request.log.error(
      { err, projectId },
      "listBranchesHandler: Failed to list branches"
    );

    if (err instanceof Error && err.message.startsWith("GitLab API error:")) {
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
    Querystring: GitLabFileListQuery;
  }>,
  reply: FastifyReply
): Promise<void> {
  const userId = getAuthenticatedUserId(request);
  const { projectId } = request.params;
  const { branch } = request.query;

  try {
    const files = await listRpyFiles(projectId, branch, userId);
    reply.send(files);
  } catch (err) {
    // Return empty array if repository not linked (normal state, not an error)
    if (err instanceof RepositoryNotLinkedError) {
      reply.send([]);
      return;
    }

    if (handleKnownRouteErrors(err, reply)) return;

    request.log.error(
      { err, projectId, branch },
      "listFilesHandler: Failed to list RPY files"
    );

    if (err instanceof Error && err.message.startsWith("GitLab API error:")) {
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

export async function gitlabRepositoryRoutes(
  fastify: FastifyInstance
): Promise<void> {
  // Repository linking (require auth)
  fastify.post<{ Body: LinkRepositoryInput }>(
    "/gitlab/link",
    {
      onRequest: [authenticate],
      preValidation: validateBody(linkRepositorySchema),
    },
    linkRepositoryHandler
  );

  fastify.delete<{ Params: { projectId: string } }>(
    "/gitlab/unlink/:projectId",
    {
      onRequest: [authenticate],
      preValidation: validateParams(projectIdParamsSchema),
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
      preValidation: validateParams(projectIdParamsSchema),
    },
    listBranchesHandler
  );

  fastify.get<{
    Params: { projectId: string };
    Querystring: GitLabFileListQuery;
  }>(
    "/gitlab/files/:projectId",
    {
      onRequest: [authenticate],
      preValidation: [
        validateParams(projectIdParamsSchema),
        validateQuery(gitLabFileListQuerySchema),
      ],
    },
    listFilesHandler
  );
}
