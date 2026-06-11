/**
 * Flow Graph Routes
 *
 * Routes for retrieving flow graph data and managing layout positions.
 */

import type { FastifyInstance } from "fastify";
import type { FastifyRequest, FastifyReply } from "fastify";
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
  saveFlowGraphLayoutSchema,
  type FlowGraphQuery,
  type SaveFlowGraphLayoutInput,
} from "../lib/validation.js";

function getClientIp(request: FastifyRequest): string {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  if (Array.isArray(forwarded)) {
    return forwarded[0].trim();
  }
  const cfConnectingIp = request.headers["cf-connecting-ip"];
  if (typeof cfConnectingIp === "string") {
    return cfConnectingIp;
  }
  const xRealIp = request.headers["x-real-ip"];
  if (typeof xRealIp === "string") {
    return xRealIp;
  }
  return request.ip;
}

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
 * Get saved layout positions for a project
 *
 * GET /flow-graph/layout?projectId=xxx
 * Requires authentication
 */
async function getLayoutHandler(
  request: FastifyRequest<{ Querystring: FlowGraphQuery }>,
  reply: FastifyReply
): Promise<void> {
  const user = request.user!;
  const { projectId } = request.query;

  const positions = await getFlowGraphLayout(projectId, user.id);
  reply
    .status(200)
    .send({ positions } satisfies { positions: FlowGraphPositions });
}

/**
 * Save layout positions for a project
 *
 * PUT /flow-graph/layout
 * Requires authentication
 */
async function saveLayoutHandler(
  request: FastifyRequest<{ Body: SaveFlowGraphLayoutInput }>,
  reply: FastifyReply
): Promise<void> {
  const clientIp = getClientIp(request);
  const rateLimit = checkRateLimit(`layoutSave:${clientIp}`, {
    maxAttempts: 60,
    windowMs: 15 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    throw new RateLimitError(rateLimit.retryAfter);
  }

  const user = request.user!;
  const { projectId, positions } = request.body;

  await saveFlowGraphLayout(projectId, user.id, positions);
  reply.status(204).send();
}

/**
 * Delete (reset) layout positions for a project
 *
 * DELETE /flow-graph/layout?projectId=xxx
 * Requires authentication
 */
async function deleteLayoutHandler(
  request: FastifyRequest<{ Querystring: FlowGraphQuery }>,
  reply: FastifyReply
): Promise<void> {
  const user = request.user!;
  const { projectId } = request.query;

  await deleteFlowGraphLayout(projectId, user.id);
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

  fastify.get<{ Querystring: FlowGraphQuery }>(
    "/flow-graph/layout",
    {
      onRequest: authenticate,
      preValidation: validateQuery(flowGraphQuerySchema),
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

  fastify.delete<{ Querystring: FlowGraphQuery }>(
    "/flow-graph/layout",
    {
      onRequest: authenticate,
      preValidation: validateQuery(flowGraphQuerySchema),
    },
    deleteLayoutHandler
  );
}
