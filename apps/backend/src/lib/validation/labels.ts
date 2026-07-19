/**
 * Label Validation Schemas
 *
 * Request validation for label CRUD and dialogue operations.
 */

import { z } from "zod";
import {
  uuidSchema,
  optionalString,
  expectedContentHashSchema,
} from "./common.js";
import { routeConfigKeySchema } from "./route-configs.js";
import { labelStatusSchema, labelVisibilitySchema } from "./enums.js";

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

export type ListLabelsQuery = z.infer<typeof listLabelsQuerySchema>;

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

export type CreateLabelInput = z.infer<typeof createLabelSchema>;

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
      .max(50)
      .regex(
        /^[a-zA-Z_][a-zA-Z0-9_]*$/,
        "Label name must start with a letter or underscore and contain only letters, numbers, and underscores"
      )
      .nullable()
      .optional(),
    duoPairId: uuidSchema.optional().nullable(),
    conditions: z
      .object({
        stats: z
          .record(
            z.string(),
            z.union([
              z.number().finite(),
              z.object({
                value: z.number().finite(),
                operator: z.enum([">=", "<=", ">", "<", "==", "!="]),
              }),
            ])
          )
          .optional(),
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
    version: z.number().int().positive().optional(),
  })
  .strict()
  .partial();

export type UpdateLabelInput = z.infer<typeof updateLabelSchema>;

/**
 * Update label dialogue request validation
 */
const menuOptionSchema = z.object({
  label: z.string().trim().min(1, "Choice label cannot be empty"),
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
        text: z.string().trim().min(1, "Dialogue text cannot be empty"),
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

export type UpdateLabelDialogueInput = z.infer<
  typeof updateLabelDialogueBodySchema
>;
