/**
 * Stat Validation Schemas
 *
 * Request validation for stat CRUD operations.
 */

import { z } from "zod";
import { uuidSchema, requiredString, optionalString } from "./common.js";

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

export type CreateStatInput = z.infer<typeof createStatSchema>;

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
  .partial();

export type UpdateStatInput = z.infer<typeof updateStatSchema>;

/**
 * Stat ID params validation
 */
export const statIdParamsSchema = z.object({
  statId: uuidSchema,
});
