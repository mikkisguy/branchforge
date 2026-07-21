/**
 * GitLab Integration Routes
 *
 * Composes all GitLab route sub-plugins.
 * All routes require authentication.
 */

import type { FastifyInstance } from "fastify";
import { gitlabIntegrationRoutes } from "./gitlab-integration.routes.js";
import { gitlabRepositoryRoutes } from "./gitlab-repository.routes.js";
import { gitlabSyncRoutes } from "./gitlab-sync.routes.js";
import { gitlabFilesRoutes } from "./gitlab-files.routes.js";

export async function gitlabRoutes(fastify: FastifyInstance): Promise<void> {
  await gitlabIntegrationRoutes(fastify);
  await gitlabRepositoryRoutes(fastify);
  await gitlabSyncRoutes(fastify);
  await gitlabFilesRoutes(fastify);
}
