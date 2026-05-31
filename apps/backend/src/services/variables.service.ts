/**
 * Variables Service
 *
 * Handles variable CRUD operations for projects.
 * Variables are boolean variables used in conditional branching.
 */

import { getDb } from "../db/index.js";
import { variables, projects } from "../db/schema/index.js";
import { eq, and, asc } from "drizzle-orm";
import type { Variable, NewVariable } from "../db/schema/index.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../middleware/error-handler.middleware.js";
import { isUniqueConstraintViolation } from "../lib/db.js";

// ============================================================================
// Public Types
// ============================================================================

/**
 * Public variable information
 */
export interface PublicVariable {
  id: string;
  projectId: string;
  key: string;
  description: string | null;
  category: string | null;
  createdAt: Date;
}

/**
 * Create variable request body
 */
export interface CreateVariableBody {
  key: string;
  description?: string;
  category?: string;
}

/**
 * Update variable request body
 */
export interface UpdateVariableBody {
  description?: string | null;
  category?: string | null;
}

// ============================================================================
// Service Functions
// ============================================================================

/**
 * List all variables for a project
 * @param projectId - The project ID to fetch variables for
 * @param userId - The user ID making the request (for authorization)
 * @returns Array of public variables
 */
export async function listVariables(
  projectId: string,
  userId: string
): Promise<PublicVariable[]> {
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

  // Fetch variables
  const result = await db
    .select()
    .from(variables)
    .where(eq(variables.projectId, projectId))
    .orderBy(asc(variables.category), asc(variables.key));

  return result.map(mapToPublicVariable);
}

/**
 * Get a single variable by ID
 * @param variableId - The variable ID to fetch
 * @param userId - The user ID making the request (for authorization)
 * @returns The variable if found and accessible, null otherwise
 */
export async function getVariable(
  variableId: string,
  userId: string
): Promise<PublicVariable | null> {
  const db = getDb();

  const result = await db
    .select({
      variable: variables,
    })
    .from(variables)
    .innerJoin(projects, eq(variables.projectId, projects.id))
    .where(and(eq(variables.id, variableId), eq(projects.userId, userId)))
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  return mapToPublicVariable(result[0].variable);
}

/**
 * Create a new variable
 * @param userId - The user ID creating the variable
 * @param projectId - The project ID to create the variable for
 * @param body - The variable data
 * @returns The created variable
 */
export async function createVariable(
  userId: string,
  projectId: string,
  body: CreateVariableBody
): Promise<PublicVariable> {
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

  const newVariable: NewVariable = {
    projectId,
    key: body.key,
    description: body.description ?? null,
    category: body.category ?? null,
  };

  try {
    const result = await db.insert(variables).values(newVariable).returning();

    if (!result || result.length === 0 || !result[0]) {
      throw new Error(
        "Failed to create variable: database insert returned no rows"
      );
    }

    return mapToPublicVariable(result[0]);
  } catch (err) {
    // Handle unique constraint violation (PostgreSQL error code 23505)
    if (isUniqueConstraintViolation(err)) {
      throw new ConflictError("Variable key already exists for this project");
    }
    throw err;
  }
}

/**
 * Update an existing variable
 * @param variableId - The variable ID to update
 * @param userId - The user ID making the request (for authorization)
 * @param body - The variable data to update
 * @returns The updated variable
 */
export async function updateVariable(
  variableId: string,
  userId: string,
  body: UpdateVariableBody
): Promise<PublicVariable> {
  const db = getDb();

  // Verify user has access to the variable
  const accessCheck = await db
    .select({
      variable: variables,
    })
    .from(variables)
    .innerJoin(projects, eq(variables.projectId, projects.id))
    .where(and(eq(variables.id, variableId), eq(projects.userId, userId)))
    .limit(1);

  if (accessCheck.length === 0) {
    throw new NotFoundError("Variable");
  }

  try {
    // Build update payload with only allowed fields
    const updateData: {
      description?: string | null;
      category?: string | null;
    } = {};

    if (body.description !== undefined)
      updateData.description = body.description;
    if (body.category !== undefined) updateData.category = body.category;

    // Guard against empty update payload
    if (Object.keys(updateData).length === 0) {
      throw new ValidationError("No valid fields provided for update");
    }

    // Update the variable
    const result = await db
      .update(variables)
      .set(updateData)
      .where(eq(variables.id, variableId))
      .returning();

    if (!result || result.length === 0 || !result[0]) {
      throw new Error(
        "Failed to update variable: database update returned no rows"
      );
    }

    return mapToPublicVariable(result[0]);
  } catch (err) {
    // Handle unique constraint violation (PostgreSQL error code 23505)
    if (isUniqueConstraintViolation(err)) {
      throw new ConflictError("Variable key already exists for this project");
    }
    throw err;
  }
}

/**
 * Delete a variable
 * @param variableId - The variable ID to delete
 * @param userId - The user ID making the request (for authorization)
 * @returns True if deleted successfully
 */
export async function deleteVariable(
  variableId: string,
  userId: string
): Promise<boolean> {
  const db = getDb();

  // Verify user has access to the variable
  const accessCheck = await db
    .select({ id: variables.id })
    .from(variables)
    .innerJoin(projects, eq(variables.projectId, projects.id))
    .where(and(eq(variables.id, variableId), eq(projects.userId, userId)))
    .limit(1);

  if (accessCheck.length === 0) {
    throw new NotFoundError("Variable");
  }

  // Delete the variable
  const result = await db
    .delete(variables)
    .where(eq(variables.id, variableId))
    .returning();

  return result.length > 0;
}

/**
 * Map a Variable to PublicVariable
 */
function mapToPublicVariable(variable: Variable): PublicVariable {
  return {
    id: variable.id,
    projectId: variable.projectId,
    key: variable.key,
    description: variable.description,
    category: variable.category,
    createdAt: variable.createdAt,
  };
}
