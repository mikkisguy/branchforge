/**
 * World Elements Service
 *
 * Handles world element CRUD operations for projects.
 * World elements are world bible entries: locations, items, concepts, events.
 * Authorization is enforced via requireProjectOwnership from authz.service.
 */

import { getDb } from "../db/index.js";
import { worldElements, projects } from "../db/schema/index.js";
import { eq, and, asc } from "drizzle-orm";
import type { WorldElement, NewWorldElement } from "../db/schema/index.js";
import {
  NotFoundError,
  ValidationError,
} from "../middleware/error-handler.middleware.js";
import { requireProjectOwnership } from "./authz.service.js";
import type {
  CreateWorldElementInput,
  UpdateWorldElementInput,
} from "../lib/validation.js";

// ============================================================================
// Public Types
// ============================================================================

export interface PublicWorldElement {
  id: string;
  projectId: string;
  name: string;
  type: "LOCATION" | "ITEM" | "CONCEPT" | "EVENT";
  description: string | null;
  tags: string[];
  createdAt: Date;
}

// ============================================================================
// Service Functions
// ============================================================================

/**
 * List all world elements for a project
 */
export async function listWorldElements(
  projectId: string,
  userId: string
): Promise<PublicWorldElement[]> {
  await requireProjectOwnership(projectId, userId);

  const db = getDb();

  const result = await db
    .select()
    .from(worldElements)
    .where(eq(worldElements.projectId, projectId))
    .orderBy(asc(worldElements.type), asc(worldElements.name));

  return result.map(mapToPublicWorldElement);
}

/**
 * Get a single world element by ID
 */
export async function getWorldElement(
  elementId: string,
  userId: string
): Promise<PublicWorldElement | null> {
  const db = getDb();

  const result = await db
    .select({
      element: worldElements,
    })
    .from(worldElements)
    .innerJoin(projects, eq(worldElements.projectId, projects.id))
    .where(and(eq(worldElements.id, elementId), eq(projects.userId, userId)))
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  return mapToPublicWorldElement(result[0].element);
}

/**
 * Create a new world element
 */
export async function createWorldElement(
  projectId: string,
  userId: string,
  body: CreateWorldElementInput
): Promise<PublicWorldElement> {
  await requireProjectOwnership(projectId, userId);

  const db = getDb();

  const newElement: NewWorldElement = {
    projectId,
    name: body.name,
    type: body.type,
    description: body.description ?? null,
    tags: body.tags ?? [],
  };

  const result = await db.insert(worldElements).values(newElement).returning();

  if (!result || result.length === 0 || !result[0]) {
    throw new Error(
      "Failed to create world element: database insert returned no rows"
    );
  }

  return mapToPublicWorldElement(result[0]);
}

/**
 * Update an existing world element
 */
export async function updateWorldElement(
  elementId: string,
  userId: string,
  body: UpdateWorldElementInput
): Promise<PublicWorldElement> {
  const db = getDb();

  // Verify user has access to the element
  const accessCheck = await db
    .select({
      element: worldElements,
    })
    .from(worldElements)
    .innerJoin(projects, eq(worldElements.projectId, projects.id))
    .where(and(eq(worldElements.id, elementId), eq(projects.userId, userId)))
    .limit(1);

  if (accessCheck.length === 0) {
    throw new NotFoundError("World element");
  }

  // Build update payload with only allowed fields
  const updateData: Record<string, unknown> = {};

  if (body.name !== undefined) updateData.name = body.name;
  if (body.type !== undefined) updateData.type = body.type;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.tags !== undefined) updateData.tags = body.tags;

  // Guard against empty update payload
  if (Object.keys(updateData).length === 0) {
    throw new ValidationError("No valid fields provided for update");
  }

  // Update the element
  const result = await db
    .update(worldElements)
    .set(updateData)
    .where(eq(worldElements.id, elementId))
    .returning();

  if (!result || result.length === 0 || !result[0]) {
    throw new Error(
      "Failed to update world element: database update returned no rows"
    );
  }

  return mapToPublicWorldElement(result[0]);
}

/**
 * Delete a world element
 */
export async function deleteWorldElement(
  elementId: string,
  userId: string
): Promise<boolean> {
  const db = getDb();

  // Verify user has access to the element
  const accessCheck = await db
    .select({ id: worldElements.id })
    .from(worldElements)
    .innerJoin(projects, eq(worldElements.projectId, projects.id))
    .where(and(eq(worldElements.id, elementId), eq(projects.userId, userId)))
    .limit(1);

  if (accessCheck.length === 0) {
    throw new NotFoundError("World element");
  }

  const result = await db
    .delete(worldElements)
    .where(eq(worldElements.id, elementId))
    .returning();

  return result.length > 0;
}

// ============================================================================
// Helpers
// ============================================================================

function mapToPublicWorldElement(element: WorldElement): PublicWorldElement {
  return {
    id: element.id,
    projectId: element.projectId,
    name: element.name,
    type: element.type,
    description: element.description,
    tags: element.tags ?? [],
    createdAt: element.createdAt,
  };
}
