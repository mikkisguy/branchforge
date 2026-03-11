/**
 * Characters Routes
 *
 * Routes for character management operations including detecting characters from RPY files,
 * importing characters after review, and CRUD operations.
 */

import type { FastifyInstance } from "fastify";
import type { FastifyRequest, FastifyReply } from "fastify";
import { getDb } from "../db/index.js";
import {
  characters,
  projectSettings,
  labels,
  gitlabFiles,
  projects,
} from "../db/schema/index.js";
import { eq, and } from "drizzle-orm";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  validateParams,
  validateBody,
} from "../middleware/validation.middleware.js";
import {
  characterIdParamsSchema,
  projectIdParamsSchema,
  createCharacterSchema,
  updateCharacterSchema,
  importCharactersSchema,
  projectSettingsSchema,
  type CreateCharacterInput,
  type UpdateCharacterInput,
  type ImportCharactersInput,
  type ProjectSettingsInput,
} from "../lib/validation.js";
import {
  characterParserService,
  type DetectedCharacter,
} from "../services/character-parser.service.js";
import { characterLinkerService } from "../services/character-linker.service.js";

// ============================================================================
// Types
// ============================================================================

interface DetectCharactersParams {
  projectId: string;
}

interface DetectCharactersResponse {
  characters: DetectedCharacter[];
  excludedTags: string[];
}

interface ImportCharactersResponse {
  characters: Array<{
    id: string;
    tag: string;
    name: string;
    displayName: string;
  }>;
  linked: number;
  unmatched: string[];
}

interface ListCharactersResponse {
  characters: Array<{
    id: string;
    name: string;
    displayName: string;
    renpyTag: string;
    color: string;
    routeAffiliation: string | null;
    isLoveInterest: boolean;
  }>;
}

interface GetCharacterResponse {
  character: {
    id: string;
    name: string;
    displayName: string;
    renpyTag: string;
    color: string;
    routeAffiliation: string | null;
    isLoveInterest: boolean;
    dialogueStyle: string | null;
    conditionalPrefix: string | null;
  };
}

interface ProjectSettingsResponse {
  excludedCharacterTags: string[];
  autoLinkSpeakers: boolean;
}

