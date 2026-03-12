/**
 * State Variables Routes
 *
 * Routes for state variable management operations including listing,
 * getting, creating, updating, and deleting state variables.
 */

import type { FastifyInstance } from "fastify";
import type { FastifyRequest, FastifyReply } from "fastify";
import {
  listStateVariables,
  getStateVariable,
  createStateVariable,
  updateStateVariable,
  deleteStateVariable,
  type PublicStateVariable,
} from "../services/state_variables.service.js";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  validateBody,
  validateParams,
} from "../middleware/validation.middleware.js";
import {
  createStateVariableSchema,
  updateStateVariableSchema,
  stateVariableIdParamsSchema,
  projectIdParamsSchema,
  type CreateStateVariableInput,
  type UpdateStateVariableInput,
} from "../lib/validation.js";

// ============================================================================
// Types
// ============================================================================

interface ListStateVariablesResponse {
  stateVariables: PublicStateVariable[];
}

interface GetStateVariableParams {
  stateVariableId: string;
}

interface GetStateVariableResponse {
  stateVariable: PublicStateVariable;
}

interface ListStateVariablesByProjectParams {
  projectId: string;
}

interface CreateStateVariableByProjectParams {
  projectId: string;
}

interface CreateStateVariableResponse {
  stateVariable: PublicStateVariable;
}

interface UpdateStateVariableResponse {
  stateVariable: PublicStateVariable;
}

interface ErrorResponse {
  error: string;
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * List all state variables for a project
 *
 * GET /projects/:projectId/state-variables
 * Requires authentication
 */
async function listStateVariablesByProjectHandler(
  request: FastifyRequest<{ Params: ListStateVariablesByProjectParams }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const user = request.user!;

  const stateVariables = await listStateVariables(projectId, user.id);

  reply.status(200).send({ stateVariables } as ListStateVariablesResponse);
}

/**
 * Get a single state variable by ID
 *
 * GET /state-variables/:stateVariableId
 * Requires authentication
 */
async function getStateVariableHandler(
  request: FastifyRequest<{ Params: GetStateVariableParams }>,
  reply: FastifyReply
): Promise<void> {
  const { stateVariableId } = request.params;
  const user = request.user!;

  const stateVariable = await getStateVariable(stateVariableId, user.id);

  if (!stateVariable) {
    reply
      .status(404)
      .send({ error: "State variable not found" } as ErrorResponse);
    return;
  }

  reply.status(200).send({ stateVariable } as GetStateVariableResponse);
}

/**
 * Create a new state variable for a project
 *
 * POST /projects/:projectId/state-variables
 * Requires authentication
 */
async function createStateVariableByProjectHandler(
  request: FastifyRequest<{
    Params: CreateStateVariableByProjectParams;
    Body: CreateStateVariableInput;
  }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const user = request.user!;
  const body = request.body;

  const stateVariable = await createStateVariable(user.id, projectId, body);

  reply.status(201).send({ stateVariable } as CreateStateVariableResponse);
}

/**
 * Update an existing state variable
 *
 * PATCH /state-variables/:stateVariableId
 * Requires authentication
 */
async function updateStateVariableHandler(
  request: FastifyRequest<{
    Params: GetStateVariableParams;
    Body: UpdateStateVariableInput;
  }>,
  reply: FastifyReply
): Promise<void> {
  const { stateVariableId } = request.params;
  const user = request.user!;
  const body = request.body;

  const stateVariable = await updateStateVariable(
    stateVariableId,
    user.id,
    body
  );

  if (!stateVariable) {
    reply
      .status(404)
      .send({ error: "State variable not found" } as ErrorResponse);
    return;
  }

  reply.status(200).send({ stateVariable } as UpdateStateVariableResponse);
}

/**
 * Delete a state variable
 *
 * DELETE /state-variables/:stateVariableId
 * Requires authentication
 */
async function deleteStateVariableHandler(
  request: FastifyRequest<{ Params: GetStateVariableParams }>,
  reply: FastifyReply
): Promise<void> {
  const { stateVariableId } = request.params;
  const user = request.user!;

  await deleteStateVariable(stateVariableId, user.id);

  reply.status(204).send();
}

// ============================================================================
// Routes Registration
// ============================================================================

export async function stateVariablesRoutes(
  fastify: FastifyInstance
): Promise<void> {
  // All routes require authentication

  // List state variables for a project
  fastify.get<{ Params: ListStateVariablesByProjectParams }>(
    "/projects/:projectId/state-variables",
    {
      onRequest: authenticate,
      preValidation: validateParams(projectIdParamsSchema),
    },
    listStateVariablesByProjectHandler
  );

  // Create state variable for a project
  fastify.post<{
    Params: CreateStateVariableByProjectParams;
    Body: CreateStateVariableInput;
  }>(
    "/projects/:projectId/state-variables",
    {
      onRequest: authenticate,
      preValidation: [
        validateParams(projectIdParamsSchema),
        validateBody(createStateVariableSchema),
      ],
    },
    createStateVariableByProjectHandler
  );

  // Get a single state variable
  fastify.get<{ Params: GetStateVariableParams }>(
    "/state-variables/:stateVariableId",
    {
      onRequest: authenticate,
      preValidation: validateParams(stateVariableIdParamsSchema),
    },
    getStateVariableHandler
  );

  // Update a state variable
  fastify.patch<{
    Params: GetStateVariableParams;
    Body: UpdateStateVariableInput;
  }>(
    "/state-variables/:stateVariableId",
    {
      onRequest: authenticate,
      preValidation: [
        validateParams(stateVariableIdParamsSchema),
        validateBody(updateStateVariableSchema),
      ],
    },
    updateStateVariableHandler
  );

  // Delete a state variable
  fastify.delete<{ Params: GetStateVariableParams }>(
    "/state-variables/:stateVariableId",
    {
      onRequest: authenticate,
      preValidation: validateParams(stateVariableIdParamsSchema),
    },
    deleteStateVariableHandler
  );
}
