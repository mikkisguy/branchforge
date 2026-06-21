/**
 * Visual Systems Routes
 *
 * Thin HTTP wrappers that delegate to `visualSystemsService`. Handles
 * request parsing, validation, and response mapping only.
 *
 * Endpoints:
 *   GET  /projects/:projectId/visual-system
 *   PUT  /projects/:projectId/visual-system
 *
 * Both require the caller to own the project (enforced in the service).
 */

import type { FastifyInstance } from "fastify";
import type { FastifyRequest, FastifyReply } from "fastify";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  validateParams,
  validateBody,
} from "../middleware/validation.middleware.js";
import {
  projectIdParamsSchema,
  visualSystemConfigSchema,
  type VisualSystemConfigInput,
} from "../lib/validation.js";
import { visualSystemsService } from "../services/visual-systems.service.js";

// ============================================================================
// Types
// ============================================================================

interface ProjectParams {
  projectId: string;
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * Get the visual system config for a project.
 *
 * GET /projects/:projectId/visual-system
 *
 * Creates a default row on first read.
 */
async function getVisualSystemHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const config = await visualSystemsService.getVisualSystemConfig(
    projectId,
    request.user!.id
  );
  reply.status(200).send(config);
}

/**
 * Update the visual system config for a project.
 *
 * PUT /projects/:projectId/visual-system
 * Body: VisualSystemConfigInput (partial — only provided fields are written)
 */
async function updateVisualSystemHandler(
  request: FastifyRequest<{
    Params: ProjectParams;
    Body: VisualSystemConfigInput;
  }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const config = await visualSystemsService.updateVisualSystemConfig(
    projectId,
    request.user!.id,
    request.body
  );
  reply.status(200).send(config);
}

// ============================================================================
// Routes Registration
// ============================================================================

export async function visualSystemsRoutes(
  fastify: FastifyInstance
): Promise<void> {
  // Get visual system config (auto-creates a default row on first read)
  fastify.get<{ Params: ProjectParams }>(
    "/projects/:projectId/visual-system",
    {
      onRequest: authenticate,
      preValidation: validateParams(projectIdParamsSchema),
    },
    getVisualSystemHandler
  );

  // Update visual system config (partial; missing fields are left alone)
  fastify.put<{ Params: ProjectParams; Body: VisualSystemConfigInput }>(
    "/projects/:projectId/visual-system",
    {
      onRequest: authenticate,
      preValidation: [
        validateParams(projectIdParamsSchema),
        validateBody(visualSystemConfigSchema),
      ],
    },
    updateVisualSystemHandler
  );
}
