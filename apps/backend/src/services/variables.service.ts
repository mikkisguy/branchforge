/**
 * Variables Service
 *
 * Handles variable CRUD operations for projects.
 * Variables are boolean variables used in conditional branching.
 */

import { getDb } from "../db/index.js";
import { projectFiles, variables, projects } from "../db/schema/index.js";
import type { Transaction } from "../db/types.js";
import { eq, and, asc, isNull } from "drizzle-orm";
import type { Variable, NewVariable } from "../db/schema/index.js";
import type { VariableReference } from "@branchforge/shared";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../middleware/error-handler.middleware.js";
import { ensureCharacterSourcePreservation } from "./character-source-preservation.service.js";
import { isUniqueConstraintViolation } from "../lib/db.js";
import { lockProject } from "./project-files-operations.service.js";
import { findVariableReferences } from "./variable-references.js";

export class VariableInUseError extends ConflictError {
  constructor(public readonly references: VariableReference[]) {
    super("Variable is still referenced in project scripts", {
      reason: "VARIABLE_IN_USE",
    });
  }
}

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

  await ensureCharacterSourcePreservation(projectId);

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

async function readVariableReferences(
  variable: Pick<PublicVariable, "projectId" | "key">,
  tx?: Transaction
): Promise<VariableReference[]> {
  const query = (tx ?? getDb())
    .select({
      fileId: projectFiles.id,
      filePath: projectFiles.filePath,
      content: projectFiles.content,
    })
    .from(projectFiles)
    .where(
      and(
        eq(projectFiles.projectId, variable.projectId),
        isNull(projectFiles.deletedAt)
      )
    )
    .orderBy(asc(projectFiles.id));

  // Write Mode can update source while holding only a file lock.
  const files = await (tx ? query.for("update") : query);
  files.sort((a, b) => a.filePath.localeCompare(b.filePath));
  return findVariableReferences(variable.key, files);
}

export async function listVariableReferences(
  variableId: string,
  userId: string
): Promise<VariableReference[]> {
  const variable = await getVariable(variableId, userId);
  if (!variable) throw new NotFoundError("Variable");
  return readVariableReferences(variable);
}

/** Check current source and delete under the same transaction. */
export async function deleteVariable(
  variableId: string,
  userId: string
): Promise<boolean> {
  const target = await getVariable(variableId, userId);
  if (!target) throw new NotFoundError("Variable");

  return getDb().transaction(async (tx) => {
    // Serialize imports and file membership changes before locking active files.
    await lockProject(tx, target.projectId);
    const [variable] = await tx
      .select({ projectId: variables.projectId, key: variables.key })
      .from(variables)
      .innerJoin(projects, eq(variables.projectId, projects.id))
      .where(and(eq(variables.id, variableId), eq(projects.userId, userId)));
    if (!variable) throw new NotFoundError("Variable");

    const references = await readVariableReferences(variable, tx);
    if (references.length > 0) throw new VariableInUseError(references);

    const result = await tx
      .delete(variables)
      .where(eq(variables.id, variableId))
      .returning({ id: variables.id });
    return result.length > 0;
  });
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
