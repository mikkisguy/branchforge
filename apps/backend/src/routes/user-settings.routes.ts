/**
 * User Settings Routes
 *
 * Routes for managing per-user settings including daily writing goals.
 * All routes require authentication.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authenticate } from "../middleware/auth.middleware.js";
import { validateBody } from "../middleware/validation.middleware.js";
import {
  updateWritingGoalSchema,
  type UpdateWritingGoalInput,
} from "../lib/validation.js";
import {
  getUserSettings,
  updateUserSettings,
  resetWritingStats,
} from "../services/user-settings.service.js";

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

// ============================================================================
// Routes Registration
// ============================================================================

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

  fastify.post(
    "/user/settings/reset-stats",
    {
      onRequest: authenticate,
    },
    resetWritingStatsHandler
  );
}
