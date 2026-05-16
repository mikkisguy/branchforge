/**
 * Admin Settings Service
 *
 * Handles CRUD operations for application-wide admin settings stored in the database.
 * Settings are stored as key-value pairs with JSON values for flexibility.
 */

import { getDb } from "../db/index.js";
import { adminSettings } from "../db/schema/index.js";
import { eq } from "drizzle-orm";

/**
 * Get a specific admin setting by key
 * @param key - The setting key to retrieve
 * @returns The setting value, or null if not found
 */
export async function getAdminSetting(key: string): Promise<unknown> {
  const db = getDb();
  const result = await db
    .select()
    .from(adminSettings)
    .where(eq(adminSettings.key, key));
  return result[0]?.value ?? null;
}

/**
 * Set or update an admin setting
 * Uses upsert logic: inserts if not exists, updates if exists
 * @param key - The setting key
 * @param value - The setting value (any JSON-serializable value)
 * @param userId - The ID of the user making the change
 */
export async function setAdminSetting(
  key: string,
  value: unknown,
  userId: string
): Promise<void> {
  const db = getDb();
  await db
    .insert(adminSettings)
    .values({
      key,
      value,
      updatedBy: userId,
    })
    .onConflictDoUpdate({
      target: adminSettings.key,
      set: { value, updatedAt: new Date(), updatedBy: userId },
    });
}

/**
 * Get all admin settings as a key-value record
 * @returns Record of all settings keyed by setting key
 */
export async function getAllAdminSettings(): Promise<Record<string, unknown>> {
  const db = getDb();
  const settings = await db.select().from(adminSettings);
  const record: Record<string, unknown> = Object.create(null);
  for (const s of settings) {
    record[s.key] = s.value;
  }
  return record;
}

/**
 * Check if new user signups are currently enabled
 * @returns true if signups are enabled, false otherwise (defaults to true)
 */
export async function isSignUpsEnabled(): Promise<boolean> {
  const enabled = await getAdminSetting("sign_ups_enabled");
  // Only explicit boolean false disables signups. All other values (0, "", null, etc.) are treated as enabled.
  // This ensures strict disable semantics while maintaining a safe default-true behavior.
  return enabled !== false;
}
