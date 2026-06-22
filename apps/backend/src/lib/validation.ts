/**
 * Validation Schemas
 *
 * Central validation library using Zod for runtime type-safe validation.
 * All API input validation should use these schemas for consistency.
 *
 * Benefits:
 * - Type-safe validation with auto-inferred TypeScript types
 * - Consistent error messages
 * - Sanitization (trim, lowercase, etc.)
 * - Security (prevent injection, validate formats)
 */

import { z } from "zod";
import { ValidationError } from "../middleware/error-handler.middleware.js";
import {
  LabelStatus,
  UserRole,
  ROUTE_KEY_REGEX,
  JUMP_PREFIX_REGEX,
} from "@branchforge/shared";
import {
  isPrivateOrLocalHostname,
  isAllowedGitlabHost,
} from "./ip-validation.js";

// ============================================================================
// Common Schemas
// ============================================================================

/**
 * UUID validation schema
 * Validates UUID v4 format
 */
export const uuidSchema = z.string().uuid({
  message: "Invalid UUID format",
});

/**
 * Email validation schema
 * Validates email format with reasonable restrictions
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Email is required")
  .max(254, "Email is too long")
  .email("Invalid email format");

/**
 * Non-empty string schema
 * Validates that a string is not empty after trimming
 */
export const nonEmptyStringSchema = z
  .string()
  .trim()
  .min(1, "This field is required")
  .max(1000, "This field is too long");

/**
 * Create a non-empty string schema with a custom max length
 */
export function requiredString(max: number, message?: string) {
  return z
    .string()
    .trim()
    .min(1, "This field is required")
    .max(max, message || `Must be ${max} characters or less`);
}

/**
 * Optional string schema
 * Allows empty strings but trims them
 */
export const optionalStringSchema = z
  .string()
  .max(1000, "This field is too long")
  .trim()
  .optional();

/**
 * Create an optional string schema with a custom max length
 */
export function optionalString(max: number, message?: string) {
  return z
    .string()
    .max(max, message || `Must be ${max} characters or less`)
    .trim()
    .optional();
}

/**
 * Password validation schema
 * Enforces reasonable password requirements
 */
export const passwordSchema = z.preprocess(
  (val) => (typeof val === "string" ? val.trim() : val),
  z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password is too long")
);

/**
 * Expected content hash validation schema
 * Optional content hash for optimistic locking
 */
export const expectedContentHashSchema = z
  .string()
  .trim()
  .min(1, "Expected content hash cannot be empty")
  .max(128, "Expected content hash is too long")
  .optional();

/**
 * Boolean string schema
 * Accepts boolean-like strings and converts to boolean
 */
export const booleanStringSchema = z
  .string()
  .optional()
  .transform((val) => {
    if (val === undefined) return undefined;
    if (val.toLowerCase() === "true") return true;
    if (val.toLowerCase() === "false") return false;
    return val;
  })
  .pipe(z.boolean().optional());

/**
 * Integer string schema
 * Accepts numeric strings and converts to integer
 */
export const intStringSchema = z
  .string()
  .optional()
  .refine((val) => val === undefined || /^\s*-?\d+\s*$/.test(val), {
    message: "Must be an integer string",
  })
  .transform((val) => (val === undefined ? undefined : parseInt(val, 10)))
  .pipe(z.number().int().optional());

// ============================================================================
// Enum Schemas (from database)
// ============================================================================

/**
 * User role enum
 */
export const userRoleSchema = z.enum(Object.values(UserRole), {
  message: "Role must be OWNER, READER, or TESTER",
});

/**
 * Label status enum
 */
export const labelStatusSchema = z.enum(
  [LabelStatus.DRAFT, LabelStatus.REVIEW, LabelStatus.FINAL],
  {
    message: "Status must be DRAFT, REVIEW, or FINAL",
  }
);

/**
 * Route configuration key schema
 * Validates route key format (alphanumeric, underscores, hyphens)
 */
