/**
 * Stats Routes
 *
 * Thin HTTP wrappers that delegate all business logic to statsService.
 * Handles only request parsing and response mapping.
 */

import type { FastifyInstance } from "fastify";
import type { FastifyRequest, FastifyReply } from "fastify";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  validateParams,
  validateBody,
} from "../middleware/validation.middleware.js";
import {
  createStatSchema,
  updateStatSchema,
  statIdParamsSchema,
  projectIdParamsSchema,
  type CreateStatInput,
  type UpdateStatInput,
} from "../lib/validation.js";
import { statsService } from "../services/stats.service.js";

// ============================================================================
// Types
// ============================================================================

interface ProjectParams {
  projectId: string;
}

interface StatParams {
  statId: string;
}

// ============================================================================
// Route Handlers
// ============================================================================

/** GET /projects/:projectId/stats */
async function listStatsHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const result = await statsService.listStats(projectId, request.user!.id);
  reply.status(200).send({ stats: result });
}

/** POST /projects/:projectId/stats */
async function createStatHandler(
  request: FastifyRequest<{
    Params: ProjectParams;
    Body: CreateStatInput;
  }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const stat = await statsService.createStat(
    projectId,
    request.user!.id,
    request.body
  );
  reply.status(201).send({ stat });
}

/** PUT /stats/:statId */
async function updateStatHandler(
  request: FastifyRequest<{
    Params: StatParams;
    Body: UpdateStatInput;
  }>,
  reply: FastifyReply
): Promise<void> {
  const { statId } = request.params;
  const stat = await statsService.updateStat(
    statId,
    request.user!.id,
    request.body
  );
  reply.status(200).send({ stat });
}

/** DELETE /stats/:statId */
async function deleteStatHandler(
  request: FastifyRequest<{ Params: StatParams }>,
  reply: FastifyReply
): Promise<void> {
  const { statId } = request.params;
  await statsService.deleteStat(statId, request.user!.id);
  reply.status(204).send();
}

/** GET /projects/:projectId/stats/progression */
async function getProgressionHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const result = await statsService.getProgression(projectId, request.user!.id);
  reply.status(200).send({ progression: result });
}

// ============================================================================
// Routes Registration
// ============================================================================

export async function statsRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication

  // List stats for project
  fastify.get<{ Params: ProjectParams }>(
    "/projects/:projectId/stats",
    {
      onRequest: authenticate,
      preValidation: validateParams(projectIdParamsSchema),
    },
    listStatsHandler
  );

  // Create stat
  fastify.post<{ Params: ProjectParams; Body: CreateStatInput }>(
    "/projects/:projectId/stats",
    {
      onRequest: authenticate,
      preValidation: [
        validateParams(projectIdParamsSchema),
        validateBody(createStatSchema),
      ],
    },
    createStatHandler
  );

  // Get progression for all stats
  fastify.get<{ Params: ProjectParams }>(
    "/projects/:projectId/stats/progression",
    {
      onRequest: authenticate,
      preValidation: validateParams(projectIdParamsSchema),
    },
    getProgressionHandler
  );

  // Update stat
  fastify.put<{ Params: StatParams; Body: UpdateStatInput }>(
    "/stats/:statId",
    {
      onRequest: authenticate,
      preValidation: [
        validateParams(statIdParamsSchema),
        validateBody(updateStatSchema),
      ],
    },
    updateStatHandler
  );

  // Delete stat
  fastify.delete<{ Params: StatParams }>(
    "/stats/:statId",
    {
      onRequest: authenticate,
      preValidation: validateParams(statIdParamsSchema),
    },
    deleteStatHandler
  );
}
