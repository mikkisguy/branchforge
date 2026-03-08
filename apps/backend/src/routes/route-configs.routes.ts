/**
 * Route Configurations Routes
 *
 * Routes for route configuration management operations including listing,
 * getting, creating, updating, and deleting route configurations.
 */

import type { FastifyInstance } from "fastify";
import type { FastifyRequest, FastifyReply } from "fastify";
import {
  listRouteConfigs,
  getRouteConfig,
  createRouteConfig,
  updateRouteConfig,
  deleteRouteConfig,
  type PublicRouteConfig,
} from "../services/route-configs.service.js";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  validateBody,
  validateParams,
} from "../middleware/validation.middleware.js";
import {
  createRouteConfigSchema,
  updateRouteConfigSchema,
  routeConfigIdParamsSchema,
  routeConfigProjectIdParamsSchema,
  type CreateRouteConfigInput,
  type UpdateRouteConfigInput,
} from "../lib/validation.js";

// ============================================================================
// Types
// ============================================================================

interface ListRouteConfigsResponse {
  routeConfigs: PublicRouteConfig[];
}

interface GetRouteConfigParams {
  routeConfigId: string;
}

interface GetRouteConfigResponse {
  routeConfig: PublicRouteConfig;
}

interface ListRouteConfigsByProjectParams {
  projectId: string;
}

interface CreateRouteConfigByProjectParams {
  projectId: string;
}

interface CreateRouteConfigResponse {
  routeConfig: PublicRouteConfig;
}

interface UpdateRouteConfigResponse {
  routeConfig: PublicRouteConfig;
}

interface ErrorResponse {
  error: string;
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * List all route configurations for a project
 *
 * GET /projects/:projectId/routes
 * Requires authentication
 */
async function listRouteConfigsByProjectHandler(
  request: FastifyRequest<{ Params: ListRouteConfigsByProjectParams }>,
  reply: FastifyReply,
): Promise<void> {
  const { projectId } = request.params;
  const user = request.user!;

  const routeConfigs = await listRouteConfigs(projectId, user.id);

  reply.status(200).send({ routeConfigs } as ListRouteConfigsResponse);
}

/**
 * Get a single route configuration by ID
 *
 * GET /routes/:routeConfigId
 * Requires authentication
 */
async function getRouteConfigHandler(
  request: FastifyRequest<{ Params: GetRouteConfigParams }>,
  reply: FastifyReply,
): Promise<void> {
  const { routeConfigId } = request.params;
  const user = request.user!;

  const routeConfig = await getRouteConfig(routeConfigId, user.id);

  if (!routeConfig) {
    reply.status(404).send({ error: "Route configuration not found" } as ErrorResponse);
    return;
  }

  reply.status(200).send({ routeConfig } as GetRouteConfigResponse);
}

/**
 * Create a new route configuration for a project
 *
 * POST /projects/:projectId/routes
 * Requires authentication
 */
async function createRouteConfigByProjectHandler(
  request: FastifyRequest<{
    Params: CreateRouteConfigByProjectParams;
    Body: CreateRouteConfigInput;
  }>,
  reply: FastifyReply,
): Promise<void> {
  const { projectId } = request.params;
  const user = request.user!;
  const body = request.body;

  const routeConfig = await createRouteConfig(user.id, projectId, body);

  reply.status(201).send({ routeConfig } as CreateRouteConfigResponse);
}

/**
 * Update an existing route configuration
 *
 * PATCH /routes/:routeConfigId
 * Requires authentication
 */
async function updateRouteConfigHandler(
  request: FastifyRequest<{
    Params: GetRouteConfigParams;
    Body: UpdateRouteConfigInput;
  }>,
  reply: FastifyReply,
): Promise<void> {
  const { routeConfigId } = request.params;
  const user = request.user!;
  const body = request.body;

  const routeConfig = await updateRouteConfig(routeConfigId, user.id, body);

  reply.status(200).send({ routeConfig } as UpdateRouteConfigResponse);
}

/**
 * Delete a route configuration
 *
 * DELETE /routes/:routeConfigId
 * Requires authentication
 */
async function deleteRouteConfigHandler(
  request: FastifyRequest<{ Params: GetRouteConfigParams }>,
  reply: FastifyReply,
): Promise<void> {
  const { routeConfigId } = request.params;
  const user = request.user!;

  await deleteRouteConfig(routeConfigId, user.id);

  reply.status(204).send();
}

// ============================================================================
// Routes Registration
// ============================================================================

export async function routeConfigsRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication

  // List route configurations for a project
  fastify.get<{ Params: ListRouteConfigsByProjectParams }>(
    "/projects/:projectId/routes",
    {
      onRequest: authenticate,
      preValidation: validateParams(routeConfigProjectIdParamsSchema),
    },
    listRouteConfigsByProjectHandler,
  );

  // Create route configuration for a project
  fastify.post<{
    Params: CreateRouteConfigByProjectParams;
    Body: CreateRouteConfigInput;
  }>(
    "/projects/:projectId/routes",
    {
      onRequest: authenticate,
      preValidation: [
        validateParams(routeConfigProjectIdParamsSchema),
        validateBody(createRouteConfigSchema),
      ],
    },
    createRouteConfigByProjectHandler,
  );

  // Get a single route configuration
  fastify.get<{ Params: GetRouteConfigParams }>(
    "/routes/:routeConfigId",
    {
      onRequest: authenticate,
      preValidation: validateParams(routeConfigIdParamsSchema),
    },
    getRouteConfigHandler,
  );

  // Update a route configuration
  fastify.patch<{
    Params: GetRouteConfigParams;
    Body: UpdateRouteConfigInput;
  }>(
    "/routes/:routeConfigId",
    {
      onRequest: authenticate,
      preValidation: [
        validateParams(routeConfigIdParamsSchema),
        validateBody(updateRouteConfigSchema),
      ],
    },
    updateRouteConfigHandler,
  );

  // Delete a route configuration
  fastify.delete<{ Params: GetRouteConfigParams }>(
    "/routes/:routeConfigId",
    {
      onRequest: authenticate,
      preValidation: validateParams(routeConfigIdParamsSchema),
    },
    deleteRouteConfigHandler,
  );
}
