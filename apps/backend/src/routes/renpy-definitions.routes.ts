/**
 * Ren'Py Definitions Routes
 *
 * Routes for Ren'Py definition management operations including listing,
 * getting, creating, updating, and deleting Ren'Py definitions.
 */

import type { FastifyInstance } from "fastify";
import type { FastifyRequest, FastifyReply } from "fastify";
import {
  listRenpyDefinitions,
  getRenpyDefinition,
  createRenpyDefinition,
  updateRenpyDefinition,
  deleteRenpyDefinition,
  type PublicRenpyDefinition,
} from "../services/renpy-definitions.service.js";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  validateBody,
  validateParams,
} from "../middleware/validation.middleware.js";
import {
  createRenpyDefinitionSchema,
  updateRenpyDefinitionSchema,
  renpyDefinitionIdParamsSchema,
  projectIdParamsSchema,
  type CreateRenpyDefinitionInput,
  type UpdateRenpyDefinitionInput,
} from "../lib/validation.js";

// ============================================================================
// Types
// ============================================================================

interface ListRenpyDefinitionsResponse {
  renpyDefinitions: PublicRenpyDefinition[];
}

interface GetRenpyDefinitionParams {
  renpyDefinitionId: string;
}

interface GetRenpyDefinitionResponse {
  renpyDefinition: PublicRenpyDefinition;
}

interface ListRenpyDefinitionsByProjectParams {
  projectId: string;
}

interface CreateRenpyDefinitionByProjectParams {
  projectId: string;
}

interface CreateRenpyDefinitionResponse {
  renpyDefinition: PublicRenpyDefinition;
}

interface UpdateRenpyDefinitionResponse {
  renpyDefinition: PublicRenpyDefinition;
}

interface ErrorResponse {
  error: string;
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * List all Ren'Py definitions for a project
 *
 * GET /projects/:projectId/renpy-definitions
 * Requires authentication
 */
async function listRenpyDefinitionsByProjectHandler(
  request: FastifyRequest<{ Params: ListRenpyDefinitionsByProjectParams }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const user = request.user!;

  const renpyDefinitions = await listRenpyDefinitions(projectId, user.id);

  reply
    .status(200)
    .send({ renpyDefinitions } as ListRenpyDefinitionsResponse);
}

/**
 * Get a single Ren'Py definition by ID
 *
 * GET /renpy-definitions/:renpyDefinitionId
 * Requires authentication
 */
async function getRenpyDefinitionHandler(
  request: FastifyRequest<{ Params: GetRenpyDefinitionParams }>,
  reply: FastifyReply
): Promise<void> {
  const { renpyDefinitionId } = request.params;
  const user = request.user!;

  const renpyDefinition = await getRenpyDefinition(
    renpyDefinitionId,
    user.id
  );

  if (!renpyDefinition) {
    reply
      .status(404)
      .send({ error: "Ren'Py definition not found" } as ErrorResponse);
    return;
  }

  reply
    .status(200)
    .send({ renpyDefinition } as GetRenpyDefinitionResponse);
}

/**
 * Create a new Ren'Py definition for a project
 *
 * POST /projects/:projectId/renpy-definitions
 * Requires authentication
 */
async function createRenpyDefinitionByProjectHandler(
  request: FastifyRequest<{
    Params: CreateRenpyDefinitionByProjectParams;
    Body: CreateRenpyDefinitionInput;
  }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const user = request.user!;
  const body = request.body;

  const renpyDefinition = await createRenpyDefinition(
    user.id,
    projectId,
    body
  );

  reply
    .status(201)
    .send({ renpyDefinition } as CreateRenpyDefinitionResponse);
}

/**
 * Update an existing Ren'Py definition
 *
 * PATCH /renpy-definitions/:renpyDefinitionId
 * Requires authentication
 */
async function updateRenpyDefinitionHandler(
  request: FastifyRequest<{
    Params: GetRenpyDefinitionParams;
    Body: UpdateRenpyDefinitionInput;
  }>,
  reply: FastifyReply
): Promise<void> {
  const { renpyDefinitionId } = request.params;
  const user = request.user!;
  const body = request.body;

  const renpyDefinition = await updateRenpyDefinition(
    renpyDefinitionId,
    user.id,
    body
  );

  if (!renpyDefinition) {
    reply
      .status(404)
      .send({ error: "Ren'Py definition not found" } as ErrorResponse);
    return;
  }

  reply
    .status(200)
    .send({ renpyDefinition } as UpdateRenpyDefinitionResponse);
}

/**
 * Delete a Ren'Py definition
 *
 * DELETE /renpy-definitions/:renpyDefinitionId
 * Requires authentication
 */
async function deleteRenpyDefinitionHandler(
  request: FastifyRequest<{ Params: GetRenpyDefinitionParams }>,
  reply: FastifyReply
): Promise<void> {
  const { renpyDefinitionId } = request.params;
  const user = request.user!;

  await deleteRenpyDefinition(renpyDefinitionId, user.id);

  reply.status(204).send();
}

// ============================================================================
// Routes Registration
// ============================================================================

export async function renpyDefinitionsRoutes(
  fastify: FastifyInstance
): Promise<void> {
  // All routes require authentication

  // List Ren'Py definitions for a project
  fastify.get<{ Params: ListRenpyDefinitionsByProjectParams }>(
    "/projects/:projectId/renpy-definitions",
    {
      onRequest: authenticate,
      preValidation: validateParams(projectIdParamsSchema),
    },
    listRenpyDefinitionsByProjectHandler
  );

  // Create Ren'Py definition for a project
  fastify.post<{
    Params: CreateRenpyDefinitionByProjectParams;
    Body: CreateRenpyDefinitionInput;
  }>(
    "/projects/:projectId/renpy-definitions",
    {
      onRequest: authenticate,
      preValidation: [
        validateParams(projectIdParamsSchema),
        validateBody(createRenpyDefinitionSchema),
      ],
    },
    createRenpyDefinitionByProjectHandler
  );

  // Get a single Ren'Py definition
  fastify.get<{ Params: GetRenpyDefinitionParams }>(
    "/renpy-definitions/:renpyDefinitionId",
    {
      onRequest: authenticate,
      preValidation: validateParams(renpyDefinitionIdParamsSchema),
    },
    getRenpyDefinitionHandler
  );

  // Update a Ren'Py definition
  fastify.patch<{
    Params: GetRenpyDefinitionParams;
    Body: UpdateRenpyDefinitionInput;
  }>(
    "/renpy-definitions/:renpyDefinitionId",
    {
      onRequest: authenticate,
      preValidation: [
        validateParams(renpyDefinitionIdParamsSchema),
        validateBody(updateRenpyDefinitionSchema),
      ],
    },
    updateRenpyDefinitionHandler
  );

  // Delete a Ren'Py definition
  fastify.delete<{ Params: GetRenpyDefinitionParams }>(
    "/renpy-definitions/:renpyDefinitionId",
    {
      onRequest: authenticate,
      preValidation: validateParams(renpyDefinitionIdParamsSchema),
    },
    deleteRenpyDefinitionHandler
  );
}
