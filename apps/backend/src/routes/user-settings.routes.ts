/**
 * User Settings Routes
 *
 * Routes for managing per-user settings including profile, avatar, language,
 * theme, and daily writing goals. All routes require authentication.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { MultipartFile } from "@fastify/multipart";
import { authenticate } from "../middleware/auth.middleware.js";
import { validateBody } from "../middleware/validation.middleware.js";
import {
  ValidationError,
  RateLimitError,
} from "../middleware/error-handler.middleware.js";
import { checkRateLimit } from "../services/rate-limiter.service.js";
import {
  updateWritingGoalSchema,
  updateUserProfileSchema,
  type UpdateWritingGoalInput,
  type UpdateUserProfileInput,
} from "../lib/validation.js";
import {
  getUserSettings,
  updateUserSettings,
  resetWritingStats,
  uploadUserAvatar,
  deleteUserAvatar,
} from "../services/user-settings.service.js";
import { AVATAR_MAX_SIZE, AVATAR_MAX_SIZE_MB } from "@branchforge/shared";

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
 * Get current user's settings
 *
 * GET /user/settings
 * Requires authentication
 *
 * Returns the current user's writing goal settings including
 * daily goal, reset hour, word counts for the last 7 days, and timezone.
 */
async function getUserSettingsHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const settings = await getUserSettings(request.user!.id);
  reply.send(settings);
}

/**
 * Update current user's writing goal settings
 *
 * PUT /user/settings
 * Body: { dailyWritingGoal?: number | null, dailyWordResetHour?: number, timezone?: string }
 * Requires authentication
 *
 * Updates the current user's writing goal settings. Only fields that are
 * provided in the request body will be updated. Set dailyWritingGoal to null
 * to disable the daily writing goal feature.
 */
async function updateUserSettingsHandler(
  request: FastifyRequest<{ Body: UpdateWritingGoalInput }>,
  reply: FastifyReply
): Promise<void> {
  const { dailyWritingGoal, dailyWordResetHour, timezone } = request.body;
  const settings = await updateUserSettings(request.user!.id, {
    dailyWritingGoal,
    dailyWordResetHour,
    timezone,
  });
  reply.send(settings);
}

/**
 * Update current user's profile settings
 *
 * PUT /user/settings/profile
 * Body: { username?: string, language?: string, theme?: string }
 * Requires authentication
 *
 * Updates the current user's profile settings including username, language, and theme.
 * Only fields that are provided in the request body will be updated.
 */
async function updateUserProfileHandler(
  request: FastifyRequest<{ Body: UpdateUserProfileInput }>,
  reply: FastifyReply
): Promise<void> {
  const { username, language, theme } = request.body;
  const settings = await updateUserSettings(request.user!.id, {
    username,
    language,
    theme,
  });
  reply.send(settings);
}

/**
 * Upload user avatar
 *
 * POST /user/settings/avatar
 * Requires authentication
 *
 * Uploads an avatar image for the current user. The image is validated,
 * processed (converted to WebP and resized), and saved to the uploads directory.
 * The avatar URL is stored in the database.
 */
async function uploadUserAvatarHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Rate limit avatar uploads (CPU-intensive: sharp resize + WebP encode)
  const rateLimit = checkRateLimit(
    `avatarUpload:${request.user!.id}:${request.ip}`,
    { maxAttempts: 10, windowMs: 60_000 }
  );
  if (!rateLimit.allowed) {
    throw new RateLimitError(rateLimit.retryAfter);
  }

  // Parse multipart form data with fileSize limit enforced at stream creation
  let data: MultipartFile | undefined;
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
    throw new ValidationError("No file uploaded");
  }

  let buffer: Buffer;
  try {
    buffer = await data.toBuffer();
  } catch (err: unknown) {
    if (isMultipartFileTooLargeError(err)) {
      throw new ValidationError(
        `File must be smaller than ${AVATAR_MAX_SIZE_MB}MB`
      );
    }
    throw err;
  }

  // Check if file was truncated due to size limit after buffering
  if (data.file.truncated) {
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

  const result = await uploadUserAvatar(
    request.user!.id,
    buffer,
    data.mimetype
  );

  reply.send(result);
}

/**
 * Delete user avatar
 *
 * DELETE /user/settings/avatar
 * Requires authentication
 *
 * Deletes the current user's avatar image. Both the file and the database
 * reference are removed.
 */
async function deleteUserAvatarHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  await deleteUserAvatar(request.user!.id);
  reply.status(204).send();
}

/**
 * Reset writing statistics
 *
 * POST /user/settings/reset-stats
 * Requires authentication
 *
 * Resets the user's writing statistics including daily word counts and
 * per-label tracking. This is useful when importing projects or recovering
 * from incorrect data.
 */
async function resetWritingStatsHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  await resetWritingStats(request.user!.id);
  reply.send({ success: true });
}

/**
 * Routes Registration
 * ============================================================================ */

export async function userSettingsRoutes(
  fastify: FastifyInstance
): Promise<void> {
  // All routes require authentication
  fastify.get(
    "/user/settings",
    {
      onRequest: authenticate,
    },
    getUserSettingsHandler
  );

  fastify.put<{ Body: UpdateWritingGoalInput }>(
    "/user/settings",
    {
      onRequest: authenticate,
      preValidation: validateBody(updateWritingGoalSchema),
    },
    updateUserSettingsHandler
  );

  fastify.put<{ Body: UpdateUserProfileInput }>(
    "/user/settings/profile",
    {
      onRequest: authenticate,
      preValidation: validateBody(updateUserProfileSchema),
    },
    updateUserProfileHandler
  );

  fastify.post(
    "/user/settings/reset-stats",
    {
      onRequest: authenticate,
    },
    resetWritingStatsHandler
  );
}

/**
 * Avatar routes (separate export for registration with multipart plugin)
 */
export async function userSettingsAvatarRoutes(
  fastify: FastifyInstance
): Promise<void> {
  // Upload avatar
  fastify.post(
    "/user/settings/avatar",
    {
      onRequest: authenticate,
    },
    uploadUserAvatarHandler
  );

  // Delete avatar
  fastify.delete(
    "/user/settings/avatar",
    {
      onRequest: authenticate,
    },
    deleteUserAvatarHandler
  );
}
