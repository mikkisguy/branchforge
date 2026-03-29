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
  type PublicLabel,
  type LabelDetail,
  type ListLabelsFilters,
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
  projects,
  labels,
  labelLines,
  projectFiles,
  userSettings,
} from "../db/schema/index.js";
import { eq, asc, inArray, isNull, and, sql } from "drizzle-orm";
import { reconstructRPYFile } from "../services/rpy-parser.service.js";
import { calculateDialogueHash } from "../lib/hash.js";
import { updateAuditFields } from "../lib/audit.js";
import { calculateContentHash } from "../lib/hash.js";
import {
  getTodayDateKey,
  updateTodayWordCount,
  countWordsFromDialogue,
  calculateNetNewWords,
  parseLabelWordCounts,
  parseDailyWordCounts,
} from "../lib/date-utils.js";

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
}

// Helper function to authorize project access
async function authorizeProjectAccess(
  projectId: string,
  userId: string,
  reply: FastifyReply
): Promise<boolean> {
  const db = getDb();

  const [project] = await db
    .select({ userId: projects.userId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    reply.status(404).send({ error: "Project not found" } as ErrorResponse);
    return false;
  }

  if (project.userId !== userId) {
    reply.status(403).send({ error: "Forbidden" } as ErrorResponse);
    return false;
  }

  return true;
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
  const { dialogue } = request.body;
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
    if (!(await authorizeProjectAccess(label.projectId, user.id, reply))) {
      return;
    }

    // Calculate content hash for new dialogue
    const contentHash = calculateDialogueHash(dialogue);

    // Update label_lines with new dialogue
    await db.transaction(async (tx) => {
      // Soft delete existing lines
      await tx
        .update(labelLines)
        .set({ deletedAt: new Date() })
        .where(
          and(eq(labelLines.labelId, labelId), isNull(labelLines.deletedAt))
        );

      const allValues = dialogue.map((entry, index) => ({
        labelId,
        sequence: index + 1,
        contentType: (entry.speaker ? "DIALOGUE" : "NARRATION") as
          | "DIALOGUE"
          | "NARRATION",
        content: entry.text,
        speakerId: null, // TODO: Lookup character by speaker tag to get UUID
        demoNotes: entry.speaker || null, // Store raw speaker tag for reconstruction
        isDirty: true, // Mark as modified since last sync
        projectFileId: label.projectFileId,
        linePosition: (label.labelPosition ?? 0) + index,
        contentHash: calculateContentHash(entry.text),
        lastSyncedHash: null, // No synced hash for newly created/modified lines
      }));

      if (allValues.length > 0) {
        await tx.insert(labelLines).values(allValues);
      }

      // Update label with audit fields and sync status
      const currentVersion = label.version ?? 1;
      const auditFields = updateAuditFields(currentVersion, user.id);
      await tx
        .update(labels)
        .set({
          ...auditFields,
          contentHash,
          syncStatus: "MODIFIED_LOCAL",
        })
        .where(eq(labels.id, labelId));
    });

    // Reconstruct file content with updated dialogue
    const allLabels = await db
      .select({
        id: labels.id,
        labelName: labels.labelName,
        title: labels.title,
      })
      .from(labels)
      .where(
        and(eq(labels.projectFileId, projectFile.id), isNull(labels.deletedAt))
      )
      .orderBy(asc(labels.labelPosition));

    // Build dialogue map for reconstruction
    const updatedDialogue = new Map<
      string,
      Array<{ speaker: string | null; text: string }>
    >();

    // Batch fetch all label lines for all labels (avoiding N+1 query)
    const allLabelLines = await db
      .select({
        labelId: labelLines.labelId,
        demoNotes: labelLines.demoNotes,
        content: labelLines.content,
        sequence: labelLines.sequence,
      })
      .from(labelLines)
      .where(
        and(
          inArray(
            labelLines.labelId,
            allLabels.map((l) => l.id)
          ),
          isNull(labelLines.deletedAt)
        )
      )
      .orderBy(asc(labelLines.sequence));

    // Group lines by labelId in-memory
    const linesByLabelId = new Map<
      string,
      Array<{ demoNotes: string | null; content: string }>
    >();
    for (const line of allLabelLines) {
      if (!linesByLabelId.has(line.labelId)) {
        linesByLabelId.set(line.labelId, []);
      }
      linesByLabelId.get(line.labelId)!.push({
        demoNotes: line.demoNotes,
        content: line.content,
      });
    }

    // Build dialogue map from grouped lines
    for (const l of allLabels) {
      const labelName = l.labelName || l.title;
      const labelLinesData = linesByLabelId.get(l.id) || [];

      const labelDialogue = labelLinesData.map((l) => ({
        speaker: l.demoNotes || null,
        text: l.content,
      }));
      updatedDialogue.set(labelName, labelDialogue);
    }

    // Reconstruct file
    const newContent = reconstructRPYFile({
      originalContent: projectFile.content,
      updatedDialogue,
    });

    // Update file content
    await db
      .update(projectFiles)
      .set({
        content: newContent,
        updatedAt: new Date(),
      })
      .where(eq(projectFiles.id, projectFile.id));

    // Track word counts for daily writing goals
    // This is non-critical: if tracking fails, the dialogue save is still successful
    try {
      // Get user settings
      const [settings] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, user.id))
        .limit(1);

      // Only track if user has daily writing goal enabled
      if (settings && settings.dailyWritingGoal !== null) {
        const resetHour = settings.dailyWordResetHour ?? 0;
        const timezone = settings.timezone ?? "UTC";
        const todayDateKey = getTodayDateKey(resetHour, timezone);

        // Count words from saved dialogue
        const wordCount = countWordsFromDialogue(dialogue);

        // Calculate net new words using per-label tracking
        // This prevents double-counting when editing and re-saving the same content
        // Validate and sanitize the JSON data before use
        const labelWordCounts = parseLabelWordCounts(
          settings.labelWordCounts
        );


        const { wordsToAdd, updatedTracking } = calculateNetNewWords(
          labelWordCounts,
          labelId,
          todayDateKey,
          wordCount
        );

        // Only update if there are actually new words to count
        if (wordsToAdd > 0) {
          const dailyWordCounts = parseDailyWordCounts(settings.dailyWordCounts);
          const updatedWordCounts = updateTodayWordCount(
            dailyWordCounts,
            todayDateKey,
            wordsToAdd
          );

          // Save both daily word counts and per-label tracking
          await db
            .update(userSettings)
            .set({
              dailyWordCounts: updatedWordCounts,
              labelWordCounts: updatedTracking,
              updatedAt: new Date(),
            })
            .where(eq(userSettings.userId, user.id));
        } else {
          // Still update the per-label tracking even if no new words (to record current state)
          await db
            .update(userSettings)
            .set({
              labelWordCounts: updatedTracking,
              updatedAt: new Date(),
            })
            .where(eq(userSettings.userId, user.id));
        }
      }
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

    reply.send({ success: true } as UpdateLabelDialogueResponse);
  } catch (error) {
    request.log.error(error);
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
}
