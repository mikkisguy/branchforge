/**
 * Pair Group Validation Schemas
 *
 * Request validation for pair group CRUD operations.
 */

import { z } from "zod";
import { uuidSchema, requiredString } from "./common.js";

/**
 * Create pair group request validation
 */
export const createPairGroupSchema = z
  .object({
    characterAId: uuidSchema,
    characterBId: uuidSchema,
    duoEndingLabel: requiredString(255, "Duo ending label is too long"),
  })
  .strict()
  .refine((data) => data.characterAId !== data.characterBId, {
    message: "Character A and Character B must be different",
    path: ["characterBId"],
  });

export type CreatePairGroupInput = z.infer<typeof createPairGroupSchema>;

/**
 * Update pair group request validation
 */
export const updatePairGroupSchema = z
  .object({
    duoEndingLabel: requiredString(
      255,
      "Duo ending label is too long"
    ).optional(),
  })
  .strict();

export type UpdatePairGroupInput = z.infer<typeof updatePairGroupSchema>;

/**
 * Pair group ID params validation
 */
export const pairGroupIdParamsSchema = z.object({
  pairGroupId: uuidSchema,
});
