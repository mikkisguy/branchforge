/**
 * Project Image Validation Schemas
 */

import { z } from "zod";
import { uuidSchema } from "./common.js";

/**
 * Project image ID params validation
 */
export const projectImageIdParamsSchema = z.object({
  imageId: uuidSchema,
});

export type ProjectImageIdParams = z.infer<typeof projectImageIdParamsSchema>;

/**
 * Multipart plain fields for project image upload/replace.
 * originalFilename is required for upload; normalizedTarget is optional.
 */
export const projectImagePlainFieldsSchema = z.object({
  originalFilename: z.string().trim().min(1, "originalFilename is required"),
  normalizedTarget: z.string().trim().optional(),
});