export const routeConfigKeySchema = z
  .string()
  .min(1, "Route key is required")
  .max(50, "Route key is too long")
  .regex(
    ROUTE_KEY_REGEX,
    "Route key must contain only letters, numbers, underscores, and hyphens"
  );

/**
 * Content type enum
 */
export const contentTypeSchema = z.enum(
  ["NARRATION", "DIALOGUE", "CHOICE", "MENU", "JUMP"],
  {
    message: "Content type must be NARRATION, DIALOGUE, CHOICE, MENU, or JUMP",
  }
);

/**
 * Visual type enum
 */
export const visualTypeSchema = z.enum(["GENERATED", "BLACK", "CUSTOM"], {
  message: "Visual type must be GENERATED, BLACK, or CUSTOM",
});

/**
 * Element type enum
 */
export const elementTypeSchema = z.enum(
  ["LOCATION", "ITEM", "CONCEPT", "EVENT"],
  {
    message: "Element type must be LOCATION, ITEM, CONCEPT, or EVENT",
  }
);

/**
 * Suggestion type enum
 */
export const suggestionTypeSchema = z.enum(
  ["CONSISTENCY", "FLAG_SUGGEST", "METER_SUGGEST", "DIALOGUE_VARIANT"],
  {
    message:
      "Suggestion type must be CONSISTENCY, FLAG_SUGGEST, METER_SUGGEST, or DIALOGUE_VARIANT",
  }
);

/**
 * Suggestion status enum
 */
export const suggestionStatusSchema = z.enum(
  ["PENDING", "ACCEPTED", "REJECTED"],
  {
    message: "Suggestion status must be PENDING, ACCEPTED, or REJECTED",
  }
);

/**
 * Label visibility enum
 */
export const labelVisibilitySchema = z.enum(
  ["EXCLUSIVE", "SHARED", "DUO_PAIR"],
  {
    message: "Label visibility must be EXCLUSIVE, SHARED, or DUO_PAIR",
  }
);

/**
 * Sync operation enum
 */
export const syncOperationSchema = z.enum(["EXPORT", "IMPORT"], {
  message: "Sync operation must be EXPORT or IMPORT",
});

/**
 * Sync status enum
 */
export const syncStatusSchema = z.enum(
  ["SYNCED", "MODIFIED_LOCAL", "CONFLICT"],
  {
    message: "Sync status must be SYNCED, MODIFIED_LOCAL, or CONFLICT",
  }
);

// ============================================================================
// Auth Schemas
// ============================================================================

/**
 * Registration request validation
 */
export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

/**
 * Login request validation
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

// ============================================================================
// Project Schemas
// ============================================================================

/**
 * Source origin enum
 */
export const sourceOriginSchema = z.enum(["GITLAB", "ZIP"], {
  message: "Source must be GITLAB or ZIP",
});

/**
 * Create project request validation
 */
export const createProjectSchema = z
  .object({
    name: requiredString(200, "Project name is too long"),
    description: optionalString(2000, "Description is too long"),
    maxStatDelta: z.number().int().optional(),
    source: sourceOriginSchema,
  })
  .strict();

/**
 * Update project request validation
 */
export const updateProjectSchema = z
  .object({
    name: nonEmptyStringSchema.max(200, "Project name is too long").optional(),
    description: optionalString(2000, "Description is too long"),
  })
  .strict();

/**
 * Project ID params validation
 */
export const projectIdParamsSchema = z.object({
  projectId: uuidSchema,
});

/**
 * Project files query validation
 */
export const projectFilesQuerySchema = z.object({
  source: sourceOriginSchema.optional(),
});

export type ProjectFilesQuery = z.infer<typeof projectFilesQuerySchema>;

/**
 * Layout mode validation — accepts the values emitted by the frontend
 * segmented control. Rejects unknown values.
 */
export const flowLayoutModeSchema = z.enum(["FLOW", "ROUTE", "FILE"]);

/**
 * Flow graph query validation
 */
export const flowGraphQuerySchema = z.object({
  projectId: uuidSchema,
});

export type FlowGraphQuery = z.infer<typeof flowGraphQuerySchema>;