interface ErrorResponse {
  error: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get or create project settings
 */
async function getProjectSettings(projectId: string) {
  const db = getDb();

  let [settings] = await db
    .select()
    .from(projectSettings)
    .where(eq(projectSettings.projectId, projectId))
    .limit(1);

  if (!settings) {
    [settings] = await db
      .insert(projectSettings)
      .values({
        projectId,
        excludedCharacterTags: ["n", "u", "narrator", "extend"],
        autoLinkSpeakers: true,
        updatedAt: new Date(),
      })
      .returning();
  }

  return settings;
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * Detect characters from GitLab RPY files
 *
 * GET /projects/:projectId/characters/detect
 * Requires authentication
 */
async function detectCharactersHandler(
  request: FastifyRequest<{ Params: DetectCharactersParams }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const user = request.user!;

  try {
    const db = getDb();

    // Get project settings for excluded tags
    const settings = await getProjectSettings(projectId);
    const excludedTags = new Set(settings.excludedCharacterTags);

    // Get existing characters for conflict detection
    const existingCharacters = await db
      .select()
      .from(characters)
      .where(eq(characters.projectId, projectId));

    // Get GitLab integration info
    const [project] = await db
      .select({
        userId: projects.userId,
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project || project.userId !== user.id) {
      reply.status(403).send({ error: "Forbidden" } as ErrorResponse);
      return;
    }

    // Get all GitLab files for this project
    const projectFiles = await db
      .select()
      .from(gitlabFiles)
      .where(eq(gitlabFiles.projectId, projectId));

    // Parse characters from all files
    const allDetected: DetectedCharacter[] = [];
    for (const file of projectFiles) {
      if (file.content) {
        request.log.info(
          { filePath: file.filePath, contentLength: file.content.length },
          "Parsing characters from file"
        );
        const fileCharacters = characterParserService.parseWithExclusions(
          file.content,
          file.filePath,
          excludedTags
        );
        request.log.info(
          { filePath: file.filePath, characterCount: fileCharacters.length },
          `Found ${fileCharacters.length} characters`
        );
        allDetected.push(...fileCharacters);
      }
    }

    request.log.info(
      { totalCharacters: allDetected.length },
      `Total characters detected before deduplication`
    );

    // Deduplicate by tag
    const seenTags = new Set<string>();
    const uniqueCharacters: DetectedCharacter[] = [];
    for (const char of allDetected) {
      if (!seenTags.has(char.tag)) {
        seenTags.add(char.tag);
        uniqueCharacters.push(char);
      }
    }

    // Detect conflicts
    const conflicts = characterParserService.detectConflicts(
      uniqueCharacters,
      existingCharacters.map((c) => ({
        renpyTag: c.renpyTag,
        name: c.name,
        displayName: c.displayName,
        color: c.color,
      }))
    );

    reply.status(200).send({
      characters: uniqueCharacters,
      excludedTags: Array.from(excludedTags),
      conflicts,
    } as DetectCharactersResponse & { conflicts: typeof conflicts });
  } catch (error) {
    request.log.error(error);
    reply.status(500).send({ error: "Internal server error" } as ErrorResponse);
  }
}

/**
 * Import characters after review
 *
 * POST /projects/:projectId/characters/import
 * Body: ImportCharactersInput
 * Requires authentication
 */
async function importCharactersHandler(
  request: FastifyRequest<{
    Params: DetectCharactersParams;
    Body: ImportCharactersInput;
  }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const {
    characters: charactersToImport,
    excludedTags,
    linkToLines,
  } = request.body;
  const user = request.user!;

  try {
    const db = getDb();

    // Verify project access
    const [project] = await db
      .select({ userId: projects.userId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project || project.userId !== user.id) {
      reply.status(403).send({ error: "Forbidden" } as ErrorResponse);
      return;
    }

    // Update project settings
    await db
      .insert(projectSettings)
      .values({
        projectId,
        excludedCharacterTags: excludedTags,
        autoLinkSpeakers: linkToLines,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [projectSettings.projectId],
        set: {
          excludedCharacterTags: excludedTags,
          autoLinkSpeakers: linkToLines,
          updatedAt: new Date(),
        },
      });

    // Get existing characters
    const existingCharacters = await db
      .select()
      .from(characters)
      .where(eq(characters.projectId, projectId));

    const existingByTag = new Map(
      existingCharacters.map((c) => [c.renpyTag, c])
    );

    // Create or update characters
    const createdCharacters: Array<{
      id: string;
      tag: string;
      name: string;
      displayName: string;
    }> = [];

    for (const charData of charactersToImport) {
      const existing = existingByTag.get(charData.tag);

      if (existing) {
        // Update existing character
        await db
          .update(characters)
          .set({
            name: charData.name ?? charData.tag,
            displayName: charData.displayName,
            color: charData.color,
            routeAffiliation: charData.routeAffiliation,
            isLoveInterest: charData.isLoveInterest ?? false,
            updatedAt: new Date(),
          })
          .where(eq(characters.id, existing.id));

        createdCharacters.push({
          id: existing.id,
          tag: existing.renpyTag,
          name: existing.name,
          displayName: existing.displayName,
        });
      } else {
        // Create new character
        const [newChar] = await db
          .insert(characters)
          .values({
            projectId,
            name: charData.name ?? charData.tag,
            displayName: charData.displayName,
            renpyTag: charData.tag,
            color: charData.color,
            routeAffiliation: charData.routeAffiliation,
            isLoveInterest: charData.isLoveInterest ?? false,
          })
          .returning();

        createdCharacters.push({
          id: newChar.id,
          tag: newChar.renpyTag,
          name: newChar.name,
          displayName: newChar.displayName,
        });
      }
    }

    // Link speakers to lines if requested
    let linked = 0;
    let unmatched: string[] = [];

    if (linkToLines) {
      // Get all label IDs for this project
      const projectLabels = await db
        .select({ id: labels.id })
        .from(labels)
        .where(eq(labels.projectId, projectId));

      const labelIds = projectLabels.map((l) => l.id);

      if (labelIds.length > 0) {
        const result = await characterLinkerService.linkSpeakersToLines(
          projectId,
          labelIds,
          new Set(excludedTags)
        );
        linked = result.linked;
        unmatched = result.unmatched;
      }
    }

    reply.status(201).send({
      characters: createdCharacters,
      linked,
      unmatched,
    } as ImportCharactersResponse);
  } catch (error) {
    request.log.error(error);
    reply.status(500).send({ error: "Internal server error" } as ErrorResponse);
  }
}

/**
 * List all characters for a project
 *
 * GET /projects/:projectId/characters
 * Requires authentication
 */
async function listCharactersHandler(
  request: FastifyRequest<{ Params: DetectCharactersParams }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const user = request.user!;

  try {
    const db = getDb();

    // Verify project access
    const [project] = await db
      .select({ userId: projects.userId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project || project.userId !== user.id) {
      reply.status(403).send({ error: "Forbidden" } as ErrorResponse);
      return;
    }

    const projectCharacters = await db
      .select({
        id: characters.id,
        name: characters.name,
        displayName: characters.displayName,
        renpyTag: characters.renpyTag,
        color: characters.color,
        routeAffiliation: characters.routeAffiliation,
        isLoveInterest: characters.isLoveInterest,
      })
      .from(characters)
      .where(eq(characters.projectId, projectId))
      .orderBy(characters.renpyTag);

    reply
      .status(200)
      .send({ characters: projectCharacters } as ListCharactersResponse);
  } catch (error) {
    request.log.error(error);
    reply.status(500).send({ error: "Internal server error" } as ErrorResponse);
  }
}

/**
 * Get a single character by ID
 *
 * GET /characters/:characterId
 * Requires authentication
 */
async function getCharacterHandler(
  request: FastifyRequest<{ Params: { characterId: string } }>,
  reply: FastifyReply
): Promise<void> {
  const { characterId } = request.params;
  const user = request.user!;

  try {
    const db = getDb();

    const [character] = await db
      .select()
      .from(characters)
      .where(eq(characters.id, characterId))
      .limit(1);

    if (!character) {
      reply.status(404).send({ error: "Character not found" } as ErrorResponse);
      return;
    }

    // Verify project access
    const [project] = await db
      .select({ userId: projects.userId })
      .from(projects)
      .where(eq(projects.id, character.projectId))
      .limit(1);

    if (!project || project.userId !== user.id) {
      reply.status(403).send({ error: "Forbidden" } as ErrorResponse);
      return;
    }

    reply.status(200).send({
      character: {
        id: character.id,
        name: character.name,
        displayName: character.displayName,
        renpyTag: character.renpyTag,
        color: character.color,
        routeAffiliation: character.routeAffiliation,
        isLoveInterest: character.isLoveInterest,
        dialogueStyle: character.dialogueStyle,
        conditionalPrefix: character.conditionalPrefix,
      },
    } as GetCharacterResponse);
  } catch (error) {
    request.log.error(error);
    reply.status(500).send({ error: "Internal server error" } as ErrorResponse);
  }
}

/**
 * Create a new character
 *
 * POST /projects/:projectId/characters
 * Body: CreateCharacterInput
 * Requires authentication
 */
async function createCharacterHandler(
  request: FastifyRequest<{
    Params: DetectCharactersParams;
    Body: CreateCharacterInput;
  }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const user = request.user!;

  try {
    const db = getDb();

    // Verify project access
    const [project] = await db
      .select({ userId: projects.userId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project || project.userId !== user.id) {
      reply.status(403).send({ error: "Forbidden" } as ErrorResponse);
      return;
    }

    // Check if character with this tag already exists
    const [existing] = await db
      .select()
      .from(characters)
      .where(
        and(
          eq(characters.projectId, projectId),
          eq(characters.renpyTag, request.body.renpyTag)
        )
      )
      .limit(1);

    if (existing) {
      reply.status(409).send({
        error: "Character with this tag already exists",
      } as ErrorResponse);
      return;
    }

    const [newCharacter] = await db
      .insert(characters)
      .values({
        projectId,
        name: request.body.name,
        displayName: request.body.displayName,
        renpyTag: request.body.renpyTag,
        color: request.body.color,
        routeAffiliation: request.body.routeAffiliation,
        isLoveInterest: request.body.isLoveInterest,
        dialogueStyle: request.body.dialogueStyle,
        conditionalPrefix: request.body.conditionalPrefix,
      })
      .returning();

    reply.status(201).send({
      character: {
        id: newCharacter.id,
        name: newCharacter.name,
        displayName: newCharacter.displayName,
        renpyTag: newCharacter.renpyTag,
        color: newCharacter.color,
        routeAffiliation: newCharacter.routeAffiliation,
        isLoveInterest: newCharacter.isLoveInterest,
        dialogueStyle: newCharacter.dialogueStyle,
        conditionalPrefix: newCharacter.conditionalPrefix,
      },
    } as GetCharacterResponse);
  } catch (error) {
    request.log.error(error);
    reply.status(500).send({ error: "Internal server error" } as ErrorResponse);
  }
}

/**
 * Update a character
 *
 * PUT /characters/:characterId
 * Body: UpdateCharacterInput
 * Requires authentication
 */
async function updateCharacterHandler(
  request: FastifyRequest<{
    Params: { characterId: string };
    Body: UpdateCharacterInput;
  }>,
  reply: FastifyReply
): Promise<void> {
  const { characterId } = request.params;
  const user = request.user!;

  try {
    const db = getDb();

    const [character] = await db
      .select()
      .from(characters)
      .where(eq(characters.id, characterId))
      .limit(1);

    if (!character) {
      reply.status(404).send({ error: "Character not found" } as ErrorResponse);
      return;
    }

    // Verify project access
    const [project] = await db
      .select({ userId: projects.userId })
      .from(projects)
      .where(eq(projects.id, character.projectId))
      .limit(1);

    if (!project || project.userId !== user.id) {
      reply.status(403).send({ error: "Forbidden" } as ErrorResponse);
      return;
    }

    const [updatedCharacter] = await db
      .update(characters)
      .set({
        ...request.body,
        updatedAt: new Date(),
      })
      .where(eq(characters.id, characterId))
      .returning();

    reply.status(200).send({
      character: {
        id: updatedCharacter.id,
        name: updatedCharacter.name,
        displayName: updatedCharacter.displayName,
        renpyTag: updatedCharacter.renpyTag,
        color: updatedCharacter.color,
        routeAffiliation: updatedCharacter.routeAffiliation,
        isLoveInterest: updatedCharacter.isLoveInterest,
        dialogueStyle: updatedCharacter.dialogueStyle,
        conditionalPrefix: updatedCharacter.conditionalPrefix,
      },
    } as GetCharacterResponse);
  } catch (error) {
    request.log.error(error);
    reply.status(500).send({ error: "Internal server error" } as ErrorResponse);
  }
}

/**
 * Delete a character
 *
 * DELETE /characters/:characterId
 * Requires authentication
 */
async function deleteCharacterHandler(
  request: FastifyRequest<{ Params: { characterId: string } }>,
  reply: FastifyReply
): Promise<void> {
  const { characterId } = request.params;
  const user = request.user!;

  try {
    const db = getDb();

    const [character] = await db
      .select()
      .from(characters)
      .where(eq(characters.id, characterId))
      .limit(1);

    if (!character) {
      reply.status(404).send({ error: "Character not found" } as ErrorResponse);
      return;
    }

    // Verify project access
    const [project] = await db
      .select({ userId: projects.userId })
      .from(projects)
      .where(eq(projects.id, character.projectId))
      .limit(1);

    if (!project || project.userId !== user.id) {
      reply.status(403).send({ error: "Forbidden" } as ErrorResponse);
      return;
    }

    await db.delete(characters).where(eq(characters.id, characterId));

    reply.status(204).send();
  } catch (error) {
    request.log.error(error);
    reply.status(500).send({ error: "Internal server error" } as ErrorResponse);
  }
}

/**
 * Get project settings
 *
 * GET /projects/:projectId/character-settings
 * Requires authentication
 */
async function getProjectSettingsHandler(
  request: FastifyRequest<{ Params: DetectCharactersParams }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const user = request.user!;

  try {
    const db = getDb();

    // Verify project access
    const [project] = await db
      .select({ userId: projects.userId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project || project.userId !== user.id) {
      reply.status(403).send({ error: "Forbidden" } as ErrorResponse);
      return;
    }

    const settings = await getProjectSettings(projectId);

    reply.status(200).send({
      excludedCharacterTags: settings.excludedCharacterTags,
      autoLinkSpeakers: settings.autoLinkSpeakers,
    } as ProjectSettingsResponse);
  } catch (error) {
    request.log.error(error);
    reply.status(500).send({ error: "Internal server error" } as ErrorResponse);
  }
}

/**
 * Update project settings
 *
 * PUT /projects/:projectId/character-settings
 * Body: ProjectSettingsInput
 * Requires authentication
 */
async function updateProjectSettingsHandler(
  request: FastifyRequest<{
    Params: DetectCharactersParams;
    Body: ProjectSettingsInput;
  }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const user = request.user!;
  const updates = request.body;

  try {
    const db = getDb();

    // Verify project access
    const [project] = await db
      .select({ userId: projects.userId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project || project.userId !== user.id) {
      reply.status(403).send({ error: "Forbidden" } as ErrorResponse);
      return;
    }

    const [updatedSettings] = await db
      .insert(projectSettings)
      .values({
        projectId,
        excludedCharacterTags: updates.excludedCharacterTags ?? [
          "n",
          "u",
          "narrator",
          "extend",
        ],
        autoLinkSpeakers: updates.autoLinkSpeakers ?? true,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [projectSettings.projectId],
        set: {
          ...(updates.excludedCharacterTags && {
            excludedCharacterTags: updates.excludedCharacterTags,
          }),
          ...(updates.autoLinkSpeakers !== undefined && {
            autoLinkSpeakers: updates.autoLinkSpeakers,
          }),
          updatedAt: new Date(),
        },
      })
      .returning();

    reply.status(200).send({
      excludedCharacterTags: updatedSettings.excludedCharacterTags,
      autoLinkSpeakers: updatedSettings.autoLinkSpeakers,
    } as ProjectSettingsResponse);
  } catch (error) {
    request.log.error(error);
    reply.status(500).send({ error: "Internal server error" } as ErrorResponse);
  }
}

// ============================================================================
// Routes Registration
// ============================================================================

export async function charactersRoutes(
  fastify: FastifyInstance
): Promise<void> {
  // All routes require authentication

  // Detect characters from GitLab files
  fastify.get<{ Params: DetectCharactersParams }>(
    "/projects/:projectId/characters/detect",
    {
      onRequest: authenticate,
      preValidation: validateParams(projectIdParamsSchema),
    },
    detectCharactersHandler
  );

  // Import characters after review
  fastify.post<{ Params: DetectCharactersParams; Body: ImportCharactersInput }>(
    "/projects/:projectId/characters/import",
    {
      onRequest: authenticate,
      preValidation: [
        validateParams(projectIdParamsSchema),
        validateBody(importCharactersSchema),
      ],
    },
    importCharactersHandler
  );

  // List characters for project
  fastify.get<{ Params: DetectCharactersParams }>(
    "/projects/:projectId/characters",
    {
      onRequest: authenticate,
      preValidation: validateParams(projectIdParamsSchema),
    },
    listCharactersHandler
  );

  // Get project settings
  fastify.get<{ Params: DetectCharactersParams }>(
    "/projects/:projectId/character-settings",
    {
      onRequest: authenticate,
      preValidation: validateParams(projectIdParamsSchema),
    },
    getProjectSettingsHandler
  );

  // Update project settings
  fastify.put<{ Params: DetectCharactersParams; Body: ProjectSettingsInput }>(
    "/projects/:projectId/character-settings",
    {
      onRequest: authenticate,
      preValidation: [
        validateParams(projectIdParamsSchema),
        validateBody(projectSettingsSchema),
      ],
    },
    updateProjectSettingsHandler
  );

  // Get single character
  fastify.get<{ Params: { characterId: string } }>(
    "/characters/:characterId",
    {
      onRequest: authenticate,
      preValidation: validateParams(characterIdParamsSchema),
    },
    getCharacterHandler
  );

  // Create character
  fastify.post<{ Params: DetectCharactersParams; Body: CreateCharacterInput }>(
    "/projects/:projectId/characters",
    {
      onRequest: authenticate,
      preValidation: [
        validateParams(projectIdParamsSchema),
        validateBody(createCharacterSchema),
      ],
    },
    createCharacterHandler
  );

  // Update character
  fastify.put<{ Params: { characterId: string }; Body: UpdateCharacterInput }>(
    "/characters/:characterId",
    {
      onRequest: authenticate,
      preValidation: [
        validateParams(characterIdParamsSchema),
        validateBody(updateCharacterSchema),
      ],
    },
    updateCharacterHandler
  );

  // Delete character
  fastify.delete<{ Params: { characterId: string } }>(
    "/characters/:characterId",
    {
      onRequest: authenticate,
      preValidation: validateParams(characterIdParamsSchema),
    },
    deleteCharacterHandler
  );
}
