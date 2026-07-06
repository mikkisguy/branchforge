/**
 * Pair Groups Routes
 *
 * Routes for pair group management.
 * GET    /projects/:projectId/pairs          — list pair groups
 * POST   /projects/:projectId/pairs          — create pair group
 * PUT    /projects/:projectId/pairs/:pairId  — update pair group
 * DELETE /projects/:projectId/pairs/:pairId  — delete pair group
 */

import type { FastifyInstance } from "fastify";
import type { FastifyRequest, FastifyReply } from "fastify";
import {
  listPairGroups,
  createPairGroup,
  updatePairGroup,
  deletePairGroup,
} from "../services/pair-groups.service.js";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  validateBody,
  validateParams,
} from "../middleware/validation.middleware.js";
import { checkRateLimit } from "../services/rate-limiter.service.js";
import {
  projectIdParamsSchema,
  createPairGroupSchema,
  updatePairGroupSchema,
  pairGroupIdParamsSchema,
  type CreatePairGroupInput,
  type UpdatePairGroupInput,
} from "../lib/validation.js";
import { z } from "zod";
import type { PairGroupWithNames } from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

type ProjectParams = z.infer<typeof projectIdParamsSchema>;

// Combined params schema for routes with both projectId and pairGroupId
const pairGroupWithProjectParamsSchema = projectIdParamsSchema.merge(
  pairGroupIdParamsSchema
);
type PairGroupWithProjectParams = z.infer<
  typeof pairGroupWithProjectParamsSchema
>;

interface PairGroupsListResponse {
  pairGroups: PairGroupWithNames[];
}

interface PairGroupResponse {
  pairGroup: {
    id: string;
    projectId: string;
    characterAId: string;
    characterBId: string;
    duoEndingLabel: string;
    createdAt: string;
    updatedAt: string;
  };
}

// ============================================================================
// Helpers
// ============================================================================

function serializeDateFields(pg: {
  id: string;
  projectId: string;
  characterAId: string;
  characterBId: string;
  duoEndingLabel: string;
  createdAt: Date;
  updatedAt: Date;
}): PairGroupResponse["pairGroup"] {
  return {
    ...pg,
    createdAt: pg.createdAt.toISOString(),
    updatedAt: pg.updatedAt.toISOString(),
  };
}

// ============================================================================
// Route Handlers
// ============================================================================

async function listPairGroupsHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const user = request.user!;

  const pgs = await listPairGroups(projectId, user.id);
  reply.status(200).send({ pairGroups: pgs } as PairGroupsListResponse);
}

async function createPairGroupHandler(
  request: FastifyRequest<{
    Params: ProjectParams;
    Body: CreatePairGroupInput;
  }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const user = request.user!;

  checkRateLimit(`pairGroupCreate:${request.ip}`);

  const pairGroup = await createPairGroup(projectId, user.id, request.body);
  reply.status(201).send({
    pairGroup: serializeDateFields(pairGroup),
  });
}

async function updatePairGroupHandler(
  request: FastifyRequest<{
    Params: PairGroupWithProjectParams;
    Body: UpdatePairGroupInput;
  }>,
  reply: FastifyReply
): Promise<void> {
  const { pairGroupId } = request.params;
  const user = request.user!;

  checkRateLimit(`pairGroupUpdate:${request.ip}`);

  const pairGroup = await updatePairGroup(pairGroupId, user.id, request.body);
  reply.status(200).send({
    pairGroup: serializeDateFields(pairGroup),
  });
}

async function deletePairGroupHandler(
  request: FastifyRequest<{
    Params: PairGroupWithProjectParams;
  }>,
  reply: FastifyReply
): Promise<void> {
  const { pairGroupId } = request.params;
  const user = request.user!;

  checkRateLimit(`pairGroupDelete:${request.ip}`);

  await deletePairGroup(pairGroupId, user.id);
  reply.status(204).send();
}

// ============================================================================
// Routes Registration
// ============================================================================

export async function pairGroupsRoutes(
  fastify: FastifyInstance
): Promise<void> {
  fastify.get<{ Params: ProjectParams }>(
    "/projects/:projectId/pairs",
    {
      onRequest: authenticate,
      preValidation: validateParams(projectIdParamsSchema),
    },
    listPairGroupsHandler
  );
  fastify.post<{ Params: ProjectParams; Body: CreatePairGroupInput }>(
    "/projects/:projectId/pairs",
    {
      onRequest: authenticate,
      preValidation: [
        validateParams(projectIdParamsSchema),
        validateBody(createPairGroupSchema),
      ],
    },
    createPairGroupHandler
  );
  fastify.put<{
    Params: PairGroupWithProjectParams;
    Body: UpdatePairGroupInput;
  }>(
    "/projects/:projectId/pairs/:pairGroupId",
    {
      onRequest: authenticate,
      preValidation: [
        validateParams(pairGroupWithProjectParamsSchema),
        validateBody(updatePairGroupSchema),
      ],
    },
    updatePairGroupHandler
  );
  fastify.delete<{
    Params: PairGroupWithProjectParams;
  }>(
    "/projects/:projectId/pairs/:pairGroupId",
    {
      onRequest: authenticate,
      preValidation: [validateParams(pairGroupWithProjectParamsSchema)],
    },
    deletePairGroupHandler
  );
}
