/**
 * Meters Routes
 *
 * Thin HTTP wrappers that delegate all business logic to metersService.
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
  createMeterSchema,
  updateMeterSchema,
  meterIdParamsSchema,
  projectIdParamsSchema,
  type CreateMeterInput,
  type UpdateMeterInput,
} from "../lib/validation.js";
import { metersService } from "../services/meters.service.js";

// ============================================================================
// Types
// ============================================================================

interface ProjectParams {
  projectId: string;
}

interface MeterParams {
  meterId: string;
}

// ============================================================================
// Route Handlers
// ============================================================================

/** GET /projects/:projectId/meters */
async function listMetersHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const result = await metersService.listMeters(projectId, request.user!.id);
  reply.status(200).send({ meters: result });
}

/** POST /projects/:projectId/meters */
async function createMeterHandler(
  request: FastifyRequest<{
    Params: ProjectParams;
    Body: CreateMeterInput;
  }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const meter = await metersService.createMeter(
    projectId,
    request.user!.id,
    request.body
  );
  reply.status(201).send({ meter });
}

/** PUT /meters/:meterId */
async function updateMeterHandler(
  request: FastifyRequest<{
    Params: MeterParams;
    Body: UpdateMeterInput;
  }>,
  reply: FastifyReply
): Promise<void> {
  const { meterId } = request.params;
  const meter = await metersService.updateMeter(
    meterId,
    request.user!.id,
    request.body
  );
  reply.status(200).send({ meter });
}

/** DELETE /meters/:meterId */
async function deleteMeterHandler(
  request: FastifyRequest<{ Params: MeterParams }>,
  reply: FastifyReply
): Promise<void> {
  const { meterId } = request.params;
  await metersService.deleteMeter(meterId, request.user!.id);
  reply.status(204).send();
}

/** GET /projects/:projectId/meters/progression */
async function getProgressionHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const result = await metersService.getProgression(
    projectId,
    request.user!.id
  );
  reply.status(200).send({ progression: result });
}

// ============================================================================
// Routes Registration
// ============================================================================

export async function metersRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication

  // List meters for project
  fastify.get<{ Params: ProjectParams }>(
    "/projects/:projectId/meters",
    {
      onRequest: authenticate,
      preValidation: validateParams(projectIdParamsSchema),
    },
    listMetersHandler
  );

  // Create meter
  fastify.post<{ Params: ProjectParams; Body: CreateMeterInput }>(
    "/projects/:projectId/meters",
    {
      onRequest: authenticate,
      preValidation: [
        validateParams(projectIdParamsSchema),
        validateBody(createMeterSchema),
      ],
    },
    createMeterHandler
  );

  // Get progression for all meters
  fastify.get<{ Params: ProjectParams }>(
    "/projects/:projectId/meters/progression",
    {
      onRequest: authenticate,
      preValidation: validateParams(projectIdParamsSchema),
    },
    getProgressionHandler
  );

  // Update meter
  fastify.put<{ Params: MeterParams; Body: UpdateMeterInput }>(
    "/meters/:meterId",
    {
      onRequest: authenticate,
      preValidation: [
        validateParams(meterIdParamsSchema),
        validateBody(updateMeterSchema),
      ],
    },
    updateMeterHandler
  );

  // Delete meter
  fastify.delete<{ Params: MeterParams }>(
    "/meters/:meterId",
    {
      onRequest: authenticate,
      preValidation: validateParams(meterIdParamsSchema),
    },
    deleteMeterHandler
  );
}
