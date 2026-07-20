/**
 * Character Validation Schemas
 *
 * Request validation for character CRUD, import, project settings,
 * and visual system configuration.
 */

import { z } from "zod";
import { uuidSchema, requiredString, optionalString } from "./common.js";

/**
 * Ren'Py tag validation schema
 * Validates character tags (alphanumeric, underscores)
 */
export const renpyTagSchema = z
  .string()
  .min(1, "Character tag is required")
  .max(50, "Character tag is too long")
  .regex(
    /^[a-zA-Z_][a-zA-Z0-9_]*$/,
    "Character tag must start with letter/underscore and contain only letters, numbers, and underscores"
  );

/**
 * Color hex validation schema
 * Validates hex color format (#RRGGBB)
 */
export const colorHexSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a valid hex format (#RRGGBB)");

/**
 * Create character request validation (import from RPY)
 *
 * Field explanations:
 * - renpyTag: The dialogue tag used in RPY files (e.g., "s" for `s "Hello!"`)
 * - name: The variable reference from Character() definition (e.g., "[s_first]", "Name", None)
 * - displayName: The human-readable name shown in BranchForge UI (Writer Mode, Character menu)
 * - color: Hex color for dialogue display
 */
export const createCharacterSchema = z
  .object({
    projectId: uuidSchema,
    name: requiredString(200, "Name is too long"),
    displayName: requiredString(200, "Display name is too long"),
    renpyTag: renpyTagSchema,
    color: colorHexSchema,
    routeAffiliation: optionalString(50),
    isLoveInterest: z.boolean().default(false),
    isNarrator: z.boolean().default(false),
    notes: optionalString(10000),
    conditionalPrefix: optionalString(50),
  })
  .strict();

export type CreateCharacterInput = z.infer<typeof createCharacterSchema>;

/**
 * Update character request validation
 */
export const updateCharacterSchema = z
  .object({
    name: requiredString(200, "Name is too long").optional(),
    displayName: requiredString(200, "Display name is too long").optional(),
    color: colorHexSchema.optional(),
    routeAffiliation: optionalString(50),
    isLoveInterest: z.boolean().optional(),
    isNarrator: z.boolean().optional(),
    notes: optionalString(10000),
    conditionalPrefix: optionalString(50),
  })
  .strict()
  .partial();

export type UpdateCharacterInput = z.infer<typeof updateCharacterSchema>;

/**
 * Character import request validation
 */
export const importCharactersSchema = z
  .object({
    characters: z
      .array(
        z.object({
          tag: renpyTagSchema,
          name: z.string().nullable(),
          displayName: requiredString(200, "Display name is too long"),
          color: colorHexSchema,
          isLoveInterest: z.boolean().optional(),
          isNarrator: z.boolean().optional(),
          routeAffiliation: optionalString(50),
        })
      )
      .min(1, "At least one character is required"),
    excludedTags: z.array(renpyTagSchema).default([]),
    narratorTags: z.array(renpyTagSchema).default([]),
    linkToLines: z.boolean().default(true),
  })
  .strict();

export type ImportCharactersInput = z.infer<typeof importCharactersSchema>;

/**
 * Project settings validation
 */
export const projectSettingsSchema = z
  .object({
    excludedCharacterTags: z.array(renpyTagSchema).default([]),
    narratorCharacterTags: z.array(renpyTagSchema).default([]),
    autoLinkSpeakers: z.boolean().default(true),
  })
  .strict()
  .partial();

export type ProjectSettingsInput = z.infer<typeof projectSettingsSchema>;

// ============================================================================
// Visual System Config
// ============================================================================

/**
 * Padding value for zero-padded number fields in visual system config.
 * Matches the `1 | 2` union declared in VisualSystemConfig.
 */
const paddingSchema = z.union([z.literal(1), z.literal(2)], {
  message: "Padding must be 1 or 2",
});

/**
 * Group prefix entry: maps a group value (e.g. "I", "1") to a short
 * filename prefix (e.g. "ai", "ch1"). Keys are non-empty trimmed strings.
 */
const groupPrefixEntrySchema = z.record(
  z.string().trim().min(1),
  z
    .string()
    .trim()
    .min(1, "Group prefix cannot be empty")
    .max(50, "Group prefix is too long")
);

/**
 * Visual system config validation.
 *
 * The wire shape matches the shared `VisualSystemConfig` interface so
 * frontend and backend stay in lockstep. All fields are optional in
 * the update schema (`.partial()`) so clients can PATCH a subset.
 *
 * Clearing semantics: `defaultGroupType: ""` and `placeholderBaseUrl: ""`
 * are explicitly accepted so clients can send an empty string to clear
 * a previously-set value back to NULL. `groupPrefixes: {}` clears the
 * stored map back to NULL too. The service layer converts these
 * sentinels into `null` on write.
 */
export const visualSystemConfigSchema = z
  .object({
    namingTemplate: z
      .string()
      .trim()
      .min(1, "Naming template is required")
      .max(500, "Naming template is too long"),
    groupPrefixes: z
      .record(z.string().trim().min(1), groupPrefixEntrySchema)
      .optional(),
    defaultGroupType: z
      .string()
      .trim()
      .max(50, "Default group type is too long")
      .optional()
      .or(z.literal("")),
    labelPadding: paddingSchema,
    counterPadding: paddingSchema,
    jumpPrefixShared: z
      .string()
      .trim()
      .min(1, "Shared jump prefix is required")
      .max(100, "Shared jump prefix is too long")
      .or(z.literal("")),
    placeholderBaseUrl: z
      .string()
      .trim()
      .max(2000, "Placeholder base URL is too long")
      .refine(
        (value) => {
          if (value === "") return true;
          try {
            const url = new URL(value);
            return url.protocol === "http:" || url.protocol === "https:";
          } catch {
            return false;
          }
        },
        { message: "Placeholder base URL must be an http or https URL" }
      )
      .optional()
      .or(z.literal("")),
  })
  .strict()
  .partial();

export type VisualSystemConfigInput = z.infer<typeof visualSystemConfigSchema>;

/**
 * Visual system config defaults — applied when a project has no row in
 * `visual_systems` yet (or when the client sends only a partial update).
 *
 * Kept in sync with the column defaults in `db/schema/tables/visual-systems.ts`.
 */
export const VISUAL_SYSTEM_CONFIG_DEFAULTS = {
  namingTemplate: "{route}{group}_{label}_{counter}_{slug}",
  labelPadding: 2,
  counterPadding: 2,
  jumpPrefixShared: "",
} as const;

/**
 * Character ID params validation
 */
export const characterIdParamsSchema = z.object({
  characterId: uuidSchema,
});
