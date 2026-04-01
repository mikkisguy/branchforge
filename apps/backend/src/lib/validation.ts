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
import { isIP } from "node:net";
import {
  LabelStatus,
  UserRole,
  ROUTE_KEY_REGEX,
  JUMP_PREFIX_REGEX,
  RenpyDefinitionCategory,
} from "@branchforge/shared";

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
 * Character role enum
 */
export const characterRoleSchema = z.enum(
  ["PRIMARY", "SECONDARY", "BACKGROUND", "MENTIONED"],
  {
    message:
      "Character role must be PRIMARY, SECONDARY, BACKGROUND, or MENTIONED",
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
 * Create project request validation
 */
export const createProjectSchema = z
  .object({
    name: requiredString(200, "Project name is too long"),
    description: optionalString(2000, "Description is too long"),
    maxMeterDelta: z.number().int().optional(),
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
  source: z.enum(["GITLAB", "ZIP"]).optional(),
});

export type ProjectFilesQuery = z.infer<typeof projectFilesQuerySchema>;

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
    labelNumber: z.number().int().min(1).max(999),
    sequenceOrder: z.number().int().min(0).optional(),
    status: labelStatusSchema.optional(),
    visibility: labelVisibilitySchema.optional(),
    title: z.string().trim().min(1, "Title is required").max(255),
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
  })
  .strict()
  .partial();

/**
 * Update label dialogue request validation
 */
export const updateLabelDialogueBodySchema = z
  .object({
    dialogue: z
      .array(
        z.object({
          speakerId: z.string().uuid().nullable(),
          text: z.string().min(1, "Dialogue text cannot be empty"),
        })
      )
      .min(1, "At least one dialogue entry is required"),
  })
  .strict();

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
    routeKey: routeConfigKeySchema.optional(),
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
// State Variable Schemas
// ============================================================================

/**
 * State variable key validation schema
 * Validates state variable key format (alphanumeric, underscores, hyphens)
 */
export const stateVariableKeySchema = z
  .string()
  .min(1, "State variable key is required")
  .max(50, "State variable key is too long")
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "State variable key must contain only letters, numbers, underscores, and hyphens"
  );

/**
 * Create state variable request validation
 */
export const createStateVariableSchema = z
  .object({
    key: stateVariableKeySchema,
    description: optionalString(500, "Description is too long"),
    category: optionalString(50, "Category is too long"),
  })
  .strict();

/**
 * Update state variable request validation
 */
export const updateStateVariableSchema = z
  .object({
    key: stateVariableKeySchema.optional(),
    description: optionalString(500, "Description is too long"),
    category: optionalString(50, "Category is too long"),
  })
  .strict();

/**
 * State variable ID params validation
 */
export const stateVariableIdParamsSchema = z.object({
  stateVariableId: uuidSchema,
});

// ============================================================================
// Ren'Py Definition Schemas
// ============================================================================

/**
 * Ren'Py Definition category enum (matches db enum)
 * Uses values from shared package
 */
export const renpyDefinitionCategorySchema = z.enum(
  Object.values(RenpyDefinitionCategory)
);

/**
 * Tag validation for non-IMAGE categories (single identifier)
 * CHARACTER, TRANSFORM, INIT use simple identifiers like "a", "dissolve"
 */
const renpyDefinitionTagStrictSchema = z
  .string()
  .trim()
  .min(1, "Tag is required")
  .max(100, "Tag is too long")
  .regex(
    /^[a-zA-Z0-9_]+$/,
    "Tag can only contain letters, numbers, and underscores"
  );

/**
 * Tag validation for IMAGE category (allows spaces)
 * IMAGE tags allow space-separated identifiers like "bg cafe"
 */
const renpyDefinitionTagImageSchema = z
  .string()
  .trim()
  .min(1, "Tag is required")
  .max(100, "Tag is too long")
  .regex(
    /^[a-zA-Z0-9_]+(?:[a-zA-Z0-9_ ]*[a-zA-Z0-9_]+)?$/,
    "Tag can only contain letters, numbers, underscores, and spaces (no leading/trailing spaces)"
  );

/**
 * Tag validation (Ren'Py identifier)
 * Category-aware: IMAGE allows spaces for names like "bg cafe"
 * Other categories (CHARACTER, TRANSFORM, INIT) use single identifiers
 */
export const renpyDefinitionTagSchema = z
  .string()
  .trim()
  .min(1, "Tag is required")
  .max(100, "Tag is too long")
  .regex(
    /^[a-zA-Z0-9_]+$/,
    "Tag can only contain letters, numbers, and underscores"
  );

/**
 * Create Ren'Py definition request validation
 * Tag validation is category-aware: IMAGE allows spaces, others don't
 */
