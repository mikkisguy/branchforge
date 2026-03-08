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
import { ProjectType, SceneStatus, UserRole } from "@branchforge/shared";

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
    .max(128, "Password is too long"),
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
 * Project type enum
 */
export const projectTypeSchema = z.enum(Object.values(ProjectType), {
  message: "Project type must be ACT_BASED or CHAPTER_BASED",
});

/**
 * User role enum
 */
export const userRoleSchema = z.enum(Object.values(UserRole), {
  message: "Role must be OWNER, READER, or TESTER",
});

/**
 * Scene status enum
 */
export const sceneStatusSchema = z.enum(
  [SceneStatus.DRAFT, SceneStatus.REVIEW, SceneStatus.FINAL],
  {
    message: "Status must be DRAFT, REVIEW, or FINAL",
  },
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
    /^[a-zA-Z0-9_-]+$/,
    "Route key must contain only letters, numbers, underscores, and hyphens",
  );

/**
 * Content type enum
 */
export const contentTypeSchema = z.enum(
  ["NARRATION", "DIALOGUE", "CHOICE", "MENU", "JUMP"],
  {
    message: "Content type must be NARRATION, DIALOGUE, CHOICE, MENU, or JUMP",
  },
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
  },
);

/**
 * Suggestion type enum
 */
export const suggestionTypeSchema = z.enum(
  ["CONSISTENCY", "FLAG_SUGGEST", "METER_SUGGEST", "DIALOGUE_VARIANT"],
  {
    message:
      "Suggestion type must be CONSISTENCY, FLAG_SUGGEST, METER_SUGGEST, or DIALOGUE_VARIANT",
  },
);

/**
 * Suggestion status enum
 */
export const suggestionStatusSchema = z.enum(
  ["PENDING", "ACCEPTED", "REJECTED"],
  {
    message: "Suggestion status must be PENDING, ACCEPTED, or REJECTED",
  },
);

/**
 * Character role enum
 */
export const characterRoleSchema = z.enum(
  ["PRIMARY", "SECONDARY", "BACKGROUND", "MENTIONED"],
  {
    message:
      "Character role must be PRIMARY, SECONDARY, BACKGROUND, or MENTIONED",
  },
);

/**
 * Scene visibility enum
 */
export const sceneVisibilitySchema = z.enum(
  ["EXCLUSIVE", "SHARED", "DUO_PAIR"],
  {
    message: "Scene visibility must be EXCLUSIVE, SHARED, or DUO_PAIR",
  },
);

/**
 * Sync operation enum
 */
export const syncOperationSchema = z.enum(["export", "import"], {
  message: "Sync operation must be export or import",
});

/**
 * Sync status enum
 */
export const syncStatusSchema = z.enum(
  ["pending", "in_progress", "completed", "failed"],
  {
    message: "Sync status must be pending, in_progress, completed, or failed",
  },
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
    type: projectTypeSchema,
    description: optionalString(2000, "Description is too long"),
    routeLockChapter: z.number().int().optional(),
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
  id: uuidSchema,
});

// ============================================================================
// Scene Schemas
// ============================================================================

/**
 * List scenes query validation
 */
export const listScenesQuerySchema = z.object({
  projectId: uuidSchema,
  routeKey: routeConfigKeySchema.optional(),
  status: sceneStatusSchema.optional(),
  act: intStringSchema,
  chapter: intStringSchema,
});

/**
 * Scene ID params validation
 */
export const sceneIdParamsSchema = z.object({
  sceneId: uuidSchema,
});

/**
 * Create scene request validation
 */
export const createSceneSchema = z
  .object({
    projectId: uuidSchema,
    routeKey: routeConfigKeySchema.optional(),
    act: z.number().int().min(1).max(99).optional(),
    scene: z.number().int().min(1).max(999).optional(),
    chapter: z.number().int().min(1).max(99).optional(),
    sequenceOrder: z.number().int().min(1).optional(),
    status: sceneStatusSchema.optional(),
    visibility: sceneVisibilitySchema.optional(),
    title: optionalString(200),
    summary: optionalString(5000),
  })
  .strict();

/**
 * Update scene request validation
 */
export const updateSceneSchema = z
  .object({
    status: sceneStatusSchema.optional(),
    title: optionalString(200),
    summary: optionalString(5000),
  })
  .strict()
  .partial();

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
        /^[a-zA-Z0-9_-]+$/,
        "Jump prefix must contain only letters, numbers, underscores, and hyphens",
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
        /^[a-zA-Z0-9_-]+$/,
        "Jump prefix must contain only letters, numbers, underscores, and hyphens",
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
// Character Schemas
// ============================================================================

/**
 * Create character request validation
 */
export const createCharacterSchema = z
  .object({
    projectId: uuidSchema,
    name: requiredString(200, "Name is too long"),
    alias: optionalString(100),
    description: optionalString(5000),
  })
  .strict();

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
    { message: "Private/local URLs are not allowed" },
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
    },
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
      .regex(/^[a-zA-Z0-9-_\/]+$/, "Branch name contains invalid characters"),
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
  sceneIds: z
    .array(uuidSchema)
    .min(1, "At least one scene is required")
    .max(500),
});

/**
 * Import request validation
 */
export const importRequestSchema = z.object({
  projectId: uuidSchema,
  sceneIds: z
    .array(uuidSchema)
    .min(1, "At least one scene is required")
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
export type ListScenesQuery = z.infer<typeof listScenesQuerySchema>;
export type CreateSceneInput = z.infer<typeof createSceneSchema>;
export type UpdateSceneInput = z.infer<typeof updateSceneSchema>;
export type CreateCharacterInput = z.infer<typeof createCharacterSchema>;
export type CreateGitLabIntegrationInput = z.infer<
  typeof createGitLabIntegrationSchema
>;
export type ExportRequestInput = z.infer<typeof exportRequestSchema>;
export type ImportRequestInput = z.infer<typeof importRequestSchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type CreateRouteConfigInput = z.infer<typeof createRouteConfigSchema>;
export type UpdateRouteConfigInput = z.infer<typeof updateRouteConfigSchema>;

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
  errorMessage: string = "Validation failed",
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
  schema: T,
): { success: true; data: z.infer<T> } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return { success: false, error: result.error };
}

