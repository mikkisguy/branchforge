/**
 * Route Configurations Service
 *
 * Handles route configuration CRUD operations for projects.
 * Routes are user-defined entities that replace hardcoded route enums.
 */

import { getDb } from "../db/index.js";
import { routeConfigs, projects } from "../db/schema/index.js";
import { eq, and, asc } from "drizzle-orm";
import type { RouteConfig, NewRouteConfig } from "../db/schema/index.js";
import {
  ConflictError,
  NotFoundError,
} from "../middleware/error-handler.middleware.js";

// ============================================================================
// Public Types
// ============================================================================

/**
 * Public route configuration information
 */
export interface PublicRouteConfig {
  id: string;
  projectId: string;
  routeKey: string;
  routeName: string;
  jumpPrefix: string;
  sortOrder: number;
  isShared: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create route configuration request body
 */
export interface CreateRouteConfigBody {
  routeKey: string;
  routeName: string;
  jumpPrefix: string;
  sortOrder?: number;
  isShared?: boolean;
}

/**
 * Update route configuration request body
 */
export interface UpdateRouteConfigBody {
  routeName?: string;
  jumpPrefix?: string;
  sortOrder?: number;
  isShared?: boolean;
}

// ============================================================================
// Service Functions
// ============================================================================

/**
 * List all route configurations for a project
 * @param projectId - The project ID to fetch routes for
 * @param userId - The user ID making the request (for authorization)
 * @returns Array of public route configurations
 */
export async function listRouteConfigs(
  projectId: string,
  userId: string
): Promise<PublicRouteConfig[]> {
  const db = getDb();

  // Verify user owns the project
  const projectOwnerCheck = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);

  if (projectOwnerCheck.length === 0) {
    return [];
  }

  // Fetch route configurations
  const result = await db
    .select()
    .from(routeConfigs)
    .where(eq(routeConfigs.projectId, projectId))
    .orderBy(asc(routeConfigs.sortOrder), asc(routeConfigs.createdAt));

  return result.map(mapToPublicRouteConfig);
}

/**
 * Get a single route configuration by ID
 * @param routeConfigId - The route configuration ID to fetch
 * @param userId - The user ID making the request (for authorization)
 * @returns The route configuration if found and accessible, null otherwise
 */
export async function getRouteConfig(
  routeConfigId: string,
  userId: string
): Promise<PublicRouteConfig | null> {
  const db = getDb();

  const result = await db
    .select({
      routeConfig: routeConfigs,
    })
    .from(routeConfigs)
    .innerJoin(projects, eq(routeConfigs.projectId, projects.id))
    .where(and(eq(routeConfigs.id, routeConfigId), eq(projects.userId, userId)))
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  return mapToPublicRouteConfig(result[0].routeConfig);
}

/**
 * Create a new route configuration
 * @param userId - The user ID creating the route configuration
 * @param projectId - The project ID to create the route for
 * @param body - The route configuration data
 * @returns The created route configuration
 */
export async function createRouteConfig(
  userId: string,
  projectId: string,
  body: CreateRouteConfigBody
): Promise<PublicRouteConfig> {
  const db = getDb();

  // Verify user owns the project
  const projectCheck = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);

  if (projectCheck.length === 0) {
    throw new NotFoundError("Project");
  }

  const newRouteConfig: NewRouteConfig = {
    projectId,
    routeKey: body.routeKey,
    routeName: body.routeName,
    jumpPrefix: body.jumpPrefix,
    sortOrder: body.sortOrder ?? 0,
    isShared: body.isShared ?? false,
  };

  try {
    const result = await db
      .insert(routeConfigs)
      .values(newRouteConfig)
      .returning();

    if (!result || result.length === 0 || !result[0]) {
      throw new Error(
        "Failed to create route configuration: database insert returned no rows"
      );
    }

    return mapToPublicRouteConfig(result[0]);
  } catch (err) {
    // Handle unique constraint violation (PostgreSQL error code 23505)
    if (err instanceof Error && "code" in err && err.code === "23505") {
      throw new ConflictError("Route key already exists for this project");
    }
    throw err;
  }
}

/**
 * Update an existing route configuration
 * @param routeConfigId - The route configuration ID to update
 * @param userId - The user ID making the request (for authorization)
 * @param body - The route configuration data to update
 * @returns The updated route configuration
 */
export async function updateRouteConfig(
  routeConfigId: string,
  userId: string,
  body: UpdateRouteConfigBody
): Promise<PublicRouteConfig> {
  const db = getDb();

  // Verify user has access to the route configuration
  const accessCheck = await db
    .select({
      routeConfig: routeConfigs,
    })
    .from(routeConfigs)
    .innerJoin(projects, eq(routeConfigs.projectId, projects.id))
    .where(and(eq(routeConfigs.id, routeConfigId), eq(projects.userId, userId)))
    .limit(1);

  if (accessCheck.length === 0) {
    throw new NotFoundError("Route configuration");
  }

  try {
    // Build update payload with only allowed fields
    const updateData: {
      routeName?: string;
      jumpPrefix?: string;
      sortOrder?: number;
      isShared?: boolean;
      updatedAt: Date;
    } = { updatedAt: new Date() };

    if (body.routeName !== undefined) updateData.routeName = body.routeName;
    if (body.jumpPrefix !== undefined) updateData.jumpPrefix = body.jumpPrefix;
    if (body.sortOrder !== undefined) updateData.sortOrder = body.sortOrder;
    if (body.isShared !== undefined) updateData.isShared = body.isShared;

    // Update the route configuration
    const result = await db
      .update(routeConfigs)
      .set(updateData)
      .where(eq(routeConfigs.id, routeConfigId))
      .returning();

    if (!result || result.length === 0 || !result[0]) {
      throw new Error(
        "Failed to update route configuration: database update returned no rows"
      );
    }

    return mapToPublicRouteConfig(result[0]);
  } catch (err) {
    // Handle unique constraint violation (PostgreSQL error code 23505)
    if (err instanceof Error && "code" in err && err.code === "23505") {
      throw new ConflictError("Route key already exists for this project");
    }
    throw err;
  }
}

/**
 * Delete a route configuration
 * @param routeConfigId - The route configuration ID to delete
 * @param userId - The user ID making the request (for authorization)
 * @returns True if deleted successfully
 */
export async function deleteRouteConfig(
  routeConfigId: string,
  userId: string
): Promise<boolean> {
  const db = getDb();

  // Verify user has access to the route configuration
  const accessCheck = await db
    .select({ id: routeConfigs.id })
    .from(routeConfigs)
    .innerJoin(projects, eq(routeConfigs.projectId, projects.id))
    .where(and(eq(routeConfigs.id, routeConfigId), eq(projects.userId, userId)))
    .limit(1);

  if (accessCheck.length === 0) {
    throw new NotFoundError("Route configuration");
  }

  // Delete the route configuration
  const result = await db
    .delete(routeConfigs)
    .where(eq(routeConfigs.id, routeConfigId))
    .returning();

  return result.length > 0;
}

/**
 * Map a RouteConfig to PublicRouteConfig
 */
function mapToPublicRouteConfig(routeConfig: RouteConfig): PublicRouteConfig {
  return {
    id: routeConfig.id,
    projectId: routeConfig.projectId,
    routeKey: routeConfig.routeKey,
    routeName: routeConfig.routeName,
    jumpPrefix: routeConfig.jumpPrefix,
    sortOrder: routeConfig.sortOrder,
    isShared: routeConfig.isShared,
    createdAt: routeConfig.createdAt,
    updatedAt: routeConfig.updatedAt,
  };
}
