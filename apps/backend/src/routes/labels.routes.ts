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
  listLabelsQuerySchema,
  labelIdParamsSchema,
  updateLabelDialogueBodySchema,
  type ListLabelsQuery,
  type UpdateLabelDialogueInput,
} from "../lib/validation.js";
import { getDb } from "../db/index.js";
import {
  projects,
  labels,
  labelLines,
  gitlabFiles,
} from "../db/schema/index.js";
import { eq, asc, inArray } from "drizzle-orm";
import { reconstructRPYFile } from "../services/rpy-parser.service.js";

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
  reply: FastifyReply,
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
  reply: FastifyReply,
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
  reply: FastifyReply,
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
 */
async function updateLabelDialogueHandler(
  request: FastifyRequest<{
    Params: GetLabelParams;
    Body: UpdateLabelDialogueInput;
  }>,
  reply: FastifyReply,
): Promise<void> {
  const { labelId } = request.params;
  const { dialogue } = request.body;
  const user = request.user!;

  try {
    const db = getDb();

    // Get label with file info
    const [label] = await db
      .select({
        id: labels.id,
        projectId: labels.projectId,
        gitlabFileId: labels.gitlabFileId,
      })
      .from(labels)
      .where(eq(labels.id, labelId))
      .limit(1);

    if (!label || !label.gitlabFileId) {
      reply
        .status(404)
        .send({ error: "Label or file not found" } as ErrorResponse);
      return;
    }

    // Get the gitlab file
    const [gitlabFile] = await db
      .select()
      .from(gitlabFiles)
      .where(eq(gitlabFiles.id, label.gitlabFileId))
      .limit(1);

    if (!gitlabFile) {
      reply.status(404).send({ error: "File not found" } as ErrorResponse);
      return;
    }

    // Verify user owns the project
    if (!(await authorizeProjectAccess(label.projectId, user.id, reply))) {
      return;
    }

    // Update label_lines with new dialogue
    await db.transaction(async (tx) => {
      await tx.delete(labelLines).where(eq(labelLines.labelId, labelId));

      const allValues = dialogue.map((entry, index) => ({
        labelId,
        sequence: index + 1,
        contentType: (entry.speaker ? "DIALOGUE" : "NARRATION") as
          | "DIALOGUE"
          | "NARRATION",
        content: entry.text,
        speakerId: null, // TODO: Lookup character by speaker tag to get UUID
        demoNotes: entry.speaker || null, // Store raw speaker tag for reconstruction
      }));

      if (allValues.length > 0) {
        await tx.insert(labelLines).values(allValues);
      }
    });

    // Reconstruct file content with updated dialogue
    const allLabels = await db
      .select({
        id: labels.id,
        labelName: labels.labelName,
        title: labels.title,
      })
      .from(labels)
      .where(eq(labels.gitlabFileId, gitlabFile.id))
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
      .where(inArray(labelLines.labelId, allLabels.map((l) => l.id)))
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
      originalContent: gitlabFile.content,
      updatedDialogue,
    });

    // Update file content
    await db
      .update(gitlabFiles)
      .set({
        content: newContent,
        updatedAt: new Date(),
      })
      .where(eq(gitlabFiles.id, gitlabFile.id));

    reply.send({ success: true } as UpdateLabelDialogueResponse);
  } catch (error) {
    request.log.error(error);
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
    listLabelsHandler,
  );
  fastify.get<{ Params: GetLabelParams }>(
    "/labels/:labelId",
    {
      onRequest: authenticate,
      preValidation: validateParams(labelIdParamsSchema),
    },
    getLabelHandler,
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
    updateLabelDialogueHandler,
  );
}