export const createRenpyDefinitionSchema = z
  .object({
    category: renpyDefinitionCategorySchema,
    tag: z
      .string()
      .trim()
      .min(1, "Tag is required")
      .max(100, "Tag is too long"),
    displayName: z.string().trim().min(1).max(200, "Display name is too long"),
    definitionCode: z.string().trim().min(1, "Definition code is required"),
    referenceTag: z.string().max(100).nullable().optional(),
    sortOrder: z.number().int().min(0).optional().default(0),
  })
  .strict()
  .superRefine((data, ctx) => {
    // IMAGE category allows spaces (for names like "bg cafe")
    if (data.category === "IMAGE") {
      const imageTagResult = renpyDefinitionTagImageSchema.safeParse(data.tag);
      if (!imageTagResult.success) {
        imageTagResult.error.issues.forEach((issue) => {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["tag"],
            message: issue.message,
          });
        });
      }
    } else {
      // Other categories require strict identifier format (no spaces)
      const strictTagResult = renpyDefinitionTagStrictSchema.safeParse(
        data.tag
      );
      if (!strictTagResult.success) {
        strictTagResult.error.issues.forEach((issue) => {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["tag"],
            message: issue.message,
          });
        });
      }
    }
  });

/**
 * Update Ren'Py definition request validation
 * Tag validation is category-aware when both category and tag are provided
 */
export const updateRenpyDefinitionSchema = z
  .object({
    category: renpyDefinitionCategorySchema.optional(),
    tag: z
      .string()
      .trim()
      .min(1, "Tag is required")
      .max(100, "Tag is too long")
      .optional(),
    displayName: z.string().trim().min(1).max(200).optional(),
    definitionCode: z.string().trim().min(1).optional(),
    referenceTag: z.string().max(100).nullable().optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    // Only validate tag if it's provided
    if (data.tag === undefined) return;

    // If category is also provided, use category-aware validation
    if (data.category !== undefined) {
      if (data.category === "IMAGE") {
        const imageTagResult = renpyDefinitionTagImageSchema.safeParse(
          data.tag
        );
        if (!imageTagResult.success) {
          imageTagResult.error.issues.forEach((issue) => {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["tag"],
              message: issue.message,
            });
          });
        }
      } else {
        const strictTagResult = renpyDefinitionTagStrictSchema.safeParse(
          data.tag
        );
        if (!strictTagResult.success) {
          strictTagResult.error.issues.forEach((issue) => {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["tag"],
              message: issue.message,
            });
          });
        }
      }
    } else {
      // If only tag is provided (no category), use strict validation as safe default
      // The service layer will look up the existing category for full validation
      const strictTagResult = renpyDefinitionTagStrictSchema.safeParse(
        data.tag
      );
      if (!strictTagResult.success) {
        strictTagResult.error.issues.forEach((issue) => {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["tag"],
            message: issue.message,
          });
        });
      }
    }
  });

/**
 * Ren'Py Definition ID params validation
 */
export const renpyDefinitionIdParamsSchema = z.object({
  renpyDefinitionId: uuidSchema,
});

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
 * Character ID params validation
 */
export const characterIdParamsSchema = z.object({
  characterId: uuidSchema,
});

// ============================================================================
// GitLab Schemas
// ============================================================================

/**
 * Check if a hostname is a private/local IP address
 * Uses proper IP parsing to detect numeric IPs and various formats
 */
function isPrivateOrLocalHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();

  // Block localhost and common local patterns
  const blockedPatterns = [
    "localhost",
    "127.",
    "0.0.0.0",
    "169.254.", // IPv4 link-local
    "10.",
    "172.16.",
    "192.168.",
    "::1",
    "::ffff:", // IPv4-mapped IPv6
    "fc00:", // IPv6 ULA prefix
    "fd00:", // IPv6 ULA prefix
  ];
  for (const pattern of blockedPatterns) {
    if (lower.includes(pattern)) return true;
  }

  // Check if hostname is a numeric IP (handles IPv4 and IPv6)
  if (isIP(lower) !== 0) {
    // Reject any numeric IP - only allow named hosts
    return true;
  }

  return false;
}

/**
 * GitLab URL validation (with SSRF protection)
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
      // Require HTTPS AND one of the allowed hostnames
      const isHttps = parsed.protocol === "https:";
      const isAllowedHost =
        parsed.hostname === "gitlab.com" ||
        parsed.hostname.endsWith(".gitlab.io") ||
        parsed.hostname.endsWith(".gitlab.com");
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
      .regex(/^[a-zA-Z0-9-_/]+$/, "Branch name contains invalid characters"),
  })
  .strict();

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
export type DetectedCharacterInput = z.infer<typeof detectedCharacterSchema>;
export type CreateGitLabIntegrationInput = z.infer<
  typeof createGitLabIntegrationSchema
>;
export type ExportRequestInput = z.infer<typeof exportRequestSchema>;
export type ImportRequestInput = z.infer<typeof importRequestSchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type CreateRouteConfigInput = z.infer<typeof createRouteConfigSchema>;
export type UpdateRouteConfigInput = z.infer<typeof updateRouteConfigSchema>;
export type CreateStateVariableInput = z.infer<
  typeof createStateVariableSchema
>;
export type UpdateStateVariableInput = z.infer<
  typeof updateStateVariableSchema
>;
export type CreateRenpyDefinitionInput = z.infer<
  typeof createRenpyDefinitionSchema
>;
export type UpdateRenpyDefinitionInput = z.infer<
  typeof updateRenpyDefinitionSchema
>;

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
    if (error instanceof Error && error.name === "ZodError") {
      throw new ValidationError(errorMessage, error);
    }
    throw new ValidationError(errorMessage, error);
  }
}

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
