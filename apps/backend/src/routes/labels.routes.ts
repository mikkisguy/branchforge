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
  reconstructFileForLabel,
  type PublicLabel,
  type LabelDetail,
  type ListLabelsFilters,
  type LabelCharacterWithInfo,
} from "../services/labels.service.js";
import { requireProjectOwnership } from "../services/authz.service.js";
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
import { getDb } from "../db/index.js";
import {
  labels,
  labelLines,
  projectFiles,
  userSettings,
  characters,
} from "../db/schema/index.js";
import { eq, asc, inArray, isNull, and, sql } from "drizzle-orm";
import { calculateDialogueHash } from "../lib/hash.js";
import { updateAuditFields } from "../lib/audit.js";
import { calculateContentHash } from "../lib/hash.js";
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

// UpdateLabelDialogueBody is now imported from validation.ts as UpdateLabelDialogueInput

interface UpdateLabelDialogueResponse {
  success: boolean;
  version: number;
  contentHash: string;
  fileContentHash: string;
  fileUpdatedAt: string;
  conflict?: {
    reason: "STALE_LABEL_VERSION" | "STALE_CONTENT_HASH";
    currentVersion: number;
    currentContentHash: string | null;
  };
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
  const { dialogue, expectedVersion, expectedContentHash } = request.body;
  const user = request.user!;

