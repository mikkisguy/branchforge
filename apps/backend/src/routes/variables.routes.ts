/**
 * Variables Routes
 *
 * Routes for variable management operations including listing,
 * getting, creating, updating, and deleting variables.
 */

import type { FastifyInstance } from "fastify";
import type { FastifyRequest, FastifyReply } from "fastify";
import {
  listVariables,
  getVariable,
  createVariable,
  updateVariable,
  deleteVariable,
  type PublicVariable,
} from "../services/variables.service.js";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  validateBody,
  validateParams,
} from "../middleware/validation.middleware.js";
import {
  createVariableSchema,
  updateVariableSchema,
  variableIdParamsSchema,
  projectIdParamsSchema,
  type CreateVariableInput,
  type UpdateVariableInput,
} from "../lib/validation.js";

// ============================================================================
// Types
// ============================================================================

interface ListVariablesResponse {
  variables: PublicVariable[];
}

interface GetVariableParams {
  variableId: string;
}

interface GetVariableResponse {
  variable: PublicVariable;
}

interface ListVariablesByProjectParams {
  projectId: string;
}

interface CreateVariableByProjectParams {
  projectId: string;
}

interface CreateVariableResponse {
  variable: PublicVariable;
}

interface UpdateVariableResponse {
  variable: PublicVariable;
}

interface ErrorResponse {
  error: string;
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * List all variables for a project
 *
 * GET /projects/:projectId/variables
 * Requires authentication
 */
async function listVariablesByProjectHandler(
  request: FastifyRequest<{ Params: ListVariablesByProjectParams }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const user = request.user!;

  const variables = await listVariables(projectId, user.id);

  reply.status(200).send({ variables } as ListVariablesResponse);
}

/**
 * Get a single variable by ID
 *
 * GET /variables/:variableId
 * Requires authentication
 */
async function getVariableHandler(
  request: FastifyRequest<{ Params: GetVariableParams }>,
  reply: FastifyReply
): Promise<void> {
  const { variableId } = request.params;
  const user = request.user!;

  const variable = await getVariable(variableId, user.id);

  if (!variable) {
    reply.status(404).send({ error: "Variable not found" } as ErrorResponse);
    return;
  }

  reply.status(200).send({ variable } as GetVariableResponse);
}

/**
 * Create a new variable for a project
 *
 * POST /projects/:projectId/variables
 * Requires authentication
 */
async function createVariableByProjectHandler(
  request: FastifyRequest<{
    Params: CreateVariableByProjectParams;
    Body: CreateVariableInput;
  }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const user = request.user!;
  const body = request.body;

  const variable = await createVariable(user.id, projectId, body);

  reply.status(201).send({ variable } as CreateVariableResponse);
}

/**
 * Update an existing variable
 *
 * PATCH /variables/:variableId
 * Requires authentication
 */
async function updateVariableHandler(
  request: FastifyRequest<{
    Params: GetVariableParams;
    Body: UpdateVariableInput;
  }>,
  reply: FastifyReply
): Promise<void> {
  const { variableId } = request.params;
  const user = request.user!;
  const body = request.body;

  const variable = await updateVariable(variableId, user.id, body);

  if (!variable) {
    reply.status(404).send({ error: "Variable not found" } as ErrorResponse);
    return;
  }

  reply.status(200).send({ variable } as UpdateVariableResponse);
}

/**
 * Delete a variable
 *
 * DELETE /variables/:variableId
 * Requires authentication
 */
async function deleteVariableHandler(
  request: FastifyRequest<{ Params: GetVariableParams }>,
  reply: FastifyReply
): Promise<void> {
  const { variableId } = request.params;
  const user = request.user!;

  await deleteVariable(variableId, user.id);

  reply.status(204).send();
}

// ============================================================================
// Routes Registration
// ============================================================================

export async function variablesRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication

  // List variables for a project
  fastify.get<{ Params: ListVariablesByProjectParams }>(
    "/projects/:projectId/variables",
    {
      onRequest: authenticate,
      preValidation: validateParams(projectIdParamsSchema),
    },
    listVariablesByProjectHandler
  );

  // Create variable for a project
  fastify.post<{
    Params: CreateVariableByProjectParams;
    Body: CreateVariableInput;
  }>(
    "/projects/:projectId/variables",
    {
      onRequest: authenticate,
      preValidation: [
        validateParams(projectIdParamsSchema),
        validateBody(createVariableSchema),
      ],
    },
    createVariableByProjectHandler
  );

  // Get a single variable
  fastify.get<{ Params: GetVariableParams }>(
    "/variables/:variableId",
    {
      onRequest: authenticate,
      preValidation: validateParams(variableIdParamsSchema),
    },
    getVariableHandler
  );

  // Update a variable
  fastify.patch<{
    Params: GetVariableParams;
    Body: UpdateVariableInput;
  }>(
    "/variables/:variableId",
    {
      onRequest: authenticate,
      preValidation: [
        validateParams(variableIdParamsSchema),
        validateBody(updateVariableSchema),
      ],
    },
    updateVariableHandler
  );

  // Delete a variable
  fastify.delete<{ Params: GetVariableParams }>(
    "/variables/:variableId",
    {
      onRequest: authenticate,
      preValidation: validateParams(variableIdParamsSchema),
    },
    deleteVariableHandler
  );
}
