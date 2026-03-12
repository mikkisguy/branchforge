/**
 * State Variables Service
 *
 * Handles state variable CRUD operations for projects.
 * State variables are boolean state variables used in conditional branching.
 */

import { getDb } from "../db/index.js";
import { stateVariables, projects } from "../db/schema/index.js";
import { eq, and, asc } from "drizzle-orm";
import type { StateVariable, NewStateVariable } from "../db/schema/index.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../middleware/error-handler.middleware.js";

// ============================================================================
// Public Types
// ============================================================================

/**
 * Public state variable information
 */
export interface PublicStateVariable {
  id: string;
  projectId: string;
  key: string;
  description: string | null;
  category: string | null;
  createdAt: Date;
}

/**
 * Create state variable request body
 */
export interface CreateStateVariableBody {
  key: string;
  description?: string;
  category?: string;
}

/**
 * Update state variable request body
 */
export interface UpdateStateVariableBody {
  key?: string;
  description?: string;
  category?: string;
}

// ============================================================================
// Service Functions
// ============================================================================

/**
 * List all state variables for a project
 * @param projectId - The project ID to fetch state variables for
 * @param userId - The user ID making the request (for authorization)
 * @returns Array of public state variables
 */
export async function listStateVariables(
  projectId: string,
  userId: string
): Promise<PublicStateVariable[]> {
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

  // Fetch state variables
  const result = await db
    .select()
    .from(stateVariables)
    .where(eq(stateVariables.projectId, projectId))
    .orderBy(asc(stateVariables.category), asc(stateVariables.key));

  return result.map(mapToPublicStateVariable);
}

/**
 * Get a single state variable by ID
 * @param stateVariableId - The state variable ID to fetch
 * @param userId - The user ID making the request (for authorization)
 * @returns The state variable if found and accessible, null otherwise
 */
export async function getStateVariable(
  stateVariableId: string,
  userId: string
): Promise<PublicStateVariable | null> {
  const db = getDb();

  const result = await db
    .select({
      stateVariable: stateVariables,
    })
    .from(stateVariables)
    .innerJoin(projects, eq(stateVariables.projectId, projects.id))
    .where(and(eq(stateVariables.id, stateVariableId), eq(projects.userId, userId)))
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  return mapToPublicStateVariable(result[0].stateVariable);
}

/**
 * Create a new state variable
 * @param userId - The user ID creating the state variable
 * @param projectId - The project ID to create the state variable for
 * @param body - The state variable data
 * @returns The created state variable
 */
export async function createStateVariable(
  userId: string,
  projectId: string,
  body: CreateStateVariableBody
): Promise<PublicStateVariable> {
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

  const newStateVariable: NewStateVariable = {
    projectId,
    key: body.key,
    description: body.description ?? null,
    category: body.category ?? null,
  };

  try {
    const result = await db
      .insert(stateVariables)
      .values(newStateVariable)
      .returning();

    if (!result || result.length === 0 || !result[0]) {
      throw new Error(
        "Failed to create state variable: database insert returned no rows"
      );
    }

    return mapToPublicStateVariable(result[0]);
  } catch (err) {
    // Handle unique constraint violation (PostgreSQL error code 23505)
    if (err instanceof Error && "code" in err && err.code === "23505") {
      throw new ConflictError("State variable key already exists for this project");
    }
    throw err;
  }
}

/**
 * Update an existing state variable
 * @param stateVariableId - The state variable ID to update
 * @param userId - The user ID making the request (for authorization)
 * @param body - The state variable data to update
 * @returns The updated state variable
 */
export async function updateStateVariable(
  stateVariableId: string,
  userId: string,
  body: UpdateStateVariableBody
): Promise<PublicStateVariable> {
  const db = getDb();

  // Verify user has access to the state variable
  const accessCheck = await db
    .select({
      stateVariable: stateVariables,
    })
    .from(stateVariables)
    .innerJoin(projects, eq(stateVariables.projectId, projects.id))
    .where(and(eq(stateVariables.id, stateVariableId), eq(projects.userId, userId)))
    .limit(1);

  if (accessCheck.length === 0) {
    throw new NotFoundError("State Variable");
  }

  try {
    // Build update payload with only allowed fields
    const updateData: {
      key?: string;
      description?: string | null;
      category?: string | null;
    } = {};

    if (body.key !== undefined) updateData.key = body.key;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.category !== undefined) updateData.category = body.category;

    // Guard against empty update payload
    if (Object.keys(updateData).length === 0) {
      throw new ValidationError(
        "No valid fields provided for update"
      );
    }

    // Update the state variable
    const result = await db
      .update(stateVariables)
      .set(updateData)
      .where(eq(stateVariables.id, stateVariableId))
      .returning();

    if (!result || result.length === 0 || !result[0]) {
      throw new Error(
        "Failed to update state variable: database update returned no rows"
      );
    }

    return mapToPublicStateVariable(result[0]);
  } catch (err) {
    // Handle unique constraint violation (PostgreSQL error code 23505)
    if (err instanceof Error && "code" in err && err.code === "23505") {
      throw new ConflictError("State variable key already exists for this project");
    }
    throw err;
  }
}

/**
 * Delete a state variable
 * @param stateVariableId - The state variable ID to delete
 * @param userId - The user ID making the request (for authorization)
 * @returns True if deleted successfully
 */
export async function deleteStateVariable(
  stateVariableId: string,
  userId: string
): Promise<boolean> {
  const db = getDb();

  // Verify user has access to the state variable
  const accessCheck = await db
    .select({ id: stateVariables.id })
    .from(stateVariables)
    .innerJoin(projects, eq(stateVariables.projectId, projects.id))
    .where(and(eq(stateVariables.id, stateVariableId), eq(projects.userId, userId)))
    .limit(1);

  if (accessCheck.length === 0) {
    throw new NotFoundError("State Variable");
  }

  // Delete the state variable
  const result = await db
    .delete(stateVariables)
    .where(eq(stateVariables.id, stateVariableId))
    .returning();

  return result.length > 0;
}

/**
 * Map a StateVariable to PublicStateVariable
 */
function mapToPublicStateVariable(
  stateVariable: StateVariable
): PublicStateVariable {
  return {
    id: stateVariable.id,
    projectId: stateVariable.projectId,
    key: stateVariable.key,
    description: stateVariable.description,
    category: stateVariable.category,
    createdAt: stateVariable.createdAt,
  };
}
