/**
 * Project Validation Schemas
 *
 * Request validation for project, file, and flow-graph operations.
 */

import { z } from "zod";
import {
  uuidSchema,
  requiredString,
  nonEmptyStringSchema,
  optionalString,
  expectedContentHashSchema,
  FILE_CONTENT_MAX_SIZE,
} from "./common.js";
import { sourceOriginSchema } from "./enums.js";

/**
 * Create project request validation
 */
export const createProjectSchema = z
  .object({
    name: requiredString(200, "Project name is too long"),
    description: optionalString(2000, "Description is too long"),
    maxStatDelta: z.number().int().min(0).max(1000).optional(),
    source: sourceOriginSchema,
  })
  .strict();

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

/**
 * Update project request validation
 */
export const updateProjectSchema = z
  .object({
    name: nonEmptyStringSchema.max(200, "Project name is too long").optional(),
    description: optionalString(2000, "Description is too long"),
    duoEndingEnabled: z.boolean().optional(),
  })
  .strict();

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

/**
 * Project ID params validation
 */
export const projectIdParamsSchema = z.object({
  projectId: uuidSchema,
});

/**
 * Project files query validation
 */
export const projectFilesQuerySchema = z.object({
  source: sourceOriginSchema.optional(),
});

export type ProjectFilesQuery = z.infer<typeof projectFilesQuerySchema>;

/**
 * Layout mode validation — accepts the values emitted by the frontend
 * segmented control. Rejects unknown values.
 */
export const flowLayoutModeSchema = z.enum(["FLOW", "ROUTE", "FILE"]);

/**
 * Flow graph query validation
 */
export const flowGraphQuerySchema = z.object({
  projectId: uuidSchema,
});

export type FlowGraphQuery = z.infer<typeof flowGraphQuerySchema>;

/**
 * Flow graph layout query validation
 *
 * Used by GET and DELETE on /flow-graph/layout, which both need a
 * project + mode to scope the operation.
 */
export const flowGraphLayoutQuerySchema = z.object({
  projectId: uuidSchema,
  mode: flowLayoutModeSchema,
});

export type FlowGraphLayoutQuery = z.infer<typeof flowGraphLayoutQuerySchema>;

/**
 * Flow graph layout position schema
 */
const nodePositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

/**
 * Save flow graph layout request validation
 */
export const saveFlowGraphLayoutSchema = z
  .object({
    projectId: uuidSchema,
    mode: flowLayoutModeSchema,
    positions: z.record(z.string().uuid(), nodePositionSchema),
  })
  .strict();

export type SaveFlowGraphLayoutInput = z.infer<
  typeof saveFlowGraphLayoutSchema
>;

/**
 * File ID params validation
 */
export const fileIdParamsSchema = z.object({
  fileId: uuidSchema,
});

export type FileIdParams = z.infer<typeof fileIdParamsSchema>;

/**
 * Update file content request validation
 */
export const updateFileContentSchema = z
  .object({
    content: z
      .string()
      .max(FILE_CONTENT_MAX_SIZE, "File content too large (max 10MB)"),
    expectedContentHash: expectedContentHashSchema,
  })
  .strict();

export type UpdateFileContentInput = z.infer<typeof updateFileContentSchema>;
