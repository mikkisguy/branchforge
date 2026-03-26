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
  projectFiles,
  projects,
} from "../db/schema/index.js";
import { eq, and } from "drizzle-orm";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  validateParams,
  validateBody,
} from "../middleware/validation.middleware.js";
import {
  HttpError,
  ValidationError,
} from "../middleware/error-handler.middleware.js";
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
import {
  validateAndProcessAvatar,
  deleteAvatar,
} from "../services/image-processing.service.js";
import {
  ensureAvatarDir,
  getAvatarPath,
  getAvatarFullPath,
} from "../lib/storage.js";
import { getBasePath } from "../lib/config.js";
import { promises as fs } from "node:fs";
import type { MultipartFile } from "@fastify/multipart";
import { AVATAR_MAX_SIZE, AVATAR_MAX_SIZE_MB } from "@branchforge/shared";

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
    avatarUrl: string | null;
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
    avatarUrl: string | null;
  };
}

interface ProjectSettingsResponse {
  excludedCharacterTags: string[];
  autoLinkSpeakers: boolean;
}

interface UploadAvatarResponse {
  avatarUrl: string;
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

/**
 * Build avatar URL from stored filename
 * @param filename - The filename from database
 * @returns Full URL path for client access
 */
function buildAvatarUrl(filename: string | null): string | null {
  if (!filename) return null;
  return getAvatarPath(filename, getBasePath());
}

/**
 * Normalize multipart file-size errors from Fastify/Busboy variants.
 */
function isMultipartFileTooLargeError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = "code" in error ? String(error.code) : "";
  if (
    code === "LIMIT_FILE_SIZE" ||
    code === "FST_REQ_FILE_TOO_LARGE" ||
    code === "FST_FILES_LIMIT" ||
    code === "FST_PARTS_LIMIT"
  ) {
    return true;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("file too large") ||
    message.includes("filesize limit") ||
    message.includes("file size")
  );
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * Detect characters from project RPY files
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

    // Get all project files for this project
    const allProjectFiles = await db
      .select()
      .from(projectFiles)
      .where(eq(projectFiles.projectId, projectId));

    // Parse characters from all files
    const allDetected: DetectedCharacter[] = [];
    for (const file of allProjectFiles) {
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
        avatarUrl: characters.avatarUrl,
      })
      .from(characters)
      .where(eq(characters.projectId, projectId))
      .orderBy(characters.renpyTag);

    // Build full avatar URLs for each character
    const charactersWithUrls = projectCharacters.map((character) => ({
      ...character,
      avatarUrl: buildAvatarUrl(character.avatarUrl),
    }));

    reply
      .status(200)
      .send({ characters: charactersWithUrls } as ListCharactersResponse);
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
        avatarUrl: buildAvatarUrl(character.avatarUrl),
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
        avatarUrl: buildAvatarUrl(newCharacter.avatarUrl),
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
        avatarUrl: buildAvatarUrl(updatedCharacter.avatarUrl),
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

    // Delete database record first (if this fails, we keep the file)
    await db.delete(characters).where(eq(characters.id, characterId));

    // Attempt to delete avatar file after successful DB deletion
    if (character.avatarUrl) {
      try {
        await deleteAvatar(getAvatarFullPath(character.avatarUrl));
      } catch {
        request.log.warn(
          `Failed to delete avatar file: ${character.avatarUrl}`
        );
      }
    }

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

/**
 * Upload character avatar
 *
 * POST /characters/:characterId/avatar
 * Requires authentication
 */
