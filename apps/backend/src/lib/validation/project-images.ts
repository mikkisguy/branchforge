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