/**
 * Flow graph layout query validation
 *
 * Used by GET and DELETE on /flow-graph/layout, which both need a
 * project + mode to scope the operation.
 */
export const flowGraphLayoutQuerySchema = z.object({
  projectId: uuidSchema,
  mode: flowLayoutModeSchema,
});

export type FlowGraphLayoutQuery = z.infer<typeof flowGraphLayoutQuerySchema>;

/**
 * Flow graph layout position schema
 */
const nodePositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

/**
 * Save flow graph layout request validation
 */
export const saveFlowGraphLayoutSchema = z
  .object({
    projectId: uuidSchema,
    mode: flowLayoutModeSchema,
    positions: z.record(z.string().uuid(), nodePositionSchema),
  })
  .strict();

export type SaveFlowGraphLayoutInput = z.infer<
  typeof saveFlowGraphLayoutSchema
>;

/**
 * File ID params validation
 */
export const fileIdParamsSchema = z.object({
  fileId: uuidSchema,
});

export type FileIdParams = z.infer<typeof fileIdParamsSchema>;

/**
 * Update file content request validation
 */
export const updateFileContentSchema = z
  .object({
    content: z.string().max(10_000_000, "File content too large (max 10MB)"),
    expectedContentHash: expectedContentHashSchema,
  })
  .strict();

export type UpdateFileContentInput = z.infer<typeof updateFileContentSchema>;

// ============================================================================
// Label Schemas
// ============================================================================

/**
 * List labels query validation
 */
export const listLabelsQuerySchema = z.object({
  projectId: uuidSchema,
  routeKey: routeConfigKeySchema.optional(),
  status: labelStatusSchema.optional(),
  groupType: z.string().optional(),
  groupValue: z.string().optional(),
});

/**
 * Label ID params validation
 */
export const labelIdParamsSchema = z.object({
  labelId: uuidSchema,
});

/**
 * Create label request validation
 */
export const createLabelSchema = z
  .object({
    projectId: uuidSchema,
    route: routeConfigKeySchema.optional(),
    groupType: optionalString(50),
    groupValue: optionalString(50),
    labelNumber: z.number().int().min(1).max(999).optional(),
    sequenceOrder: z.number().int().min(0).optional(),
    status: labelStatusSchema.optional(),
    visibility: labelVisibilitySchema.optional(),
    title: z.string().trim().min(1, "Title is required").max(255),
    projectFileId: uuidSchema,
    afterLabelId: uuidSchema.optional().nullable(),
  })
  .strict();

/**
 * Update label request validation
 */
export const updateLabelSchema = z
  .object({
    route: routeConfigKeySchema.optional().nullable(),
    status: labelStatusSchema.optional(),
    title: z.string().trim().min(1, "Title is required").max(255).optional(),
    visibility: labelVisibilitySchema.optional(),
    labelName: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .regex(
        /^[a-zA-Z_][a-zA-Z0-9_]*$/,
        "Label name must start with a letter or underscore and contain only letters, numbers, and underscores"
      )
      .nullable()
      .optional(),
    conditions: z
      .object({
        stats: z.record(z.string(), z.number().finite()).optional(),
        variables: z
          .record(
            z.string(),
            z.object({
              value: z.union([z.string(), z.boolean()]),
              operator: z.enum(["==", "!=", "truthy", "falsy"]),
            })
          )
          .optional(),
      })
      .optional()
      .nullable(),
  })
  .strict()
  .partial();

/**
 * Update label dialogue request validation
 */
const menuOptionSchema = z.object({
  label: z.string().min(1, "Choice label cannot be empty"),
  targetLabelId: z.string().uuid(),
  targetLabelName: z.string(),
  conditionFlags: z.array(z.string()).optional(),
  effects: z.object({ stats: z.record(z.string(), z.number()) }).optional(),
});

const menuBlockSchema = z.object({
  lineId: z.string().uuid(),
  menuOptions: z.array(menuOptionSchema),
});

