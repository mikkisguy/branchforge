/**
 * Scenes Routes
 *
 * Routes for scene management operations including listing scenes for a project
 * and getting detailed scene information with lines and characters.
 */

import type { FastifyInstance } from "fastify";
import type { FastifyRequest, FastifyReply } from "fastify";
import {
  listScenes,
  getScene,
  type PublicScene,
  type SceneDetail,
  type ListScenesFilters,
} from "../services/scenes.service.js";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  validateQuery,
  validateParams,
  validateBody,
} from "../middleware/validation.middleware.js";
import {
  listScenesQuerySchema,
  sceneIdParamsSchema,
  updateSceneDialogueBodySchema,
  type ListScenesQuery,
  type UpdateSceneDialogueInput,
} from "../lib/validation.js";
import { getDb } from "../db/index.js";
import {
  projects,
  scenes,
  sceneLines,
  gitlabFiles,
} from "../db/schema/index.js";
import { eq, asc } from "drizzle-orm";
import { reconstructRPYFile } from "../services/rpy-parser.service.js";

// ============================================================================
// Types
// ============================================================================

interface ListScenesResponse {
  scenes: PublicScene[];
}

interface GetSceneParams {
  sceneId: string;
}

interface GetSceneResponse {
  scene: SceneDetail;
}

interface ErrorResponse {
  error: string;
}

// UpdateSceneDialogueBody is now imported from validation.ts as UpdateSceneDialogueInput

interface UpdateSceneDialogueResponse {
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
 * List all scenes for a project
 *
 * GET /scenes?projectId=xxx&route=xxx&status=xxx
 * Requires authentication
 */
async function listScenesHandler(
  request: FastifyRequest<{ Querystring: ListScenesQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const user = request.user!;
  const { projectId, routeKey, status } = request.query;

  // Build filters
  const filters: ListScenesFilters = {};
  if (routeKey) {
    filters.routeKey = routeKey;
  }
  if (status) {
    filters.status = status;
  }

  try {
    const scenes = await listScenes(projectId, user.id, filters);
    reply.status(200).send({ scenes } as ListScenesResponse);
  } catch (error) {
    request.log.error(error);
    reply.status(500).send({ error: "Internal server error" } as ErrorResponse);
  }
}

/**
 * Get a single scene by ID with full details
 *
 * GET /scenes/:sceneId
 * Requires authentication
 */
async function getSceneHandler(
  request: FastifyRequest<{ Params: GetSceneParams }>,
  reply: FastifyReply,
): Promise<void> {
  const { sceneId } = request.params;
  const user = request.user!;

  try {
    const scene = await getScene(sceneId, user.id);

    if (!scene) {
      reply.status(404).send({ error: "Scene not found" } as ErrorResponse);
      return;
    }

    reply.status(200).send({ scene } as GetSceneResponse);
  } catch (error) {
    request.log.error(error);
    reply.status(500).send({ error: "Internal server error" } as ErrorResponse);
  }
}

/**
 * Update scene dialogue
 *
 * PUT /scenes/:sceneId/dialogue
 * Body: { dialogue: Array<{ speaker: string | null; text: string }> }
 *
 * Updates dialogue for a scene (Write Mode) and reconstructs the file.
 * This is used when Write Mode saves dialogue changes.
 */
async function updateSceneDialogueHandler(
  request: FastifyRequest<{
    Params: GetSceneParams;
    Body: UpdateSceneDialogueInput;
  }>,
  reply: FastifyReply,
): Promise<void> {
  const { sceneId } = request.params;
  const { dialogue } = request.body;
  const user = request.user!;

  try {
    const db = getDb();

    // Get scene with file info
    const [scene] = await db
      .select({
        id: scenes.id,
        projectId: scenes.projectId,
        gitlabFileId: scenes.gitlabFileId,
      })
      .from(scenes)
      .where(eq(scenes.id, sceneId))
      .limit(1);

    if (!scene || !scene.gitlabFileId) {
      reply
        .status(404)
        .send({ error: "Scene or file not found" } as ErrorResponse);
      return;
    }

    // Get the gitlab file
    const [gitlabFile] = await db
      .select()
      .from(gitlabFiles)
      .where(eq(gitlabFiles.id, scene.gitlabFileId))
      .limit(1);

    if (!gitlabFile) {
      reply.status(404).send({ error: "File not found" } as ErrorResponse);
      return;
    }

    // Verify user owns the project
    if (!(await authorizeProjectAccess(scene.projectId, user.id, reply))) {
      return;
    }

    // Update scene_lines with new dialogue
    await db.transaction(async (tx) => {
      await tx.delete(sceneLines).where(eq(sceneLines.sceneId, sceneId));

      const allValues = dialogue.map((entry, index) => ({
        sceneId,
        sequence: index + 1,
        contentType: (entry.speaker ? "DIALOGUE" : "NARRATION") as
          | "DIALOGUE"
          | "NARRATION",
        content: entry.text,
        speakerId: null, // TODO: Lookup character by speaker tag to get UUID
        demoNotes: entry.speaker || null, // Store raw speaker tag for reconstruction
      }));

      if (allValues.length > 0) {
        await tx.insert(sceneLines).values(allValues);
      }
    });

    // Reconstruct file content with updated dialogue
    const allScenes = await db
      .select({
        id: scenes.id,
        labelName: scenes.labelName,
        title: scenes.title,
      })
      .from(scenes)
      .where(eq(scenes.gitlabFileId, gitlabFile.id))
      .orderBy(asc(scenes.labelPosition));

    // Build dialogue map for reconstruction
    const updatedDialogue = new Map<
      string,
      Array<{ speaker: string | null; text: string }>
    >();
    for (const s of allScenes) {
      const labelName = s.labelName || s.title;
      // Get lines for this scene
      const sceneLinesData = await db
        .select({
          demoNotes: sceneLines.demoNotes,
          content: sceneLines.content,
        })
        .from(sceneLines)
        .where(eq(sceneLines.sceneId, s.id))
        .orderBy(asc(sceneLines.sequence));

      const sceneDialogue = sceneLinesData.map((l) => ({
        speaker: l.demoNotes || null, // demoNotes contains the raw speaker tag
        text: l.content,
      }));
      updatedDialogue.set(labelName, sceneDialogue);
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

    reply.send({ success: true } as UpdateSceneDialogueResponse);
  } catch (error) {
    request.log.error(error);
    reply.status(500).send({ error: "Internal server error" } as ErrorResponse);
  }
}

// ============================================================================
// Routes Registration
// ============================================================================

export async function scenesRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.get<{ Querystring: ListScenesQuery }>(
    "/scenes",
    {
      onRequest: authenticate,
      preValidation: validateQuery(listScenesQuerySchema),
    },
    listScenesHandler,
  );
  fastify.get<{ Params: GetSceneParams }>(
    "/scenes/:sceneId",
    {
      onRequest: authenticate,
      preValidation: validateParams(sceneIdParamsSchema),
    },
    getSceneHandler,
  );
  fastify.put<{ Params: GetSceneParams; Body: UpdateSceneDialogueInput }>(
    "/scenes/:sceneId/dialogue",
    {
      onRequest: authenticate,
      preValidation: [
        validateParams(sceneIdParamsSchema),
        validateBody(updateSceneDialogueBodySchema),
      ],
    },
    updateSceneDialogueHandler,
  );
}

