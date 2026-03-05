/**
 * Scenes Routes
 *
 * Routes for scene management operations including listing scenes for a project
 * and getting detailed scene information with lines and characters.
 */

import type { FastifyInstance } from "fastify";
import type { FastifyRequest, FastifyReply } from "fastify";
import {
  listScenes,
  getScene,
  type PublicScene,
  type SceneDetail,
  type ListScenesFilters,
} from "../services/scenes.service.js";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  validateQuery,
  validateParams,
} from "../middleware/validation.middleware.js";
import {
  listScenesQuerySchema,
  sceneIdParamsSchema,
  type ListScenesQuery,
} from "../lib/validation.js";

// ============================================================================
// Types
// ============================================================================

interface ListScenesResponse {
  scenes: PublicScene[];
}

interface GetSceneParams {
  sceneId: string;
}

interface GetSceneResponse {
  scene: SceneDetail;
}

interface ErrorResponse {
  error: string;
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * List all scenes for a project
 *
 * GET /scenes?projectId=xxx&route=xxx&status=xxx
 * Requires authentication
 */
async function listScenesHandler(
  request: FastifyRequest<{ Querystring: ListScenesQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const user = request.user!;
  const { projectId, route, status } = request.query;

  // Build filters
  const filters: ListScenesFilters = {};
  if (route) {
    filters.route = route;
  }
  if (status) {
    filters.status = status;
  }

  try {
    const scenes = await listScenes(projectId, user.id, filters);
    reply.status(200).send({ scenes } as ListScenesResponse);
  } catch (error) {
    request.log.error(error);
    reply.status(500).send({ error: "Internal server error" } as ErrorResponse);
  }
}

/**
 * Get a single scene by ID with full details
 *
 * GET /scenes/:sceneId
 * Requires authentication
 */
async function getSceneHandler(
  request: FastifyRequest<{ Params: GetSceneParams }>,
  reply: FastifyReply,
): Promise<void> {
  const { sceneId } = request.params;
  const user = request.user!;

  try {
    const scene = await getScene(sceneId, user.id);

    if (!scene) {
      reply.status(404).send({ error: "Scene not found" } as ErrorResponse);
      return;
    }

    reply.status(200).send({ scene } as GetSceneResponse);
  } catch (error) {
    request.log.error(error);
    reply.status(500).send({ error: "Internal server error" } as ErrorResponse);
  }
}

// ============================================================================
// Routes Registration
// ============================================================================

export async function scenesRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.get<{ Querystring: ListScenesQuery }>(
    "/scenes",
    {
      onRequest: authenticate,
      preValidation: validateQuery(listScenesQuerySchema),
    },
    listScenesHandler,
  );
  fastify.get<{ Params: GetSceneParams }>(
    "/scenes/:sceneId",
    {
      onRequest: authenticate,
      preValidation: validateParams(sceneIdParamsSchema),
    },
    getSceneHandler,
  );
}