export const updateLabelDialogueBodySchema = z
  .object({
    dialogue: z.array(
      z.object({
        speakerId: z.string().uuid().nullable(),
        text: z.string().min(1, "Dialogue text cannot be empty"),
      })
    ),
    menuBlocks: z.array(menuBlockSchema).optional(),
    expectedVersion: z.number().int().min(1).optional(),
    expectedContentHash: expectedContentHashSchema,
  })
  .refine(
    (data) =>
      (data.dialogue?.length ?? 0) > 0 || (data.menuBlocks?.length ?? 0) > 0,
    {
      message: "At least one dialogue entry or menu block is required",
    }
  );

// ============================================================================
// Route Configuration Schemas
// ============================================================================

/**
 * Create route configuration request validation
 */
export const createRouteConfigSchema = z
  .object({
    routeKey: routeConfigKeySchema,
    routeName: requiredString(200, "Route name is too long"),
    jumpPrefix: z
      .string()
      .min(1, "Jump prefix is required")
      .max(50, "Jump prefix is too long")
      .regex(
        JUMP_PREFIX_REGEX,
        "Jump prefix must contain only letters, numbers, underscores, and hyphens"
      ),
    sortOrder: z.number().int().min(0).max(9999).optional(),
    isShared: z.boolean().optional(),
  })
  .strict();

/**
 * Update route configuration request validation
 */
export const updateRouteConfigSchema = z
  .object({
    routeName: requiredString(200, "Route name is too long").optional(),
    jumpPrefix: z
      .string()
      .min(1, "Jump prefix is required")
      .max(50, "Jump prefix is too long")
      .regex(
        JUMP_PREFIX_REGEX,
        "Jump prefix must contain only letters, numbers, underscores, and hyphens"
      )
      .optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
    isShared: z.boolean().optional(),
  })
  .strict();

/**
 * Route configuration ID params validation
 */
export const routeConfigIdParamsSchema = z.object({
  routeConfigId: uuidSchema,
});

/**
 * Route configuration with project ID params validation
 */
export const routeConfigProjectIdParamsSchema = z.object({
  projectId: uuidSchema,
});

// ============================================================================
// Variable Schemas
// ============================================================================

/**
 * Variable key validation schema
 * Validates variable key format (alphanumeric, underscores, hyphens)
 */
export const variableKeySchema = z
  .string()
  .min(1, "Variable key is required")
  .max(50, "Variable key is too long")
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "Variable key must contain only letters, numbers, underscores, and hyphens"
  );

/**
 * Create variable request validation
 */
export const createVariableSchema = z
  .object({
    key: variableKeySchema,
    description: optionalString(500, "Description is too long"),
    category: optionalString(50, "Category is too long"),
  })
  .strict();

/**
 * Update variable request validation
 */
export const updateVariableSchema = z
  .object({
    description: optionalString(500, "Description is too long"),
    category: optionalString(50, "Category is too long"),
  })
  .strict();

/**
 * Variable ID params validation
 */
export const variableIdParamsSchema = z.object({
  variableId: uuidSchema,
});

// ============================================================================
// Stat Validation Schemas
// ============================================================================

/**
 * Stat key validation schema
 * Keys must start with lowercase letter, contain only [a-z0-9_]
 */
export const statKeySchema = z
  .string()
  .min(1, "Stat key is required")
  .max(100, "Stat key is too long")
  .regex(
    /^[a-z][a-z0-9_]*$/,
    "Stat key must start with a letter and contain only lowercase letters, numbers, and underscores"
  );

/**
 * Create stat request validation
 */
export const createStatSchema = z
  .object({
    key: statKeySchema,
    name: requiredString(200, "Name is too long"),
    characterId: uuidSchema.optional().nullable(),
    minValue: z.number().int().default(0),
    maxValue: z.number().int().default(100),
    description: optionalString(500, "Description is too long"),
  })
  .strict()
  .refine((data) => data.minValue <= data.maxValue, {
    message: "Minimum value must be less than or equal to maximum value",
    path: ["minValue"],
  });

/**
 * Update stat request validation
 */
