/**
 * Export/Import Validation Schemas
 *
 * Request validation for label export/import operations.
 */

import { z } from "zod";
import { uuidSchema } from "./common.js";
import { projectIdParamsSchema } from "./projects.js";

/**
 * Export params validation (projectId in URL params)
 */
export const exportProjectIdParamsSchema = projectIdParamsSchema;

/**
 * Export download params validation (projectId + exportId in URL params)
 */
export const exportDownloadParamsSchema = z.object({
  projectId: uuidSchema,
  exportId: uuidSchema,
});
