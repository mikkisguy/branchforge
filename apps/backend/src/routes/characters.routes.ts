/**
 * Characters Routes
 *
 * Thin HTTP wrappers that delegate all business logic to
 * charactersService. Handles only request parsing, multipart
 * file handling, and response mapping.
 */

import type { FastifyInstance } from "fastify";
import type { FastifyRequest, FastifyReply } from "fastify";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  validateParams,
  validateBody,
} from "../middleware/validation.middleware.js";
import { ValidationError } from "../middleware/error-handler.middleware.js";
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
import type { MultipartFile } from "@fastify/multipart";
import { AVATAR_MAX_SIZE, AVATAR_MAX_SIZE_MB } from "@branchforge/shared";
import { charactersService } from "../services/characters.service.js";

// ============================================================================
// Types
// ============================================================================

interface DetectCharactersParams {
  projectId: string;
}

// ============================================================================
// Helpers
// ============================================================================

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
 */
async function detectCharactersHandler(
  request: FastifyRequest<{ Params: DetectCharactersParams }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const result = await charactersService.detectCharacters(
    projectId,
    request.user!.id
  );
  reply.status(200).send(result);
}

/**
 * Import characters after review
 *
 * POST /projects/:projectId/characters/import
 * Body: ImportCharactersInput
 */
async function importCharactersHandler(
  request: FastifyRequest<{
    Params: DetectCharactersParams;
    Body: ImportCharactersInput;
  }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const result = await charactersService.importCharacters(
    projectId,
    request.user!.id,
    request.body
  );
  reply.status(201).send(result);
}

/**
 * List all characters for a project
 *
 * GET /projects/:projectId/characters
 */
async function listCharactersHandler(
  request: FastifyRequest<{ Params: DetectCharactersParams }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const characters = await charactersService.listCharacters(
    projectId,
    request.user!.id
  );
  reply.status(200).send({ characters });
}

/**
 * Get a single character by ID
 *
 * GET /characters/:characterId
 */
async function getCharacterHandler(
  request: FastifyRequest<{ Params: { characterId: string } }>,
  reply: FastifyReply
): Promise<void> {
  const { characterId } = request.params;
  const character = await charactersService.getCharacter(
    characterId,
    request.user!.id
  );
  reply.status(200).send({ character });
}

/**
 * Create a new character
 *
 * POST /projects/:projectId/characters
 * Body: CreateCharacterInput
 */
async function createCharacterHandler(
  request: FastifyRequest<{
    Params: DetectCharactersParams;
    Body: CreateCharacterInput;
  }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const character = await charactersService.createCharacter(
    projectId,
    request.user!.id,
    request.body
  );
  reply.status(201).send({ character });
}

/**
 * Update a character
 *
 * PUT /characters/:characterId
 * Body: UpdateCharacterInput
 */
async function updateCharacterHandler(
  request: FastifyRequest<{
    Params: { characterId: string };
    Body: UpdateCharacterInput;
  }>,
  reply: FastifyReply
): Promise<void> {
  const { characterId } = request.params;
  const character = await charactersService.updateCharacter(
    characterId,
    request.user!.id,
    request.body
  );
  reply.status(200).send({ character });
}

/**
 * Delete a character
 *
 * DELETE /characters/:characterId
 */
async function deleteCharacterHandler(
  request: FastifyRequest<{ Params: { characterId: string } }>,
  reply: FastifyReply
): Promise<void> {
  const { characterId } = request.params;
  await charactersService.deleteCharacter(characterId, request.user!.id);
  reply.status(204).send();
}

/**
 * Get project settings
 *
 * GET /projects/:projectId/character-settings
 */
async function getProjectSettingsHandler(
  request: FastifyRequest<{ Params: DetectCharactersParams }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const settings = await charactersService.getCharacterSettings(
    projectId,
    request.user!.id
  );
  reply.status(200).send(settings);
}

/**
 * Update project settings
 *
 * PUT /projects/:projectId/character-settings
 * Body: ProjectSettingsInput
 */
async function updateProjectSettingsHandler(
  request: FastifyRequest<{
    Params: DetectCharactersParams;
    Body: ProjectSettingsInput;
  }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const settings = await charactersService.updateCharacterSettings(
    projectId,
    request.user!.id,
    request.body
  );
  reply.status(200).send(settings);
}

/**
 * Upload character avatar
 *
 * POST /characters/:characterId/avatar
 */
async function uploadCharacterAvatarHandler(
  request: FastifyRequest<{ Params: { characterId: string } }>,
  reply: FastifyReply
): Promise<void> {
  const { characterId } = request.params;

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
    reply.status(400).send({ error: "No file uploaded" });
    return;
  }

  const file = data as MultipartFile;

  let buffer: Buffer;
  try {
    buffer = await file.toBuffer();
  } catch (err: unknown) {
    if (isMultipartFileTooLargeError(err)) {
      throw new ValidationError(
        `File must be smaller than ${AVATAR_MAX_SIZE_MB}MB`
      );
    }
    throw err;
  }

  // Check if file was truncated due to size limit after buffering
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

  const result = await charactersService.uploadAvatar(
    characterId,
    request.user!.id,
    buffer,
    file.mimetype
  );

  reply.status(200).send(result);
}

/**
 * Delete character avatar
 *
 * DELETE /characters/:characterId/avatar
 */
async function deleteCharacterAvatarHandler(
  request: FastifyRequest<{ Params: { characterId: string } }>,
  reply: FastifyReply
): Promise<void> {
  const { characterId } = request.params;
  await charactersService.deleteAvatar(characterId, request.user!.id);
  reply.status(204).send();
}

// ============================================================================
// Routes Registration
// ============================================================================

export async function charactersRoutes(
  fastify: FastifyInstance
): Promise<void> {
  // All routes require authentication

  // Detect characters from project files
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