export const updateStatSchema = z
  .object({
    name: requiredString(200, "Name is too long"),
    characterId: uuidSchema.nullable(),
    minValue: z.number().int(),
    maxValue: z.number().int(),
    description: optionalString(500, "Description is too long"),
  })
  .strict()
  .partial()
  .refine(
    (data) => {
      if (data.minValue !== undefined && data.maxValue !== undefined) {
        return data.minValue <= data.maxValue;
      }
      return true;
    },
    {
      message: "Minimum value must be less than or equal to maximum value",
      path: ["minValue"],
    }
  );

/**
 * Stat ID params validation
 */
export const statIdParamsSchema = z.object({
  statId: uuidSchema,
});

// Type exports
export type CreateStatInput = z.infer<typeof createStatSchema>;
export type UpdateStatInput = z.infer<typeof updateStatSchema>;

// ============================================================================
// Character Schemas
// ============================================================================

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
 * Detected character from RPY file
 */
export const detectedCharacterSchema = z.object({
  tag: renpyTagSchema,
  name: z.string().nullable().optional(),
  displayName: z.string().min(1, "Display name is required").max(200),
  nameType: z
    .enum([
      "literal",
      "variable",
      "interpolated",
      "tagged",
      "none",
      "empty",
      "unknown",
    ])
    .default("literal"),
  color: colorHexSchema,
  isSpecial: z.boolean().default(false),
  sourceFile: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

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
    isLoveInterest: z.boolean().default(false).optional(),
    dialogueStyle: optionalString(100),
    conditionalPrefix: optionalString(50),
  })
  .strict();

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
    dialogueStyle: optionalString(100),
    conditionalPrefix: optionalString(50),
  })
  .strict()
  .partial();

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
          routeAffiliation: optionalString(50),
        })
      )
      .min(1, "At least one character is required"),
    excludedTags: z.array(renpyTagSchema).default([]),
    linkToLines: z.boolean().default(true),
  })
  .strict();

/**
 * Project settings validation
 */
export const projectSettingsSchema = z
  .object({
    excludedCharacterTags: z.array(renpyTagSchema).default([]),
    autoLinkSpeakers: z.boolean().default(true),
  })
  .strict()
  .partial();

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
      // Empty string is the default value (see
      // VISUAL_SYSTEM_CONFIG_DEFAULTS) and the clearing sentinel; the
      // service stores it as-is since the column is NOT NULL and the
      // shared `VisualSystemConfig` type declares the field as required.
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

// ============================================================================
// GitLab Schemas
// ============================================================================

/**
 * Conflict resolution enum
 */
export const conflictResolutionSchema = z.enum(
  ["branchforge_wins", "gitlab_wins", "manual_review"],
  {
    message:
      "Conflict resolution must be branchforge_wins, gitlab_wins, or manual_review",
  }
);

/**
 * Get the valid conflict resolution values
 * @returns Array of valid conflict resolution values
 */
export function getValidConflictResolutions(): ConflictResolutionValue[] {
  return ["branchforge_wins", "gitlab_wins", "manual_review"];
}

/**
 * Check if a value is a valid conflict resolution
 * @param value - The value to check
 * @returns true if the value is a valid conflict resolution
 */
export function isValidConflictResolution(
  value: unknown
): value is ConflictResolutionValue {
  return (
    typeof value === "string" &&
    getValidConflictResolutions().includes(value as ConflictResolutionValue)
  );
}

/**
 * GitLab URL validation (with SSRF protection)
 *
 * The `isPrivateOrLocalHostname` helper (imported from
 * ./ip-validation.js) uses ipaddr.js to correctly block all of
 * 172.16.0.0/12, 100.64.0.0/10, IPv6 link-local, IPv4-mapped IPv6,
 * etc. — the prior substring-based filter missed most of these.
 */
export const gitlabUrlSchema = z
  .string()
  .url("Invalid URL format")
  .refine(
    (url) => {
      try {
        const parsed = new URL(url);
        return !isPrivateOrLocalHostname(parsed.hostname);
      } catch {
        return false;
      }
    },
    { message: "Private/local URLs are not allowed" }
  )
  .refine(
    (url) => {
      const parsed = new URL(url);
      const isHttps = parsed.protocol === "https:";
      const isAllowedHost = isAllowedGitlabHost(parsed.hostname);
      return isHttps && isAllowedHost;
    },
    {
      message: "Only HTTPS URLs to gitlab.com or GitLab instances are allowed",
    }
  );

