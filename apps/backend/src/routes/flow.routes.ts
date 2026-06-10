/**
 * Flow Graph Routes
 *
 * Routes for retrieving flow graph data for project visualization.
 */

import type { FastifyInstance } from "fastify";
import type { FastifyRequest, FastifyReply } from "fastify";
import { getFlowGraph } from "../services/flow.service.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { validateQuery } from "../middleware/validation.middleware.js";
import type { FlowGraph } from "@branchforge/shared";
import {
  flowGraphQuerySchema,
  type FlowGraphQuery,
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
}
