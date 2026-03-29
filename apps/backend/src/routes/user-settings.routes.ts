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
import { getDb } from "../db/index.js";
import { userSettings } from "../db/schema/index.js";
import { eq } from "drizzle-orm";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_USER_SETTINGS: Omit<
  typeof userSettings.$inferInsert,
  "userId" | "id" | "createdAt" | "updatedAt"
> = {
  dailyWritingGoal: null,
  dailyWordResetHour: 0,
  dailyWordCounts: [],
  timezone: "UTC",
};

// ============================================================================
// Types
// ============================================================================

interface DailyWordCount {
  date: string;
  count: number;
}

interface UserSettingsResponse {
  dailyWritingGoal: number | null;
  dailyWordResetHour: number;
  dailyWordCounts: DailyWordCount[];
  timezone: string;
}

type UpdateWritingGoalResponse = UserSettingsResponse;

interface ResetWritingStatsResponse {
  success: boolean;
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
  const user = request.user!;
  const db = getDb();

  const [settings] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, user.id))
    .limit(1);

  if (!settings) {
    // Create default settings if they don't exist
    await db.insert(userSettings).values({
      userId: user.id,
      ...DEFAULT_USER_SETTINGS,
    });

    reply.send(DEFAULT_USER_SETTINGS as UserSettingsResponse);
    return;
  }

  reply.send({
    dailyWritingGoal: settings.dailyWritingGoal ?? null,
    dailyWordResetHour: settings.dailyWordResetHour ?? 0,
    dailyWordCounts: (settings.dailyWordCounts as DailyWordCount[]) ?? [],
    timezone: settings.timezone ?? "UTC",
  } as UserSettingsResponse);
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
  const user = request.user!;
  const { dailyWritingGoal, dailyWordResetHour, timezone } = request.body;
  const db = getDb();

  // Check if settings exist
  const [existingSettings] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, user.id))
    .limit(1);

  if (!existingSettings) {
    // Create default settings if they don't exist (matching GET handler behavior)
    await db.insert(userSettings).values({
      userId: user.id,
      ...DEFAULT_USER_SETTINGS,
    });
  }

  // Build update object with only provided fields
  const updateData: Partial<typeof userSettings.$inferInsert> & {
    updatedAt: Date;
  } = {
    updatedAt: new Date(),
  };

  if (dailyWritingGoal !== undefined) {
    updateData.dailyWritingGoal = dailyWritingGoal;
  }
  if (dailyWordResetHour !== undefined) {
    updateData.dailyWordResetHour = dailyWordResetHour;
  }
  if (timezone !== undefined) {
    updateData.timezone = timezone;
  }

  // Update settings
  await db
    .update(userSettings)
    .set(updateData)
    .where(eq(userSettings.userId, user.id));

  // Fetch updated settings
  const [updatedSettings] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, user.id))
    .limit(1);

  reply.send({
    dailyWritingGoal: updatedSettings.dailyWritingGoal ?? null,
    dailyWordResetHour: updatedSettings.dailyWordResetHour ?? 0,
    dailyWordCounts:
      (updatedSettings.dailyWordCounts as DailyWordCount[]) ?? [],
    timezone: updatedSettings.timezone ?? "UTC",
  } as UpdateWritingGoalResponse);
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
  const user = request.user!;
  const db = getDb();

  // Check if settings exist
  const [existingSettings] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, user.id))
    .limit(1);

  if (!existingSettings) {
    // Create default settings if they don't exist (matching GET handler behavior)
    await db.insert(userSettings).values({
      userId: user.id,
      ...DEFAULT_USER_SETTINGS,
    });
  }

  // Reset word counts to empty
  await db
    .update(userSettings)
    .set({
      dailyWordCounts: [],
      labelWordCounts: {},
      updatedAt: new Date(),
    })
    .where(eq(userSettings.userId, user.id));

  reply.send({ success: true } as ResetWritingStatsResponse);
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