/**
 * GitLab integration request validation
 */
export const createGitLabIntegrationSchema = z
  .object({
    projectId: uuidSchema,
    gitlabUrl: gitlabUrlSchema,
    accessToken: nonEmptyStringSchema
      .min(20, "Access token is too short")
      .max(100),
    branchName: z
      .string()
      .min(1, "Branch name is required")
      .max(255, "Branch name is too long")
      .regex(/^[a-zA-Z0-9_/$.-]+$/, "Branch name contains invalid characters")
      .refine(
        (name) =>
          !name.startsWith("-") &&
          !name.startsWith("/") &&
          !name.endsWith("/") &&
          !name.includes(".."),
        "Branch name cannot start with '-' or '/', end with '/', or contain '..'"
      ),
  })
  .strict();

/**
 * Import project request validation
 */
export const importProjectSchema = z
  .object({
    projectName: requiredString(200, "Project name is too long"),
    projectDescription: optionalString(2000, "Project description is too long"),
    gitlabProjectId: z
      .number()
      .int()
      .positive("GitLab project ID must be positive"),
    gitlabProjectName: requiredString(500, "GitLab project name is too long"),
    branch: z
      .string()
      .min(1, "Branch is required")
      .max(255, "Branch name is too long")
      .regex(/^[a-zA-Z0-9_/$.-]+$/, "Branch name contains invalid characters")
      .refine(
        (name) =>
          !name.startsWith("-") &&
          !name.startsWith("/") &&
          !name.endsWith("/") &&
          !name.includes(".."),
        "Branch name cannot start with '-' or '/', end with '/', or contain '..'"
      ),
    conflictResolution: conflictResolutionSchema,
  })
  .strict();

/**
 * GitLab file content update request validation (Script Mode editing)
 * Mirrors updateFileContentSchema but without expectedContentHash, because
 * the GitLab sync path tracks conflicts via a separate in-flight mechanism
 * (see updateGitLabFileContent service).
 */
export const updateGitLabFileContentSchema = z
  .object({
    content: z
      .string()
      .min(1, "File content is required")
      .max(10_000_000, "File content too large (max 10MB)"),
  })
  .strict();

export type UpdateGitLabFileContentInput = z.infer<
  typeof updateGitLabFileContentSchema
>;

/**
 * GitLab export request validation
 */
export const exportToGitlabSchema = z
  .object({
    projectId: uuidSchema,
    branch: z
      .string()
      .min(1, "Branch is required")
      .max(255, "Branch name is too long")
      .regex(/^[a-zA-Z0-9_/$.-]+$/, "Branch name contains invalid characters")
      .refine(
        (name) =>
          !name.startsWith("-") &&
          !name.startsWith("/") &&
          !name.endsWith("/") &&
          !name.includes(".."),
        "Branch name cannot start with '-' or '/', end with '/', or contain '..'"
      )
      .optional(),
    commitMessage: z
      .string()
      .min(1, "Commit message is required")
      .max(500, "Commit message is too long"),
  })
  .strict();

export type ExportToGitlabInput = z.infer<typeof exportToGitlabSchema>;

// ============================================================================
// Additional GitLab Schemas (Wave 2 — VULN-003)
// ============================================================================

/**
 * Shared branch-name validation. Mirrors the rules in
 * createGitLabIntegrationSchema.branchName: only the characters
 * /^[a-zA-Z0-9_/$.-]+$/, no leading `-` or `/`, no trailing `/`, no `..`.
 */
const gitBranchNameSchema = z
  .string()
  .min(1, "Branch is required")
  .max(255, "Branch name is too long")
  .regex(/^[a-zA-Z0-9_/$.-]+$/, "Branch name contains invalid characters")
  .refine(
    (name) =>
      !name.startsWith("-") &&
      !name.startsWith("/") &&
      !name.endsWith("/") &&
      !name.includes(".."),
    "Branch name cannot start with '-' or '/', end with '/', or contain '..'"
  );

