/**
 * Labels Routes
 *
 * Routes for label management operations including listing labels for a project
 * and getting detailed label information with lines and characters.
 */

import type { FastifyInstance } from "fastify";
import type { FastifyRequest, FastifyReply } from "fastify";
import {
  listLabels,
  getLabel,
  createLabel,
  updateLabel,
  deleteLabel,
  getLabelCharacters,
  updateLabelDialogue,
  cleanupLabelWordCounts,
  type PublicLabel,
  type LabelDetail,
  type ListLabelsFilters,
  type LabelCharacterWithInfo,
} from "../services/labels.service.js";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  validateQuery,
  validateParams,
  validateBody,
} from "../middleware/validation.middleware.js";
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
} from "../middleware/error-handler.middleware.js";
import {
  listLabelsQuerySchema,
  labelIdParamsSchema,
  updateLabelDialogueBodySchema,
  createLabelSchema,
  updateLabelSchema,
  type ListLabelsQuery,
  type UpdateLabelDialogueInput,
  type CreateLabelInput,
  type UpdateLabelInput,
} from "../lib/validation.js";
import { trackWordsForLabel } from "../services/word-count.service.js";

// ============================================================================
// Types
// ============================================================================

interface ListLabelsResponse {
  labels: PublicLabel[];
}

interface GetLabelParams {
  labelId: string;
}

interface GetLabelResponse {
  label: LabelDetail;
}

interface ErrorResponse {
  error: string;
}

