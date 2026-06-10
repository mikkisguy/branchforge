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
import { z } from "zod";
import type { FlowNode, FlowEdge } from "@branchforge/shared";

// ============================================================================
// Validation Schemas
// ============================================================================

const flowGraphQuerySchema = z.object({
  projectId: z.string().uuid(),
});
type FlowGraphQuery = z.infer<typeof flowGraphQuerySchema>;

// ============================================================================
// Response Types
// ============================================================================

interface FlowGraphResponse {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

interface ErrorResponse {
  error: string;
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

  try {
    const flowGraph = await getFlowGraph(projectId, user.id);
    reply.status(200).send(flowGraph satisfies FlowGraphResponse);
  } catch (error) {
    request.log.error(error);
    reply
      .status(500)
      .send({ error: "Internal server error" } satisfies ErrorResponse);
  }
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
