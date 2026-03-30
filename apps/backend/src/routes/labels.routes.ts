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
  undoLabelBodySchema,
  type ListLabelsQuery,
  type UpdateLabelDialogueInput,
  type CreateLabelInput,
  type UpdateLabelInput,
  type UndoLabelInput,
} from "../lib/validation.js";
import { getDb } from "../db/index.js";
import {
  projects,
  labels,
  labelLines,
  labelDialogueVersions,
  projectFiles,
  userSettings,
  characters,
} from "../db/schema/index.js";
import { eq, asc, inArray, isNull, and, sql, desc } from "drizzle-orm";
import { reconstructRPYFile } from "../services/rpy-parser.service.js";
import {
  getLabelVersions,
  restoreLabelVersion,
} from "../services/undo.service.js";
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

const LABEL_HISTORY_LIMIT = 10;

// ============================================================================
// Shared Helpers
// ============================================================================

/**
 * Create a snapshot of label dialogue data for undo/redo functionality.
 * Only creates a new snapshot if the contentHash differs from the latest snapshot.
 * Automatically prunes old versions beyond LABEL_HISTORY_LIMIT.
 *
 * NOTE: This function accepts either a database connection or a transaction.
 * We use `any` for the tx parameter because Drizzle ORM's NodePgDatabase and
 * NodePgTransaction types don't share a common interface type, despite both
 * supporting the same query operations (select, insert, delete, execute).
 * This is the first function in the codebase to accept a transaction as a
 * parameter (all other transactions are inline), so we have no existing
 * pattern to follow. Runtime type safety is maintained - incorrect usage
 * would fail immediately with clear errors.
 *
 * @param tx - Database transaction or connection
 * @param labelId - The label ID to snapshot
 * @param dialogueData - The dialogue array to snapshot
 * @param contentHash - The content hash of the dialogue
 * @param userId - The user ID creating the snapshot
 * @returns The new version number if a snapshot was created, null otherwise
 *
 * References: labelDialogueVersions table, LABEL_HISTORY_LIMIT constant
 */
async function createLabelSnapshot(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any, // NodePgDatabase or NodePgTransaction - both support the same operations
  labelId: string,
  dialogueData: Array<{ speakerId: string | null; text: string }>,
  contentHash: string,
  userId: string
): Promise<number | null> {
  // Fetch latest snapshot to compare contentHash
  const [latestSnapshot] = await tx
    .select({ contentHash: labelDialogueVersions.contentHash })
    .from(labelDialogueVersions)
    .where(eq(labelDialogueVersions.labelId, labelId))
    .orderBy(
      desc(labelDialogueVersions.createdAt),
      desc(labelDialogueVersions.versionNumber)
    )
    .limit(1);

  // Only create a new snapshot if content has changed
  if (!latestSnapshot || latestSnapshot.contentHash !== contentHash) {
    const [versionStats] = await tx
      .select({
        maxVersion: sql<number>`coalesce(max(${labelDialogueVersions.versionNumber}), 0)`,
      })
      .from(labelDialogueVersions)
      .where(eq(labelDialogueVersions.labelId, labelId));

    const newVersionNumber = Number(versionStats?.maxVersion ?? 0) + 1;

    await tx.insert(labelDialogueVersions).values({
      labelId,
      dialogueData,
      contentHash,
      versionNumber: newVersionNumber,
      createdBy: userId,
    });

    // Prune old versions beyond the history limit
    // Delete exactly the oldest N versions, not by versionNumber threshold
    // This handles gaps in versionNumber correctly
    if (newVersionNumber > LABEL_HISTORY_LIMIT) {
      const versionsToDelete = newVersionNumber - LABEL_HISTORY_LIMIT;
      await tx
        .delete(labelDialogueVersions)
        .where(
          and(
            eq(labelDialogueVersions.labelId, labelId),
            inArray(
              labelDialogueVersions.id,
              sql`(SELECT id FROM ${labelDialogueVersions} WHERE ${labelDialogueVersions.labelId} = ${labelId} ORDER BY ${labelDialogueVersions.versionNumber} ASC LIMIT ${versionsToDelete})`
            )
          )
        );
    }

    return newVersionNumber;
  }

  return null;
}

