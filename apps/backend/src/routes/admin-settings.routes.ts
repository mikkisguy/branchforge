/**
 * Admin Settings Routes
 *
 * Routes for managing application-wide admin settings.
 * Public endpoints allow checking settings status (e.g., signups enabled).
 * Admin endpoints require OWNER role to modify settings.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import { getAdminSetting } from '../services/admin-settings.service.js';
import { adminSettings } from '../db/schema/index.js';
import { getDb } from '../db/index.js';

// ============================================================================
// Types
// ============================================================================

interface UpdateSettingParams {
  key: string;
}

interface UpdateSettingBody {
  value: unknown;
}

interface SettingResponse {
  key: string;
  value: unknown;
}

interface SignUpStatusResponse {
  enabled: boolean;
}

interface AllSettingsResponse {
  settings: Record<string, unknown>;
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * Get signups enabled status (public)
 *
 * GET /public/settings/signups
 *
 * Returns whether new user registration is currently enabled.
 * This endpoint is public so the signup form can be disabled gracefully.
 */
async function getSignUpStatusHandler(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const enabled = await getAdminSetting('sign_ups_enabled');
  reply.send({ enabled: enabled !== false } as SignUpStatusResponse);
}

/**
 * Get all admin settings (admin only)
 *
 * GET /admin/settings
 *
 * Returns all admin settings as a key-value object.
 * Requires OWNER role.
 */
async function getAllSettingsHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const db = getDb();
  const settings = await db.select().from(adminSettings);
  const record = settings.reduce((acc: Record<string, any>, s) => {
    acc[s.key] = s.value;
    return acc;
  }, {});
  reply.send({ settings: record } as AllSettingsResponse);
}

/**
 * Update an admin setting (admin only)
 *
 * PUT /admin/settings/:key
 * Body: { value: unknown }
 *
 * Updates or creates a setting with the given key and value.
 * Requires OWNER role. Tracks which user made the change.
 */
async function updateSettingHandler(
  request: FastifyRequest<{ Params: UpdateSettingParams; Body: UpdateSettingBody }>,
  reply: FastifyReply
): Promise<void> {
  const { key } = request.params;
  const { value } = request.body;
  const user = request.user!;

  const { setAdminSetting } = await import('../services/admin-settings.service.js');
  await setAdminSetting(key, value, user.id);

  reply.send({ key, value } as SettingResponse);
}

// ============================================================================
// Routes Registration
// ============================================================================

export async function adminSettingsRoutes(fastify: FastifyInstance): Promise<void> {
  // Public routes
  fastify.get('/public/settings/signups', getSignUpStatusHandler);

  // Admin routes (require OWNER role)
  fastify.get('/admin/settings', {
    onRequest: [authenticate, requireRole('OWNER')],
  }, getAllSettingsHandler);

  fastify.put<{ Params: UpdateSettingParams; Body: UpdateSettingBody }>('/admin/settings/:key', {
    onRequest: [authenticate, requireRole('OWNER')],
  }, updateSettingHandler);
}