/** Validate a GitLab token + optional URL. Reuse for /gitlab/validate and /gitlab/integration. */
export const validateGitlabTokenSchema = z
  .object({
    token: nonEmptyStringSchema.min(20, "Access token is too short").max(100),
    gitlabUrl: gitlabUrlSchema.optional(),
  })
  .strict();

export type ValidateGitlabTokenInput = z.infer<
  typeof validateGitlabTokenSchema
>;

/** GET /gitlab/files/:projectId query: branch required. */
export const gitLabFileListQuerySchema = z
  .object({
    branch: gitBranchNameSchema,
  })
  .strict();

export type GitLabFileListQuery = z.infer<typeof gitLabFileListQuerySchema>;

/** POST /gitlab/link body. */
export const linkRepositorySchema = z
  .object({
    projectId: uuidSchema,
    gitlabProjectId: z
      .number()
      .int()
      .positive("GitLab project ID must be positive"),
    branch: gitBranchNameSchema.optional(),
  })
  .strict();

export type LinkRepositoryInput = z.infer<typeof linkRepositorySchema>;

/** POST /gitlab/import body. */
export const importFromGitlabSchema = z
  .object({
    projectId: uuidSchema,
    branch: gitBranchNameSchema,
    conflictResolution: conflictResolutionSchema,
  })
  .strict();

export type ImportFromGitlabInput = z.infer<typeof importFromGitlabSchema>;

/** POST /gitlab/detect-conflicts body. */
export const detectConflictsSchema = z
  .object({
    projectId: uuidSchema,
    branch: gitBranchNameSchema,
  })
  .strict();

export type DetectConflictsInput = z.infer<typeof detectConflictsSchema>;

/** GET /gitlab/operations/:operationId params. */
export const operationIdParamsSchema = z
  .object({
    operationId: uuidSchema,
  })
  .strict();

export type OperationIdParams = z.infer<typeof operationIdParamsSchema>;

// ============================================================================
// Export/Import Schemas
// ============================================================================

/**
 * Export request validation
 */
export const exportRequestSchema = z.object({
  projectId: uuidSchema,
  labelIds: z
    .array(uuidSchema)
    .min(1, "At least one label is required")
    .max(500),
});

/**
 * Export params validation (projectId in URL params)
 */
export const exportProjectIdParamsSchema = z.object({
  projectId: uuidSchema,
});

/**
 * Export download params validation (projectId + exportId in URL params)
 */
export const exportDownloadParamsSchema = z.object({
  projectId: uuidSchema,
  exportId: uuidSchema,
});

/**
 * Import request validation
 */
export const importRequestSchema = z.object({
  projectId: uuidSchema,
  labelIds: z
    .array(uuidSchema)
    .min(1, "At least one label is required")
    .max(500),
});

// ============================================================================
// Pagination Schemas
// ============================================================================

