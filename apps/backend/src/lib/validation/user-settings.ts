/**
 * User Settings Validation Schemas
 *
 * Request validation for user profile, writing goals,
 * and locale/timezone settings.
 */

import { z } from "zod";
import { THEME_PALETTES } from "@branchforge/shared";

// ============================================================================
// Timezone
// ============================================================================

/**
 * Cache of valid IANA timezone identifiers
 * Populated on first access using Intl.supportedValuesOf where available
 */
let validTimezones: Set<string> | null = null;

/**
 * Get the set of valid IANA timezone identifiers supported by the runtime
 * Falls back to UTC if Intl.supportedValuesOf is not available
 */
function getValidTimezones(): Set<string> {
  if (validTimezones !== null) {
    return validTimezones;
  }

  try {
    // Intl.supportedValuesOf is available in Node.js 18+ and modern browsers
    if (typeof Intl !== "undefined" && "supportedValuesOf" in Intl) {
      const zones = (
        Intl as unknown as { supportedValuesOf: (key: string) => string[] }
      ).supportedValuesOf("timeZone");
      validTimezones = new Set(zones);
      return validTimezones;
    }
  } catch {
    // Fallback to UTC only if supportedValuesOf fails
  }

  // Fallback: Only allow UTC if we can't get the full list
  validTimezones = new Set(["UTC"]);
  return validTimezones;
}

/**
 * Check if a string is a valid IANA timezone identifier
 * @param timezone - The timezone string to validate
 * @returns true if the timezone is valid, false otherwise
 */
export function isValidTimezone(timezone: string): boolean {
  const trimmed = timezone.trim();
  return getValidTimezones().has(trimmed);
}

// ============================================================================
// Schemas
// ============================================================================

/**
 * Daily word count entry schema
 */
export const dailyWordCountEntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  count: z.number().int().min(0),
});

/**
 * Timezone validation schema
 * Validates that the value is a valid IANA timezone identifier
 * Examples: "UTC", "America/New_York", "Europe/London", "Asia/Tokyo"
 */
export const timezoneSchema = z
  .string()
  .trim()
  .min(1, "Timezone is required")
  .max(64, "Timezone is too long")
  .refine((val) => isValidTimezone(val), {
    message:
      "Invalid IANA timezone identifier. Examples: UTC, America/New_York, Europe/London",
  });

/**
 * Username validation schema
 * Alphanumeric, underscores, hyphens, 3-30 characters
 */
export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(30, "Username must be 30 characters or less")
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "Username can only contain letters, numbers, underscores, and hyphens"
  );

/**
 * Language validation schema
 * ISO 639-1 language code (2 letters)
 */
export const languageSchema = z
  .string()
  .trim()
  .min(2, "Language code must be 2 characters")
  .max(2, "Language code must be 2 characters")
  .regex(/^[a-z]{2}$/, "Language code must be a valid 2-letter ISO code");

/**
 * Theme validation schema
 * Uses THEME_PALETTES from shared package as single source of truth
 */
export const themeSchema = z.enum(THEME_PALETTES, {
  message: "Theme must be forest, periwinkle, dark-amethyst, or graphite",
});

/**
 * Update writing goal settings request validation
 */
export const updateWritingGoalSchema = z
  .object({
    dailyWritingGoal: z.number().int().positive().nullable().optional(),
    dailyWordResetHour: z
      .number()
      .int()
      .min(0, "Reset hour must be between 0 and 23")
      .max(23, "Reset hour must be between 0 and 23")
      .optional(),
    timezone: timezoneSchema.optional(),
  })
  .strict();

export type UpdateWritingGoalInput = z.infer<typeof updateWritingGoalSchema>;

/**
 * Update user profile settings request validation
 */
export const updateUserProfileSchema = z
  .object({
    username: usernameSchema.optional(),
    language: languageSchema.optional(),
    theme: themeSchema.optional(),
  })
  .strict();

export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;