async function uploadCharacterAvatarHandler(
  request: FastifyRequest<{ Params: { characterId: string } }>,
  reply: FastifyReply
): Promise<void> {
  const { characterId } = request.params;
  const user = request.user!;

  try {
    const db = getDb();

    // Get character
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

    // Parse multipart form data with fileSize limit enforced at stream creation
    let data;
    try {
      data = await request.file({
        limits: { fileSize: AVATAR_MAX_SIZE },
      });
    } catch (error) {
      if (isMultipartFileTooLargeError(error)) {
        throw new ValidationError(
          `File must be smaller than ${AVATAR_MAX_SIZE_MB}MB`
        );
      }
      throw error;
    }
    if (!data) {
      reply.status(400).send({ error: "No file uploaded" } as ErrorResponse);
      return;
    }

    const file = data as MultipartFile;

    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch (err: unknown) {
      // Handle multipart plugin errors like file size limit exceeded
      // The error may be thrown by busboy when fileSize limit is exceeded
      if (isMultipartFileTooLargeError(err)) {
        throw new ValidationError(
          `File must be smaller than ${AVATAR_MAX_SIZE_MB}MB`
        );
      }
      throw err; // Re-throw other errors to be caught by outer catch block
    }

    // Check if file was truncated due to size limit after buffering
    // The truncated property is on the BusboyFileStream, not MultipartFile
    if (file.file.truncated) {
      throw new ValidationError(
        `File must be smaller than ${AVATAR_MAX_SIZE_MB}MB`
      );
    }

    // Validate the buffered file size as the authoritative check
    if (buffer.length > AVATAR_MAX_SIZE) {
      throw new ValidationError(
        `File must be smaller than ${AVATAR_MAX_SIZE_MB}MB`
      );
    }

    // Validate and process image
    const result = await validateAndProcessAvatar(buffer, file.mimetype);

    // Ensure upload directory exists
    await ensureAvatarDir();

    // Backup the existing avatar file if it exists, so we can restore on DB failure.
    // Treat backup creation as a hard failure (except ENOENT - file doesn't exist is ok).
    let previousAvatarBackupPath: string | undefined;
    if (character.avatarUrl) {
      const previousAvatarPath = getAvatarFullPath(character.avatarUrl);
      try {
        await fs.access(previousAvatarPath);
        // Create a backup of the existing avatar before we overwrite/delete it
        previousAvatarBackupPath = `${previousAvatarPath}.backup-${Date.now()}-${
          process.pid
        }`;
        await fs.copyFile(previousAvatarPath, previousAvatarBackupPath);
      } catch (accessError) {
        // If file doesn't exist, that's fine - no backup needed
        // For any other error (permissions, disk full, etc.), fail fast
        if ((accessError as NodeJS.ErrnoException).code !== "ENOENT") {
          request.log.error(
            accessError,
            `Failed to create backup of previous avatar: ${character.avatarUrl}`
          );
          return reply.status(500).send({
            error: "Failed to backup existing avatar file",
          } as ErrorResponse);
        }
        // File doesn't exist - proceed without backup
        request.log.info(
          `Previous avatar file does not exist, skipping backup: ${character.avatarUrl}`
        );
      }
    }

    // Write processed file to disk
    const filePath = getAvatarFullPath(result.filename);
    await fs.writeFile(filePath, result.buffer);

    // Delete old avatar file if exists (after we've backed it up).
    // Log failure but don't affect previousAvatarBackupPath - preserve it for potential restore.
    if (character.avatarUrl) {
      try {
        await deleteAvatar(getAvatarFullPath(character.avatarUrl));
      } catch (deleteError) {
        request.log.warn(
          deleteError,
          `Failed to delete old avatar file (keeping backup): ${character.avatarUrl}`
        );
      }
    }

    // Store only the filename in the database.
    let updatedCharacter;
    try {
      [updatedCharacter] = await db
        .update(characters)
        .set({
          avatarUrl: result.filename,
          updatedAt: new Date(),
        })
        .where(eq(characters.id, characterId))
        .returning();
    } catch (error) {
      request.log.error(error, "Failed to update character avatar in database");

      // Restore previous avatar from backup if we have one
      if (previousAvatarBackupPath) {
        const previousAvatarPath = getAvatarFullPath(character.avatarUrl!);
        try {
          await fs.copyFile(previousAvatarBackupPath, previousAvatarPath);
          request.log.info(
            `Restored previous avatar file: ${character.avatarUrl}`
          );
        } catch (restoreError) {
          request.log.error(
            restoreError,
            `Failed to restore previous avatar file: ${character.avatarUrl}`
          );
        }
      }

      // Clean up the new uploaded file since DB update failed
      try {
        await deleteAvatar(filePath);
      } catch {
        request.log.warn(`Failed to delete avatar file: ${result.filename}`);
      }

      throw error;
    }

    // Success: clean up the backup file if it exists
    if (previousAvatarBackupPath) {
      try {
        await deleteAvatar(previousAvatarBackupPath);
      } catch {
        request.log.warn(
          `Failed to delete avatar backup file: ${previousAvatarBackupPath}`
        );
      }
    }

    // Return the full URL for client access
    const avatarUrl = buildAvatarUrl(updatedCharacter.avatarUrl);
    if (!avatarUrl) {
      request.log.error(
        { characterId: updatedCharacter.id },
        "avatarUrl unexpectedly null for updatedCharacter after successful upload"
      );
      return reply
        .status(500)
        .send({ error: "Internal server error" } as ErrorResponse);
    }
    reply.status(200).send({
      avatarUrl,
    } as UploadAvatarResponse);
  } catch (error) {
    // Re-throw HttpError instances (e.g., ValidationError) so the global error handler can use their status code
    if (error instanceof HttpError) {
      throw error;
    }
    // Handle multipart file size limit errors (from busboy)
    if (isMultipartFileTooLargeError(error)) {
      throw new ValidationError(
        `File must be smaller than ${AVATAR_MAX_SIZE_MB}MB`
      );
    }
    request.log.error(error);
    reply.status(500).send({ error: "Internal server error" } as ErrorResponse);
  }
}

/**
 * Delete character avatar
 *
 * DELETE /characters/:characterId/avatar
 * Requires authentication
 */
async function deleteCharacterAvatarHandler(
  request: FastifyRequest<{ Params: { characterId: string } }>,
  reply: FastifyReply
): Promise<void> {
  const { characterId } = request.params;
  const user = request.user!;

  try {
    const db = getDb();

    // Get character
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

    // Update character to remove avatar URL first (DB consistency)
    await db
      .update(characters)
      .set({
        avatarUrl: null,
        updatedAt: new Date(),
      })
      .where(eq(characters.id, characterId));

    // Delete avatar file after successful DB update
    if (character.avatarUrl) {
      try {
        await deleteAvatar(getAvatarFullPath(character.avatarUrl));
      } catch {
        request.log.warn(
          `Failed to delete avatar file: ${character.avatarUrl}`
        );
      }
    }

    reply.status(204).send();
  } catch (error) {
    // Re-throw HttpError instances (e.g., ValidationError) so the global error handler can use their status code
    if (error instanceof HttpError) {
      throw error;
    }
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

/**
 * Avatar routes (separate export for registration with multipart plugin)
 */
export async function characterAvatarRoutes(
  fastify: FastifyInstance
): Promise<void> {
  // Upload avatar
  fastify.post<{ Params: { characterId: string } }>(
    "/characters/:characterId/avatar",
    {
      onRequest: authenticate,
      preValidation: validateParams(characterIdParamsSchema),
    },
    uploadCharacterAvatarHandler
  );

  // Delete avatar
  fastify.delete<{ Params: { characterId: string } }>(
    "/characters/:characterId/avatar",
    {
      onRequest: authenticate,
      preValidation: validateParams(characterIdParamsSchema),
    },
    deleteCharacterAvatarHandler
  );
}
