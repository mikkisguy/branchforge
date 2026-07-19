/**
 * Common Validation Schemas
 *
 * Shared building blocks used by all domain validation modules.
 */

import { z } from "zod";
import { ValidationError } from "../../middleware/error-handler.middleware.js";

// ============================================================================
// Constants
// ============================================================================

/** Maximum file content size in bytes (10 MB) */
export const FILE_CONTENT_MAX_SIZE = 10_000_000;

// ============================================================================
// Primitive Schemas
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
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password is too long");

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