  try {
    const db = getDb();

    // Get label with file info and current version
    const [label] = await db
      .select({
        id: labels.id,
        projectId: labels.projectId,
        projectFileId: labels.projectFileId,
        version: labels.version,
        contentHash: labels.contentHash,
        labelPosition: labels.labelPosition,
      })
      .from(labels)
      .where(and(eq(labels.id, labelId), isNull(labels.deletedAt)))
      .limit(1);

    if (!label || !label.projectFileId) {
      reply
        .status(404)
        .send({ error: "Label or file not found" } as ErrorResponse);
      return;
    }

    // Get the project file
    const [projectFile] = await db
      .select()
      .from(projectFiles)
      .where(eq(projectFiles.id, label.projectFileId))
      .limit(1);

    if (!projectFile) {
      reply.status(404).send({ error: "File not found" } as ErrorResponse);
      return;
    }

    // Verify user owns the project
    await requireProjectOwnership(label.projectId, user.id);

    // Validate that all speakerIds exist in the characters table for this project
    const speakerIdsInDialogue = dialogue
      .map((entry) => entry.speakerId)
      .filter((id): id is string => id !== null);

    if (speakerIdsInDialogue.length > 0) {
      const uniqueSpeakerIds = Array.from(new Set(speakerIdsInDialogue));

      const existingCharacters = await db
        .select({ id: characters.id })
        .from(characters)
        .where(
          and(
            eq(characters.projectId, label.projectId),
            inArray(characters.id, uniqueSpeakerIds)
          )
        );

      const existingCharacterIds = new Set(existingCharacters.map((c) => c.id));
      const invalidSpeakerIds = uniqueSpeakerIds.filter(
        (id) => !existingCharacterIds.has(id)
      );

      if (invalidSpeakerIds.length > 0) {
        reply.status(400).send({
          error: `Invalid speakerId(s): ${invalidSpeakerIds.join(
            ", "
          )}. Character(s) not found in this project.`,
        } as ErrorResponse);
        return;
      }
    }

    // Calculate content hash for new dialogue
    const contentHash = calculateDialogueHash(dialogue);

    const updateResult = await db.transaction(async (tx) => {
      // Serialize concurrent updates for the same label to avoid duplicate rows
      // from overlapping delete + insert operations.
      await tx.execute(
        sql`SELECT id FROM labels WHERE id = ${labelId} FOR UPDATE`
      );

      const [lockedLabel] = await tx
        .select({
          version: labels.version,
          contentHash: labels.contentHash,
          projectFileId: labels.projectFileId,
          labelPosition: labels.labelPosition,
        })
        .from(labels)
        .where(and(eq(labels.id, labelId), isNull(labels.deletedAt)))
        .limit(1);

      if (!lockedLabel || !lockedLabel.projectFileId) {
        throw new NotFoundError("Label or file not found");
      }

      await tx.execute(
        sql`SELECT id FROM project_files WHERE id = ${lockedLabel.projectFileId} FOR UPDATE`
      );

      const [lockedProjectFile] = await tx
        .select()
        .from(projectFiles)
        .where(eq(projectFiles.id, lockedLabel.projectFileId))
        .limit(1);

      if (!lockedProjectFile) {
        throw new NotFoundError("File");
      }

      const lockedCurrentVersion = lockedLabel.version ?? 1;
      if (
        expectedVersion !== undefined &&
        expectedVersion !== lockedCurrentVersion
      ) {
        return {
          conflictPayload: {
            success: false,
            version: lockedCurrentVersion,
            contentHash: lockedLabel.contentHash ?? "",
            fileContentHash: lockedProjectFile.contentHash,
            fileUpdatedAt: lockedProjectFile.updatedAt.toISOString(),
            conflict: {
              reason: "STALE_LABEL_VERSION",
              currentVersion: lockedCurrentVersion,
              currentContentHash: lockedLabel.contentHash,
            },
          } satisfies UpdateLabelDialogueResponse,
          nextVersion: lockedCurrentVersion,
          nextContentHash: lockedLabel.contentHash ?? "",
          nextFileContentHash: lockedProjectFile.contentHash,
          fileUpdatedAt: lockedProjectFile.updatedAt,
        };
      }

      if (
        expectedContentHash !== undefined &&
        (lockedLabel.contentHash ?? null) !== expectedContentHash
      ) {
        return {
          conflictPayload: {
            success: false,
            version: lockedCurrentVersion,
            contentHash: lockedLabel.contentHash ?? "",
            fileContentHash: lockedProjectFile.contentHash,
            fileUpdatedAt: lockedProjectFile.updatedAt.toISOString(),
            conflict: {
              reason: "STALE_CONTENT_HASH",
              currentVersion: lockedCurrentVersion,
              currentContentHash: lockedLabel.contentHash,
            },
          } satisfies UpdateLabelDialogueResponse,
          nextVersion: lockedCurrentVersion,
          nextContentHash: lockedLabel.contentHash ?? "",
          nextFileContentHash: lockedProjectFile.contentHash,
          fileUpdatedAt: lockedProjectFile.updatedAt,
        };
      }

      // 1. Fetch existing lines with FOR UPDATE to preserve IDs and handle updates/inserts/deletes
      const existingLines = await tx
        .select()
        .from(labelLines)
        .where(
          and(eq(labelLines.labelId, labelId), isNull(labelLines.deletedAt))
        )
        .orderBy(asc(labelLines.sequence));

      const existingLinesBySequence = new Map(
        existingLines.map((line) => [line.sequence, line])
      );

      const newSequences = new Set<number>();

      // 2. Update existing rows and insert new rows for each entry
      for (const [index, entry] of dialogue.entries()) {
        const sequence = index + 1;
        newSequences.add(sequence);

        const existingLine = existingLinesBySequence.get(sequence);

        const values = {
          contentType: (entry.speakerId ? "DIALOGUE" : "NARRATION") as
            | "DIALOGUE"
            | "NARRATION",
          content: entry.text,
          speakerId: entry.speakerId,
          demoNotes: null,
          isDirty: true,
          projectFileId: lockedProjectFile.id,
          linePosition: (lockedLabel.labelPosition ?? 0) + index,
          contentHash: calculateContentHash(entry.text),
          lastSyncedHash: null,
        };

        if (existingLine) {
          // Update existing row, preserving its ID
          await tx
            .update(labelLines)
            .set(values)
            .where(eq(labelLines.id, existingLine.id));
        } else {
          // Insert new row for sequences that don't exist yet
          await tx.insert(labelLines).values({
            labelId,
            sequence,
            ...values,
          });
        }
      }

      // 3. Delete rows whose sequences are no longer present
      const sequencesToDelete = existingLines
        .filter((line) => !newSequences.has(line.sequence))
        .map((line) => line.id);

      if (sequencesToDelete.length > 0) {
        await tx
          .delete(labelLines)
          .where(inArray(labelLines.id, sequencesToDelete));
      }

      // 2. Update label with audit fields and sync status
      const auditFields = updateAuditFields(lockedCurrentVersion, user.id);
      await tx
        .update(labels)
        .set({
          ...auditFields,
          contentHash,
          syncStatus: "MODIFIED_LOCAL",
        })
        .where(eq(labels.id, labelId));

      const newContent = await reconstructFileForLabel(
        lockedProjectFile.id,
        tx
      );
      const newContentHash = calculateContentHash(newContent);
      const fileUpdatedAt = new Date();

      await tx
        .update(projectFiles)
        .set({
          content: newContent,
          contentHash: newContentHash,
          updatedAt: fileUpdatedAt,
        })
        .where(eq(projectFiles.id, lockedProjectFile.id));

      return {
        conflictPayload: null,
        nextVersion: (auditFields.version ?? lockedCurrentVersion) as number,
        nextContentHash: contentHash,
        nextFileContentHash: newContentHash,
        fileUpdatedAt,
      };
    });

    if (updateResult.conflictPayload) {
      reply.status(409).send(updateResult.conflictPayload);
      return;
    }

    // Track word counts for daily writing goals
    // This is non-critical: if tracking fails, the dialogue save is still successful
    try {
      await trackWordsForLabel({
        labelId,
        userId: user.id,
        dialogue,
      });
    } catch (error) {
      // Log the error but don't fail the request - the dialogue was already saved successfully
      request.log.error(
        {
          error,
          userId: user.id,
          labelId,
        },
        "Failed to track word count for daily writing goal"
      );
    }

    reply.send({
      success: true,
      version: updateResult.nextVersion,
      contentHash: updateResult.nextContentHash,
      fileContentHash: updateResult.nextFileContentHash,
      fileUpdatedAt: updateResult.fileUpdatedAt.toISOString(),
    } as UpdateLabelDialogueResponse);
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
    const label = await updateLabel(labelId, user.id, request.body);
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

    // Clean up labelWordCounts in userSettings when a label is deleted
    // This prevents orphaned entries from accumulating over time
    // This is non-critical: if cleanup fails, the delete is still successful
    try {
      const db = getDb();
      await db
        .update(userSettings)
        .set({
          labelWordCounts: sql`COALESCE(label_word_counts, '{}'::jsonb) - ${labelId}`,
        })
        .where(eq(userSettings.userId, user.id));
    } catch (error) {
      // Log the error but don't fail the request - the label was already deleted successfully
      request.log.error(
        {
          error,
          userId: user.id,
          labelId,
        },
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
