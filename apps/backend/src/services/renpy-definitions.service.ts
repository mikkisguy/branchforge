/**
 * Ren'Py Definitions Service
 *
 * Handles Ren'Py definition CRUD operations for projects.
 * Ren'Py definitions are static declarations for export to RPY files.
 */

import { getDb } from "../db/index.js";
import { renpyDefinitions, projects } from "../db/schema/index.js";
import { eq, and, asc } from "drizzle-orm";
import type {
  RenpyDefinition,
  NewRenpyDefinition,
} from "../db/schema/index.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../middleware/error-handler.middleware.js";
import { RenpyDefinitionCategory } from "@branchforge/shared";

// ============================================================================
// Public Types
// ============================================================================

/**
 * Public Ren'Py definition information
 */
export interface PublicRenpyDefinition {
  id: string;
  projectId: string;
  category: RenpyDefinitionCategory;
  sortOrder: number;
  tag: string;
  displayName: string;
  definitionCode: string;
  referenceTag: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create Ren'Py definition request body
 */
export interface CreateRenpyDefinitionBody {
  category: RenpyDefinitionCategory;
  tag: string;
  displayName: string;
  definitionCode: string;
  referenceTag?: string | null;
  sortOrder?: number;
}

/**
 * Update Ren'Py definition request body
 */
export interface UpdateRenpyDefinitionBody {
  category?: RenpyDefinitionCategory;
  tag?: string;
  displayName?: string;
  definitionCode?: string;
  referenceTag?: string | null;
  sortOrder?: number;
}

// ============================================================================
// Service Functions
// ============================================================================

/**
 * List all Ren'Py definitions for a project
 * @param projectId - The project ID to fetch Ren'Py definitions for
 * @param userId - The user ID making the request (for authorization)
 * @returns Array of public Ren'Py definitions
 */
export async function listRenpyDefinitions(
  projectId: string,
  userId: string
): Promise<PublicRenpyDefinition[]> {
  const db = getDb();

  // Verify user owns the project
  const projectOwnerCheck = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);

  if (projectOwnerCheck.length === 0) {
    throw new NotFoundError("Project");
  }

  // Fetch Ren'Py definitions ordered by category then sortOrder
  const result = await db
    .select()
    .from(renpyDefinitions)
    .where(eq(renpyDefinitions.projectId, projectId))
    .orderBy(asc(renpyDefinitions.category), asc(renpyDefinitions.sortOrder));

  return result.map(mapToPublicRenpyDefinition);
}

/**
 * Get a single Ren'Py definition by ID
 * @param renpyDefinitionId - The Ren'Py definition ID to fetch
 * @param userId - The user ID making the request (for authorization)
 * @returns The Ren'Py definition if found and accessible, null otherwise
 */
export async function getRenpyDefinition(
  renpyDefinitionId: string,
  userId: string
): Promise<PublicRenpyDefinition | null> {
  const db = getDb();

  const result = await db
    .select({
      renpyDefinition: renpyDefinitions,
    })
    .from(renpyDefinitions)
    .innerJoin(projects, eq(renpyDefinitions.projectId, projects.id))
    .where(
      and(
        eq(renpyDefinitions.id, renpyDefinitionId),
        eq(projects.userId, userId)
      )
    )
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  return mapToPublicRenpyDefinition(result[0].renpyDefinition);
}

/**
 * Create a new Ren'Py definition
 * @param userId - The user ID creating the Ren'Py definition
 * @param projectId - The project ID to create the Ren'Py definition for
 * @param body - The Ren'Py definition data
 * @returns The created Ren'Py definition
 */
export async function createRenpyDefinition(
  userId: string,
  projectId: string,
  body: CreateRenpyDefinitionBody
): Promise<PublicRenpyDefinition> {
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

  const newRenpyDefinition: NewRenpyDefinition = {
    projectId,
    category: body.category,
    tag: body.tag,
    displayName: body.displayName,
    definitionCode: body.definitionCode,
    referenceTag: body.referenceTag ?? null,
    sortOrder: body.sortOrder ?? 0,
  };

  try {
    const result = await db
      .insert(renpyDefinitions)
      .values(newRenpyDefinition)
      .returning();

    if (!result || result.length === 0 || !result[0]) {
      throw new Error(
        "Failed to create Ren'Py definition: database insert returned no rows"
      );
    }

    return mapToPublicRenpyDefinition(result[0]);
  } catch (err) {
    // Handle unique constraint violation (PostgreSQL error code 23505)
    if (err instanceof Error && "code" in err && err.code === "23505") {
      throw new ConflictError(
        "Ren'Py definition tag already exists for this project"
      );
    }
    throw err;
  }
}

