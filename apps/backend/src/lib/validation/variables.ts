/**
 * Variable Validation Schemas
 *
 * Request validation for variable CRUD operations.
 */

import { z } from "zod";
import { uuidSchema, optionalString } from "./common.js";

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

export type CreateVariableInput = z.infer<typeof createVariableSchema>;

/**
 * Update variable request validation
 */
export const updateVariableSchema = z
  .object({
    description: optionalString(500, "Description is too long"),
    category: optionalString(50, "Category is too long"),
  })
  .strict();

export type UpdateVariableInput = z.infer<typeof updateVariableSchema>;

/**
 * Variable ID params validation
 */
export const variableIdParamsSchema = z.object({
  variableId: uuidSchema,
});