interface LabelCharactersResponse {
  characters: LabelCharacterWithInfo[];
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * List all labels for a project
 *
 * GET /labels?projectId=xxx&route=xxx&status=xxx
 * Requires authentication
 */
async function listLabelsHandler(
  request: FastifyRequest<{ Querystring: ListLabelsQuery }>,
  reply: FastifyReply
): Promise<void> {
  const user = request.user!;
  const { projectId, routeKey, status } = request.query;

  // Build filters
  const filters: ListLabelsFilters = {};
  if (routeKey) {
    filters.routeKey = routeKey;
  }
  if (status) {
    filters.status = status;
  }

  try {
    const labels = await listLabels(projectId, user.id, filters);
    reply.status(200).send({ labels } as ListLabelsResponse);
  } catch (error) {
    request.log.error(error);
    reply.status(500).send({ error: "Internal server error" } as ErrorResponse);
  }
}

/**
 * Get a single label by ID with full details
 *
 * GET /labels/:labelId
 * Requires authentication
 */
async function getLabelHandler(
  request: FastifyRequest<{ Params: GetLabelParams }>,
  reply: FastifyReply
): Promise<void> {
  const { labelId } = request.params;
  const user = request.user!;

  try {
    const label = await getLabel(labelId, user.id);

    if (!label) {
      reply.status(404).send({ error: "Label not found" } as ErrorResponse);
      return;
    }

    reply.status(200).send({ label } as GetLabelResponse);
  } catch (error) {
    request.log.error(error);
    reply.status(500).send({ error: "Internal server error" } as ErrorResponse);
  }
}

/**
 * Update label dialogue
 *
 * PUT /labels/:labelId/dialogue
 * Body: { dialogue: Array<{ speaker: string | null; text: string }> }
 *
 * Updates dialogue for a label (Write Mode) and reconstructs the file.
 * This is used when Write Mode saves dialogue changes.
 * Sets updatedBy, increments version, calculates contentHash, and marks as modified_local.
 */
async function updateLabelDialogueHandler(
  request: FastifyRequest<{
    Params: GetLabelParams;
    Body: UpdateLabelDialogueInput;
  }>,
  reply: FastifyReply
): Promise<void> {
  const { labelId } = request.params;
  const { dialogue, menuBlocks, expectedVersion, expectedContentHash } =
    request.body;
  const user = request.user!;

  try {
    const result = await updateLabelDialogue({
      labelId,
      dialogue,
      menuBlocks,
      expectedVersion,
      expectedContentHash,
      userId: user.id,
    });

    if (result.type === "conflict") {
      reply.status(409).send(result);
      return;
    }

    // Track word counts for daily writing goals (non-critical)
    try {
      await trackWordsForLabel({
        labelId,
        userId: user.id,
        dialogue,
      });
    } catch (error) {
      request.log.error(
        { error, userId: user.id, labelId },
        "Failed to track word count for daily writing goal"
      );
    }

    reply.send({
      success: true,
      version: result.version,
      contentHash: result.contentHash,
      fileContentHash: result.fileContentHash,
      fileUpdatedAt: result.fileUpdatedAt,
    });
  } catch (error) {
    request.log.error(error);
    if (error instanceof NotFoundError) {
      reply.status(404).send({ error: "Project not found" } as ErrorResponse);
      return;
    }
    if (error instanceof ForbiddenError) {
      reply.status(403).send({ error: "Forbidden" } as ErrorResponse);
      return;
    }
    if (error instanceof ValidationError) {
      reply
        .status(400)
        .send({ error: (error as Error).message } as ErrorResponse);
      return;
    }
    reply.status(500).send({ error: "Internal server error" } as ErrorResponse);
  }
}

/**
 * Create a new label
 *
 * POST /labels
 * Body: CreateLabelInput
 * Requires authentication
 */
async function createLabelHandler(
  request: FastifyRequest<{ Body: CreateLabelInput }>,
  reply: FastifyReply
): Promise<void> {
  const user = request.user!;

  try {
    const label = await createLabel(user.id, request.body);
    reply.status(201).send({ label });
  } catch (error) {
    request.log.error(error);

    // Handle known error types
    if (error instanceof NotFoundError) {
      reply.status(404).send({ error: "Project not found" } as ErrorResponse);
      return;
    }
    if (error instanceof ForbiddenError) {
      reply.status(403).send({ error: "Forbidden" } as ErrorResponse);
      return;
    }
    if (error instanceof ValidationError) {
      reply.status(400).send({ error: "Bad request" } as ErrorResponse);
      return;
    }

    reply.status(500).send({ error: "Internal server error" } as ErrorResponse);
  }
}

/**
 * Update label metadata
 *
 * PUT /labels/:labelId
 * Body: UpdateLabelInput
 * Requires authentication
 */
async function updateLabelHandler(
  request: FastifyRequest<{
    Params: GetLabelParams;
    Body: UpdateLabelInput;
  }>,
  reply: FastifyReply
): Promise<void> {
  const { labelId } = request.params;
  const user = request.user!;

  try {
    const label = await updateLabel(
      labelId,
      user.id,
      request.body,
      request.body.version
    );
    reply.status(200).send({ label });
  } catch (error) {
    request.log.error(error);

    // Handle known error types
    if (error instanceof NotFoundError) {
      reply.status(404).send({ error: "Label not found" } as ErrorResponse);
      return;
    }
    if (error instanceof ForbiddenError) {
      reply.status(403).send({ error: "Forbidden" } as ErrorResponse);
      return;
    }

    reply.status(500).send({ error: "Internal server error" } as ErrorResponse);
  }
}

/**
 * Soft delete a label
 *
 * DELETE /labels/:labelId
 * Requires authentication
 */
async function deleteLabelHandler(
  request: FastifyRequest<{ Params: GetLabelParams }>,
  reply: FastifyReply
): Promise<void> {
  const { labelId } = request.params;
  const user = request.user!;

  try {
    await deleteLabel(labelId, user.id);

    // Clean up labelWordCounts in userSettings after label deletion
    // Non-critical: if cleanup fails, the delete is still successful
    try {
      await cleanupLabelWordCounts(labelId, user.id);
    } catch (error) {
      request.log.error(
        { error, userId: user.id, labelId },
        "Failed to clean up labelWordCounts after label deletion"
      );
    }

    reply.status(204).send();
  } catch (error) {
    request.log.error(error);

    // Handle known error types
    if (error instanceof NotFoundError) {
      reply.status(404).send({ error: "Label not found" } as ErrorResponse);
      return;
    }
    if (error instanceof ForbiddenError) {
      reply.status(403).send({ error: "Forbidden" } as ErrorResponse);
      return;
    }

    reply.status(500).send({ error: "Internal server error" } as ErrorResponse);
  }
}

/**
 * Get all characters for a label
 *
 * GET /labels/:labelId/characters
 * Requires authentication
 */
async function getLabelCharactersHandler(
  request: FastifyRequest<{ Params: GetLabelParams }>,
  reply: FastifyReply
): Promise<void> {
  const { labelId } = request.params;
  const user = request.user!;

  try {
    const labelCharacters = await getLabelCharacters(labelId, user.id);
    reply
      .status(200)
      .send({ characters: labelCharacters } as LabelCharactersResponse);
  } catch (error) {
    request.log.error(error);

    // Handle known error types
    if (error instanceof NotFoundError) {
      reply.status(404).send({ error: "Label not found" } as ErrorResponse);
      return;
    }
    if (error instanceof ForbiddenError) {
      reply.status(403).send({ error: "Forbidden" } as ErrorResponse);
      return;
    }

    reply.status(500).send({ error: "Internal server error" } as ErrorResponse);
  }
}

// ============================================================================
// Routes Registration
// ============================================================================

export async function labelsRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.get<{ Querystring: ListLabelsQuery }>(
    "/labels",
    {
      onRequest: authenticate,
      preValidation: validateQuery(listLabelsQuerySchema),
    },
    listLabelsHandler
  );
  fastify.get<{ Params: GetLabelParams }>(
    "/labels/:labelId",
    {
      onRequest: authenticate,
      preValidation: validateParams(labelIdParamsSchema),
    },
    getLabelHandler
  );
  fastify.post<{ Body: CreateLabelInput }>(
    "/labels",
    {
      onRequest: authenticate,
      preValidation: validateBody(createLabelSchema),
    },
    createLabelHandler
  );
  fastify.put<{ Params: GetLabelParams; Body: UpdateLabelInput }>(
    "/labels/:labelId",
    {
      onRequest: authenticate,
      preValidation: [
        validateParams(labelIdParamsSchema),
        validateBody(updateLabelSchema),
      ],
    },
    updateLabelHandler
  );
  fastify.delete<{ Params: GetLabelParams }>(
    "/labels/:labelId",
    {
      onRequest: authenticate,
      preValidation: validateParams(labelIdParamsSchema),
    },
    deleteLabelHandler
  );
  fastify.put<{ Params: GetLabelParams; Body: UpdateLabelDialogueInput }>(
    "/labels/:labelId/dialogue",
    {
      onRequest: authenticate,
      preValidation: [
        validateParams(labelIdParamsSchema),
        validateBody(updateLabelDialogueBodySchema),
      ],
    },
    updateLabelDialogueHandler
  );
  fastify.get<{ Params: GetLabelParams }>(
    "/labels/:labelId/characters",
    {
      onRequest: authenticate,
      preValidation: validateParams(labelIdParamsSchema),
    },
    getLabelCharactersHandler
  );
}
