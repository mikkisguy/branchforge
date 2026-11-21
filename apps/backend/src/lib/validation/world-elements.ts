/**
 * World Element Validation Schemas
 *
 * Request validation for world element CRUD operations.
 */

import { z } from "zod";
import {
  WORLD_ELEMENT_TAG_MAX_LENGTH,
  WORLD_ELEMENT_MAX_TAGS,
} from "@branchforge/shared";
import { uuidSchema, requiredString } from "./common.js";
import { elementTypeSchema } from "./enums.js";

/**
 * Create world element request validation
 */
export const createWorldElementSchema = z
  .object({
    name: requiredString(200, "Name is too long"),
    type: elementTypeSchema,
    description: z
      .string()
      .trim()
      .max(2000, "Description is too long")
      .nullable()
      .optional(),
    tags: z
      .array(z.string().trim().min(1).max(WORLD_ELEMENT_TAG_MAX_LENGTH))
      .max(
        WORLD_ELEMENT_MAX_TAGS,
        `Maximum ${WORLD_ELEMENT_MAX_TAGS} tags per element`
      )
      .default([]),
  })
  .strict();

export type CreateWorldElementInput = z.infer<typeof createWorldElementSchema>;

/**
 * Update world element request validation
 */
export const updateWorldElementSchema = z
  .object({
    name: requiredString(200, "Name is too long").optional(),
    type: elementTypeSchema.optional(),
    description: z
      .string()
      .trim()
      .max(2000, "Description is too long")
      .nullable()
      .optional(),
    tags: z
      .array(z.string().trim().min(1).max(WORLD_ELEMENT_TAG_MAX_LENGTH))
      .max(
        WORLD_ELEMENT_MAX_TAGS,
        `Maximum ${WORLD_ELEMENT_MAX_TAGS} tags per element`
      )
      .optional(),
  })
  .strict()
  .partial();

export type UpdateWorldElementInput = z.infer<typeof updateWorldElementSchema>;

/**
 * World element ID params validation
 */
export const worldElementIdParamsSchema = z.object({
  elementId: uuidSchema,
});
