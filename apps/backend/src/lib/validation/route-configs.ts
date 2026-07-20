/**
 * Route Configuration Validation Schemas
 *
 * Request validation for route configuration CRUD operations.
 */

import { z } from "zod";
import { ROUTE_KEY_REGEX, JUMP_PREFIX_REGEX } from "@branchforge/shared";
import { uuidSchema, requiredString } from "./common.js";
import { projectIdParamsSchema } from "./projects.js";

/**
 * Route configuration key schema
 * Validates route key format (alphanumeric, underscores, hyphens)
 */
export const routeConfigKeySchema = z
  .string()
  .min(1, "Route key is required")
  .max(50, "Route key is too long")
  .regex(
    ROUTE_KEY_REGEX,
    "Route key must contain only letters, numbers, underscores, and hyphens"
  );

/**
 * Jump prefix schema
 * Validates jump prefix format (alphanumeric, underscores, hyphens)
 */
export const jumpPrefixSchema = z
  .string()
  .trim()
  .min(1, "Jump prefix is required")
  .max(50, "Jump prefix is too long")
  .regex(
    JUMP_PREFIX_REGEX,
    "Jump prefix must contain only letters, numbers, underscores, and hyphens"
  );

/**
 * Create route configuration request validation
 */
export const createRouteConfigSchema = z
  .object({
    routeKey: routeConfigKeySchema,
    routeName: requiredString(200, "Route name is too long"),
    jumpPrefix: jumpPrefixSchema,
    sortOrder: z.number().int().min(0).max(9999).optional(),
    isShared: z.boolean().optional(),
  })
  .strict();

export type CreateRouteConfigInput = z.infer<typeof createRouteConfigSchema>;

/**
 * Update route configuration request validation
 */
export const updateRouteConfigSchema = z
  .object({
    routeName: requiredString(200, "Route name is too long").optional(),
    jumpPrefix: jumpPrefixSchema.optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
    isShared: z.boolean().optional(),
  })
  .strict();

export type UpdateRouteConfigInput = z.infer<typeof updateRouteConfigSchema>;

/**
 * Route configuration ID params validation
 */
export const routeConfigIdParamsSchema = z.object({
  routeConfigId: uuidSchema,
});

/**
 * Route configuration with project ID params validation
 */
export const routeConfigProjectIdParamsSchema = projectIdParamsSchema;
