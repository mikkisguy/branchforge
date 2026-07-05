/**
 * World Elements Routes
 *
 * Routes for world element management including listing,
 * creating, updating, and deleting world elements.
 */

import type { FastifyInstance } from "fastify";
import type { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  listWorldElements,
  getWorldElement,
  createWorldElement,
  updateWorldElement,
  deleteWorldElement,
  type PublicWorldElement,
} from "../services/world-elements.service.js";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  validateBody,
  validateParams,
} from "../middleware/validation.middleware.js";
import { NotFoundError } from "../middleware/error-handler.middleware.js";
import {
  createWorldElementSchema,
  updateWorldElementSchema,
  worldElementIdParamsSchema,
  projectIdParamsSchema,
  type CreateWorldElementInput,
  type UpdateWorldElementInput,
} from "../lib/validation.js";

// ============================================================================
// Types
// ============================================================================

interface ListWorldElementsResponse {
  elements: PublicWorldElement[];
}

type GetWorldElementParams = z.infer<typeof worldElementIdParamsSchema>;

interface GetWorldElementResponse {
  element: PublicWorldElement;
}

type ListByProjectParams = z.infer<typeof projectIdParamsSchema>;

interface CreateWorldElementResponse {
  element: PublicWorldElement;
}

interface UpdateWorldElementResponse {
  element: PublicWorldElement;
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * List all world elements for a project
 *
 * GET /projects/:projectId/world-elements
 */
async function listWorldElementsHandler(
  request: FastifyRequest<{ Params: ListByProjectParams }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const user = request.user!;

  const elements = await listWorldElements(projectId, user.id);

  reply.status(200).send({ elements } as ListWorldElementsResponse);
}

/**
 * Get a single world element by ID
 *
 * GET /world-elements/:elementId
 */
async function getWorldElementHandler(
  request: FastifyRequest<{ Params: GetWorldElementParams }>,
  reply: FastifyReply
): Promise<void> {
  const { elementId } = request.params;
  const user = request.user!;

  const element = await getWorldElement(elementId, user.id);

  if (!element) {
    throw new NotFoundError("World element not found");
  }

  reply.status(200).send({ element } as GetWorldElementResponse);
}

/**
 * Create a new world element for a project
 *
 * POST /projects/:projectId/world-elements
 */
async function createWorldElementHandler(
  request: FastifyRequest<{
    Params: ListByProjectParams;
    Body: CreateWorldElementInput;
  }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const user = request.user!;
  const body = request.body;

  const element = await createWorldElement(projectId, user.id, body);

  reply.status(201).send({ element } as CreateWorldElementResponse);
}

/**
 * Update an existing world element
 *
 * PATCH /world-elements/:elementId
 */
async function updateWorldElementHandler(
  request: FastifyRequest<{
    Params: GetWorldElementParams;
    Body: UpdateWorldElementInput;
  }>,
  reply: FastifyReply
): Promise<void> {
  const { elementId } = request.params;
  const user = request.user!;
  const body = request.body;

  const element = await updateWorldElement(elementId, user.id, body);

  reply.status(200).send({ element } as UpdateWorldElementResponse);
}

/**
 * Delete a world element
 *
 * DELETE /world-elements/:elementId
 */
async function deleteWorldElementHandler(
  request: FastifyRequest<{ Params: GetWorldElementParams }>,
  reply: FastifyReply
): Promise<void> {
  const { elementId } = request.params;
  const user = request.user!;

  await deleteWorldElement(elementId, user.id);

  reply.status(204).send();
}

// ============================================================================
// Routes Registration
// ============================================================================

export async function worldElementsRoutes(
  fastify: FastifyInstance
): Promise<void> {
  // All routes require authentication

  // List world elements for a project
  fastify.get<{ Params: ListByProjectParams }>(
    "/projects/:projectId/world-elements",
    {
      onRequest: authenticate,
      preValidation: validateParams(projectIdParamsSchema),
    },
    listWorldElementsHandler
  );

  // Create world element for a project
  fastify.post<{
    Params: ListByProjectParams;
    Body: CreateWorldElementInput;
  }>(
    "/projects/:projectId/world-elements",
    {
      onRequest: authenticate,
      preValidation: [
        validateParams(projectIdParamsSchema),
        validateBody(createWorldElementSchema),
      ],
    },
    createWorldElementHandler
  );

  // Get a single world element
  fastify.get<{ Params: GetWorldElementParams }>(
    "/world-elements/:elementId",
    {
      onRequest: authenticate,
      preValidation: validateParams(worldElementIdParamsSchema),
    },
    getWorldElementHandler
  );

  // Update a world element
  fastify.patch<{
    Params: GetWorldElementParams;
    Body: UpdateWorldElementInput;
  }>(
    "/world-elements/:elementId",
    {
      onRequest: authenticate,
      preValidation: [
        validateParams(worldElementIdParamsSchema),
        validateBody(updateWorldElementSchema),
      ],
    },
    updateWorldElementHandler
  );

  // Delete a world element
  fastify.delete<{ Params: GetWorldElementParams }>(
    "/world-elements/:elementId",
    {
      onRequest: authenticate,
      preValidation: validateParams(worldElementIdParamsSchema),
    },
    deleteWorldElementHandler
  );
}