/**
 * Reconstruct file content for a project file by fetching all labels
 * and their associated dialogue lines, then rebuilding the RPY file.
 *
 * References: db (getDb), labels, labelLines, characters, projectFiles tables,
 * and reconstructRPYFile service.
 */
async function reconstructFileForLabel(projectFileId: string): Promise<string> {
  const db = getDb();

  // Get the project file
  const [projectFile] = await db
    .select()
    .from(projectFiles)
    .where(eq(projectFiles.id, projectFileId))
    .limit(1);

  if (!projectFile) {
    throw new NotFoundError("ProjectFile");
  }

  // Fetch all labels for the project file
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

  // If there are no labels, return the original content as-is
  if (allLabels.length === 0) {
    return reconstructRPYFile({
      originalContent: projectFile.content,
      updatedDialogue: new Map(),
    });
  }

  // Build dialogue map for reconstruction
  const updatedDialogue = new Map<
    string,
    Array<{ speaker: string | null; text: string }>
  >();

  // Batch fetch all label lines for all labels with speaker information
  // Join with characters to get displayName from speakerId
  const allLabelLines = await db
    .select({
      labelId: labelLines.labelId,
      speakerId: labelLines.speakerId,
      speakerDisplayName: characters.displayName,
      content: labelLines.content,
      sequence: labelLines.sequence,
    })
    .from(labelLines)
    .leftJoin(characters, eq(labelLines.speakerId, characters.id))
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
    Array<{ speaker: string | null; content: string }>
  >();
  for (const line of allLabelLines) {
    if (!linesByLabelId.has(line.labelId)) {
      linesByLabelId.set(line.labelId, []);
    }
    linesByLabelId.get(line.labelId)!.push({
      // Use displayName from characters table if speakerId exists, otherwise null
      speaker: line.speakerDisplayName ?? null,
      content: line.content,
    });
  }

  // Build dialogue map from grouped lines
  for (const l of allLabels) {
    const labelName = l.labelName || l.title;
    const labelLinesData = linesByLabelId.get(l.id) || [];

    const labelDialogue = labelLinesData.map((line) => ({
      speaker: line.speaker,
      text: line.content,
    }));
    updatedDialogue.set(labelName, labelDialogue);
  }

  // Reconstruct and return file content
  return reconstructRPYFile({
    originalContent: projectFile.content,
    updatedDialogue,
  });
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
      // Serialize concurrent updates for the same label to avoid duplicate rows
      // from overlapping delete + insert operations.
      await tx.execute(
        sql`SELECT id FROM labels WHERE id = ${labelId} FOR UPDATE`
      );

      // 1. Delete existing lines (hard delete, not soft)
      await tx
        .delete(labelLines)
        .where(
          and(eq(labelLines.labelId, labelId), isNull(labelLines.deletedAt))
        );

      const allValues = dialogue.map((entry, index) => ({
        labelId,
        sequence: index + 1,
        // DIALOGUE if there's a speakerId, NARRATION otherwise
        contentType: (entry.speakerId ? "DIALOGUE" : "NARRATION") as
          | "DIALOGUE"
          | "NARRATION",
        content: entry.text,
        speakerId: entry.speakerId, // Use speakerId directly from payload
        demoNotes: null, // demo_notes should not be used for speaker names
        isDirty: true, // Mark as modified since last sync
        projectFileId: label.projectFileId,
        linePosition: (label.labelPosition ?? 0) + index,
        contentHash: calculateContentHash(entry.text),
        lastSyncedHash: null, // No synced hash for newly created/modified lines
      }));

      if (allValues.length > 0) {
        await tx.insert(labelLines).values(allValues);
      }

      // 2. Update label with audit fields and sync status
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

      // 3. Snapshot the post-update state so current content is the newest version.
      await createLabelSnapshot(tx, labelId, dialogue, contentHash, user.id);
    });

    // Reconstruct file content with updated dialogue
    const newContent = await reconstructFileForLabel(projectFile.id);

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
        const labelWordCounts = parseLabelWordCounts(settings.labelWordCounts);

        const { wordsToAdd, updatedTracking } = calculateNetNewWords(
          labelWordCounts,
          labelId,
          todayDateKey,
          wordCount
        );

        // Only update if there are actually new words to count
        if (wordsToAdd > 0) {
          const dailyWordCounts = parseDailyWordCounts(
            settings.dailyWordCounts
          );
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
 * GET /labels/:labelId/versions
 * Get available versions for undo
 *
 * This is a pure read operation - no side effects.
 * Initial snapshots are created when dialogue is first saved (updateLabelDialogueHandler).
 */
async function getLabelVersionsHandler(
  request: FastifyRequest<{ Params: GetLabelParams }>,
  reply: FastifyReply
): Promise<void> {
  const { labelId } = request.params;
  const user = request.user!;
  const db = getDb();

  const [label] = await db
    .select({ projectId: labels.projectId })
    .from(labels)
    .where(and(eq(labels.id, labelId), isNull(labels.deletedAt)))
    .limit(1);

  if (!label) {
    reply.status(404).send({ error: "Label not found" });
    return;
  }

  if (!(await authorizeProjectAccess(label.projectId, user.id, reply))) {
    return;
  }

  const versions = await getLabelVersions(labelId);

  const currentLines = await db
    .select({
      content: labelLines.content,
      speakerId: labelLines.speakerId,
    })
    .from(labelLines)
    .where(and(eq(labelLines.labelId, labelId), isNull(labelLines.deletedAt)))
    .orderBy(asc(labelLines.sequence));

  const currentDialogue = currentLines.map((line) => ({
    speakerId: line.speakerId,
    text: line.content,
  }));

  const currentHash = calculateDialogueHash(currentDialogue);

  // -1 means current content is not represented in snapshots yet.
  const currentIndex = versions.findIndex(
    (version) => version.contentHash === currentHash
  );
  const canUndo =
    currentIndex === -1
      ? versions.length > 0
      : currentIndex < versions.length - 1;
  const canRedo = currentIndex > 0;

  reply.send({
    versions: versions.map(({ id, versionNumber, createdAt }) => ({
      id,
      versionNumber,
      createdAt,
    })),
    currentIndex,
    canUndo,
    canRedo,
  });
}

/**
 * POST /labels/:labelId/undo
 * Undo to previous version
 */
async function undoLabelHandler(
  request: FastifyRequest<{
    Params: GetLabelParams;
    Body: UndoLabelInput;
  }>,
  reply: FastifyReply
): Promise<void> {
  const { labelId } = request.params;
  const { versionId } = request.body || {};
  const user = request.user!;
  const db = getDb();

  // Get label info
  const [labelInfo] = await db
    .select({
      projectId: labels.projectId,
      projectFileId: labels.projectFileId,
      labelPosition: labels.labelPosition,
      version: labels.version,
    })
    .from(labels)
    .where(and(eq(labels.id, labelId), isNull(labels.deletedAt)))
    .limit(1);

  if (!labelInfo || !labelInfo.projectFileId) {
    reply.status(404).send({ error: "Label or file not found" });
    return;
  }

  if (!(await authorizeProjectAccess(labelInfo.projectId, user.id, reply))) {
    return;
  }

  // Snapshot current state for redo
  const currentLines = await db
    .select({
      content: labelLines.content,
      speakerId: labelLines.speakerId,
    })
    .from(labelLines)
    .where(and(eq(labelLines.labelId, labelId), isNull(labelLines.deletedAt)))
    .orderBy(asc(labelLines.sequence));

  const currentDialogue = currentLines.map((l) => ({
    speakerId: l.speakerId,
    text: l.content,
  }));

  // Get versions and resolve fallback target relative to current state.
  const versions = await getLabelVersions(labelId);
  if (versions.length === 0) {
    reply.status(404).send({ error: "No versions available" });
    return;
  }

  const currentHash = calculateDialogueHash(currentDialogue);
  const currentIndex = versions.findIndex(
    (version) => version.contentHash === currentHash
  );

  let targetVersionId = versionId;
  if (!targetVersionId) {
    const undoTargetIndex = currentIndex === -1 ? 0 : currentIndex + 1;
    targetVersionId = versions[undoTargetIndex]?.id;
  }

  // Reject explicit IDs that are not part of this label's history.
  if (
    targetVersionId &&
    !versions.some((version) => version.id === targetVersionId)
  ) {
    reply.status(404).send({ error: "Version not found for label" });
    return;
  }

  if (!targetVersionId) {
    reply.status(404).send({ error: "No previous version available" });
    return;
  }

  // Only snapshot when using implicit fallback target selection (legacy undo behavior).
  // For explicit version restores (used by frontend undo/redo), snapshotting here creates
  // new head versions and causes redo to loop/toggle indefinitely.
  if (!versionId) {
    const currentDialogueHash = calculateDialogueHash(currentDialogue);
    await createLabelSnapshot(
      db,
      labelId,
      currentDialogue,
      currentDialogueHash,
      user.id
    );
  }

  // Restore the version
  const dialogue = await restoreLabelVersion(targetVersionId);

  // Get the project file
  const [projectFile] = await db
    .select()
    .from(projectFiles)
    .where(eq(projectFiles.id, labelInfo.projectFileId))
    .limit(1);

  if (!projectFile) {
    reply.status(404).send({ error: "File not found" });
    return;
  }

  // Update label_lines with restored dialogue
  await db.transaction(async (tx) => {
    // Serialize concurrent updates for the same label to avoid duplicate rows
    // from overlapping delete + insert operations.
    await tx.execute(
      sql`SELECT id FROM labels WHERE id = ${labelId} FOR UPDATE`
    );

    await tx
      .delete(labelLines)
      .where(
        and(eq(labelLines.labelId, labelId), isNull(labelLines.deletedAt))
      );

    const allValues = dialogue.map((entry, index) => ({
      labelId,
      sequence: index + 1,
      contentType: (entry.speakerId ? "DIALOGUE" : "NARRATION") as
        | "DIALOGUE"
        | "NARRATION",
      content: entry.text,
      speakerId: entry.speakerId,
      demoNotes: null,
      isDirty: true,
      projectFileId: labelInfo.projectFileId,
      linePosition: (labelInfo.labelPosition ?? 0) + index,
      contentHash: calculateContentHash(entry.text),
      lastSyncedHash: null,
    }));

    if (allValues.length > 0) {
      await tx.insert(labelLines).values(allValues);
    }

    const newHash = calculateDialogueHash(dialogue);
    const auditFields = updateAuditFields(labelInfo.version ?? 1, user.id);
    await tx
      .update(labels)
      .set({
        ...auditFields,
        contentHash: newHash,
        syncStatus: "MODIFIED_LOCAL",
      })
      .where(eq(labels.id, labelId));
  });

  // Reconstruct file content with updated dialogue
  const newContent = await reconstructFileForLabel(projectFile.id);

  // Update file content
  await db
    .update(projectFiles)
    .set({
      content: newContent,
      updatedAt: new Date(),
    })
    .where(eq(projectFiles.id, projectFile.id));

  reply.send({ success: true, dialogue });
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
  fastify.get<{ Params: GetLabelParams }>(
    "/labels/:labelId/versions",
    {
      onRequest: authenticate,
      preValidation: validateParams(labelIdParamsSchema),
    },
    getLabelVersionsHandler
  );
  fastify.post<{ Params: GetLabelParams; Body: UndoLabelInput }>(
    "/labels/:labelId/undo",
    {
      onRequest: authenticate,
      preValidation: [
        validateParams(labelIdParamsSchema),
        validateBody(undoLabelBodySchema),
      ],
    },
    undoLabelHandler
  );
}
