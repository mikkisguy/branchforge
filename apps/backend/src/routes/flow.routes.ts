/**
 * Flow Graph Routes
 *
 * Routes for retrieving flow graph data and managing layout positions.
 *
 * Layout positions are stored per (project, user, mode) so a manual drag
 * in one mode (e.g. FLOW) does not pollute the saved positions of another
 * (e.g. ROUTE or FILE). All layout endpoints require a `mode` so the
 * scope is always explicit.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  getFlowGraph,
  getFlowGraphLayout,
  saveFlowGraphLayout,
  deleteFlowGraphLayout,
} from "../services/flow.service.js";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  validateQuery,
  validateBody,
} from "../middleware/validation.middleware.js";
import { checkRateLimit } from "../services/rate-limiter.service.js";
import { RateLimitError } from "../middleware/error-handler.middleware.js";
import type { FlowGraph, FlowGraphPositions } from "@branchforge/shared";
import {
  flowGraphQuerySchema,
  flowGraphLayoutQuerySchema,
  saveFlowGraphLayoutSchema,
  type FlowGraphQuery,
  type FlowGraphLayoutQuery,
  type SaveFlowGraphLayoutInput,
} from "../lib/validation.js";

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * Get the flow graph for a project
 *
 * GET /flow-graph?projectId=xxx
 * Requires authentication
 */
async function flowGraphHandler(
  request: FastifyRequest<{ Querystring: FlowGraphQuery }>,
  reply: FastifyReply
): Promise<void> {
  const user = request.user!;
  const { projectId } = request.query;

  const flowGraph = await getFlowGraph(projectId, user.id);
  reply.status(200).send(flowGraph satisfies FlowGraph);
}

/**
 * Get saved layout positions for a project, scoped to a layout mode.
 *
 * GET /flow-graph/layout?projectId=xxx&mode=FLOW
 * Requires authentication
 */
async function getLayoutHandler(
  request: FastifyRequest<{ Querystring: FlowGraphLayoutQuery }>,
  reply: FastifyReply
): Promise<void> {
  const user = request.user!;
  const { projectId, mode } = request.query;

  const positions = await getFlowGraphLayout(projectId, user.id, mode);
  reply
    .status(200)
    .send({ positions } satisfies { positions: FlowGraphPositions });
}

/**
 * Save layout positions for a project, scoped to a layout mode.
 *
 * PUT /flow-graph/layout
 * Body: { projectId, mode, positions }
 * Requires authentication
 */
async function saveLayoutHandler(
  request: FastifyRequest<{ Body: SaveFlowGraphLayoutInput }>,
  reply: FastifyReply
): Promise<void> {
  const rateLimit = checkRateLimit(`layoutSave:${request.ip}`, {
    maxAttempts: 60,
    windowMs: 15 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    throw new RateLimitError(rateLimit.retryAfter);
  }

  const user = request.user!;
  const { projectId, mode, positions } = request.body;

  await saveFlowGraphLayout(projectId, user.id, positions, mode);
  reply.status(204).send();
}

/**
 * Delete (reset) layout positions for a project, scoped to a layout mode.
 * Resetting one mode leaves positions in other modes untouched.
 *
 * DELETE /flow-graph/layout?projectId=xxx&mode=FLOW
 * Requires authentication
 */
async function deleteLayoutHandler(
  request: FastifyRequest<{ Querystring: FlowGraphLayoutQuery }>,
  reply: FastifyReply
): Promise<void> {
  const user = request.user!;
  const { projectId, mode } = request.query;

  await deleteFlowGraphLayout(projectId, user.id, mode);
  reply.status(204).send();
}

// ============================================================================
// Routes Registration
// ============================================================================

export async function flowRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Querystring: FlowGraphQuery }>(
    "/flow-graph",
    {
      onRequest: authenticate,
      preValidation: validateQuery(flowGraphQuerySchema),
    },
    flowGraphHandler
  );

  fastify.get<{ Querystring: FlowGraphLayoutQuery }>(
    "/flow-graph/layout",
    {
      onRequest: authenticate,
      preValidation: validateQuery(flowGraphLayoutQuerySchema),
    },
    getLayoutHandler
  );

  fastify.put<{ Body: SaveFlowGraphLayoutInput }>(
    "/flow-graph/layout",
    {
      onRequest: authenticate,
      preValidation: validateBody(saveFlowGraphLayoutSchema),
    },
    saveLayoutHandler
  );

  fastify.delete<{ Querystring: FlowGraphLayoutQuery }>(
    "/flow-graph/layout",
    {
      onRequest: authenticate,
      preValidation: validateQuery(flowGraphLayoutQuerySchema),
    },
    deleteLayoutHandler
  );
}