/**
 * Update an existing Ren'Py definition
 * @param renpyDefinitionId - The Ren'Py definition ID to update
 * @param userId - The user ID making the request (for authorization)
 * @param body - The Ren'Py definition data to update
 * @returns The updated Ren'Py definition
 */
export async function updateRenpyDefinition(
  renpyDefinitionId: string,
  userId: string,
  body: UpdateRenpyDefinitionBody
): Promise<PublicRenpyDefinition> {
  const db = getDb();

  // Verify user has access to the Ren'Py definition
  const accessCheck = await db
    .select({
      renpyDefinition: renpyDefinitions,
    })
    .from(renpyDefinitions)
    .innerJoin(projects, eq(renpyDefinitions.projectId, projects.id))
    .where(
      and(
        eq(renpyDefinitions.id, renpyDefinitionId),
        eq(projects.userId, userId)
      )
    )
    .limit(1);

  if (accessCheck.length === 0) {
    throw new NotFoundError("Ren'Py Definition");
  }

  try {
    // Build update payload with only allowed fields
    const updateData: {
      category?: RenpyDefinitionCategory;
      tag?: string;
      displayName?: string;
      definitionCode?: string;
      referenceTag?: string | null;
      sortOrder?: number;
      updatedAt?: Date;
    } = { updatedAt: new Date() };

    if (body.category !== undefined) updateData.category = body.category;
    if (body.tag !== undefined) updateData.tag = body.tag;
    if (body.displayName !== undefined)
      updateData.displayName = body.displayName;
    if (body.definitionCode !== undefined)
      updateData.definitionCode = body.definitionCode;
    if (body.referenceTag !== undefined)
      updateData.referenceTag = body.referenceTag;
    if (body.sortOrder !== undefined) updateData.sortOrder = body.sortOrder;

    // Guard against empty update payload
    if (Object.keys(updateData).length <= 1) {
      throw new ValidationError("No valid fields provided for update");
    }

    // Update the Ren'Py definition
    const result = await db
      .update(renpyDefinitions)
      .set(updateData)
      .where(eq(renpyDefinitions.id, renpyDefinitionId))
      .returning();

    if (!result || result.length === 0 || !result[0]) {
      throw new Error(
        "Failed to update Ren'Py definition: database update returned no rows"
      );
    }

    return mapToPublicRenpyDefinition(result[0]);
  } catch (err) {
    // Handle unique constraint violation (PostgreSQL error code 23505)
    if (err instanceof Error && "code" in err && err.code === "23505") {
      throw new ConflictError(
        "Ren'Py definition tag already exists for this project"
      );
    }
    throw err;
  }
}

/**
 * Delete a Ren'Py definition
 * @param renpyDefinitionId - The Ren'Py definition ID to delete
 * @param userId - The user ID making the request (for authorization)
 * @returns True if deleted successfully
 */
export async function deleteRenpyDefinition(
  renpyDefinitionId: string,
  userId: string
): Promise<boolean> {
  const db = getDb();

  // Verify user has access to the Ren'Py definition
  const accessCheck = await db
    .select({ id: renpyDefinitions.id })
    .from(renpyDefinitions)
    .innerJoin(projects, eq(renpyDefinitions.projectId, projects.id))
    .where(
      and(
        eq(renpyDefinitions.id, renpyDefinitionId),
        eq(projects.userId, userId)
      )
    )
    .limit(1);

  if (accessCheck.length === 0) {
    throw new NotFoundError("Ren'Py Definition");
  }

  // Delete the Ren'Py definition
  const result = await db
    .delete(renpyDefinitions)
    .where(eq(renpyDefinitions.id, renpyDefinitionId))
    .returning();

  return result.length > 0;
}

/**
 * Map a RenpyDefinition to PublicRenpyDefinition
 */
function mapToPublicRenpyDefinition(
  renpyDefinition: RenpyDefinition
): PublicRenpyDefinition {
  return {
    id: renpyDefinition.id,
    projectId: renpyDefinition.projectId,
    category: renpyDefinition.category,
    sortOrder: renpyDefinition.sortOrder,
    tag: renpyDefinition.tag,
    displayName: renpyDefinition.displayName,
    definitionCode: renpyDefinition.definitionCode,
    referenceTag: renpyDefinition.referenceTag,
    createdAt: renpyDefinition.createdAt,
    updatedAt: renpyDefinition.updatedAt,
  };
}