/**
 * Pagination query validation
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ============================================================================
// Type Exports
// ============================================================================

// Export inferred types for use in route handlers
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type ListLabelsQuery = z.infer<typeof listLabelsQuerySchema>;
export type CreateLabelInput = z.infer<typeof createLabelSchema>;
export type UpdateLabelInput = z.infer<typeof updateLabelSchema>;
export type UpdateLabelDialogueInput = z.infer<
  typeof updateLabelDialogueBodySchema
>;
export type CreateCharacterInput = z.infer<typeof createCharacterSchema>;
export type UpdateCharacterInput = z.infer<typeof updateCharacterSchema>;
export type ImportCharactersInput = z.infer<typeof importCharactersSchema>;
export type ProjectSettingsInput = z.infer<typeof projectSettingsSchema>;
export type VisualSystemConfigInput = z.infer<typeof visualSystemConfigSchema>;
export type DetectedCharacterInput = z.infer<typeof detectedCharacterSchema>;
export type CreateGitLabIntegrationInput = z.infer<
  typeof createGitLabIntegrationSchema
>;
export type ExportRequestInput = z.infer<typeof exportRequestSchema>;
export type ImportRequestInput = z.infer<typeof importRequestSchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type CreateRouteConfigInput = z.infer<typeof createRouteConfigSchema>;
export type UpdateRouteConfigInput = z.infer<typeof updateRouteConfigSchema>;
export type CreateVariableInput = z.infer<typeof createVariableSchema>;
export type UpdateVariableInput = z.infer<typeof updateVariableSchema>;
// ============================================================================
// User Settings Schemas
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
export type ConflictResolutionValue = z.infer<typeof conflictResolutionSchema>;
export type ImportProjectInput = z.infer<typeof importProjectSchema>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validate data synchronously and throw ValidationError if invalid
 * Useful for validating data within services or route handlers
 *
 * @param data - The data to validate
 * @param schema - The Zod schema to validate against
 * @param errorMessage - Optional custom error message
 * @returns The validated and typed data
 * @throws ValidationError if validation fails
 *
 * @example
 * ```ts
 * // In a service function
 * const validatedProject = validateData(input, createProjectSchema, 'Invalid project data');
 * ```
 */
export function validateData<T extends z.ZodTypeAny>(
  data: unknown,
  schema: T,
  errorMessage: string = "Validation failed"
): z.infer<T> {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(errorMessage, {
        issues: error.issues,
      });
    }
    throw new ValidationError(errorMessage, error);
  }
}

// ============================================================================
// Session Schemas
// ============================================================================

/**
 * Session data validation
 * Sanitizes and validates session data with whitelisted keys and size limits
 */
// CSRF double-submit token support: the `csrfToken` key is whitelisted
// here so the session-store Zod schema accepts it. The token itself is
// minted by `generateCsrfToken` in `middleware/csrf.middleware.ts` on
// login and validated globally by `validateCsrfToken` (registered as a
// preValidation hook in `index.ts`). See GitHub issue #206.
export const ALLOWED_SESSION_KEYS = [
  "user",
  "csrfToken", // issued on login, sent back as x-csrf-token on state-changing requests
  "flash",
  "returnTo",
] as const;

/**
 * Allowed primitive value types for session data
 */
const allowedPrimitiveSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

/**
 * Nested session value schema
 * Limits to 50 keys, each key max 100 chars, values must be primitives
 */
const nestedSessionValueSchema = z.record(
  z.string().max(100, "Session key too long"),
  allowedPrimitiveSchema
);

/**
 * Session data schema
 * Validates top-level keys against whitelist, applies size limits
 * Whitelisted keys can have nested objects (with size limits) or primitive values
 */
export const sessionDataSchema = z
  .partialRecord(
    z.enum(ALLOWED_SESSION_KEYS),
    z.union([nestedSessionValueSchema, allowedPrimitiveSchema])
  )
  .refine(
    (data) => {
      for (const value of Object.values(data)) {
        if (
          typeof value === "object" &&
          value !== null &&
          !Array.isArray(value)
        ) {
          const nested = value as Record<string, unknown>;
          if (Object.keys(nested).length > 50) {
            return false;
          }
          for (const nestedKey of Object.keys(nested)) {
            if (nestedKey.length > 100) {
              return false;
            }
          }
        }
      }
      return true;
    },
    { message: "Session validation failed" }
  );

export type SessionData = z.infer<typeof sessionDataSchema>;

/**
 * Safely validate data without throwing
 * Returns a result object with success status and data or error
 *
 * @param data - The data to validate
 * @param schema - The Zod schema to validate against
 * @returns Result object with success status and data/error
 *
 * @example
 * ```ts
 * const result = safeValidateData(input, registerSchema);
 * if (result.success) {
 *   console.log(result.data.email);
 * } else {
 *   console.log(result.error);
 * }
 * ```
 */
export function safeValidateData<T extends z.ZodTypeAny>(
  data: unknown,
  schema: T
): { success: true; data: z.infer<T> } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return { success: false, error: result.error };
}
