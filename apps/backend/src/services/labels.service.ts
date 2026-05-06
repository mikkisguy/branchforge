/**
 * Labels Service
 *
 * Handles label management operations including listing labels for a project,
 * getting detailed label information with lines and characters, and
 * authorization checks for label access.
 */

import { getDb } from "../db/index.js";
import {
  labels,
  labelLines,
  characters,
  projects,
  projectUsers,
  routeConfigs,
  projectFiles,
} from "../db/schema/index.js";
import {
  eq,
  and,
  asc,
  or,
  isNull,
  inArray,
  sql,
  type ExtractTablesWithRelations,
} from "drizzle-orm";
import type { Label, LabelLine } from "../db/schema/index.js";
import type { NodePgTransaction } from "drizzle-orm/node-postgres";

// Transaction type that matches what TypeScript infers from db.transaction()
// The schema is inferred as Record<string, unknown> due to TypeScript's limitations
type Transaction = NodePgTransaction<
  Record<string, unknown>,
  ExtractTablesWithRelations<Record<string, unknown>>
>;
import type { PublicLabel } from "@branchforge/shared";
import { LabelStatus, sanitizeLabelName } from "@branchforge/shared";
import { createAuditFields, updateAuditFields } from "../lib/audit.js";
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
} from "../middleware/error-handler.middleware.js";
import { logWarn, LogEventType } from "../lib/logger.js";
import {
  addLabelToRPYContent,
  removeLabelFromRPYContent,
  reorderLabelsInRPYContent,
} from "./rpy-parser.service.js";
import { calculateContentHash } from "../lib/hash.js";

// Re-export PublicLabel from shared for route handlers
export type { PublicLabel };

// ============================================================================
// Constants
// ============================================================================

// Maximum attempts to find a unique label name before falling back to timestamp/UUID
const MAX_LABEL_ATTEMPTS = 1000;

// ============================================================================
// Derived Character Query
// ============================================================================

/**
 * Get characters that appear in a label (derived from dialogue speakers)
 *
 * This function automatically derives character appearances from label_lines.speakerId,
 * ensuring the data is always in sync with actual dialogue content.
 *
 * @param labelId - The label ID
 * @returns Array of characters who speak in this label
 */
async function getDerivedCharactersForLabel(
  labelId: string
): Promise<LabelCharacterWithInfo[]> {
  const db = getDb();

  // Query to get all characters who speak in this label
  // Use selectDistinct to ensure unique rows at the database level
  const result = await db
    .selectDistinct({
      id: characters.id,
      name: characters.name,
      displayName: characters.displayName,
      renpyTag: characters.renpyTag,
    })
    .from(characters)
    .innerJoin(labelLines, eq(labelLines.speakerId, characters.id))
    .where(and(eq(labelLines.labelId, labelId), isNull(labelLines.deletedAt)));

  // Result is already unique and correctly typed
  return result as LabelCharacterWithInfo[];
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract the basename from a file path
 * @param filePath - Full file path (e.g., "labels/act_i.rpy" or "labels/chapter1/scene_01.rpy")
 * @returns Basename of the file (e.g., "act_i.rpy" or "scene_01.rpy") or null if filePath is null
 */
function extractFileName(filePath: string): string {
  const parts = filePath.split("/");
  return parts[parts.length - 1] || filePath;
}

/**
 * Resync label positions for all labels in a file
 * Ensures positions are sequential starting from 0
 *
 * @param tx - Database transaction or connection
 * @param projectFileId - The project file ID
 */
async function resyncLabelPositions(
  tx: Transaction,
  projectFileId: string
): Promise<void> {
  const fileLabels = await tx
    .select()
    .from(labels)
    .where(
      and(eq(labels.projectFileId, projectFileId), isNull(labels.deletedAt))
    )
    .orderBy(asc(labels.labelPosition));

  // Sort labels: those with same position maintain their relative order
  // but when multiple labels have position 0 (newly inserted at beginning),
  // the newest one (most recent createdAt) should come first
  fileLabels.sort((a: Label, b: Label) => {
    if (a.labelPosition !== b.labelPosition) {
      return (a.labelPosition ?? 0) - (b.labelPosition ?? 0);
    }
    // Same position: newer labels come first
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // Batch update all label positions in a single query using parameterized VALUES
  // This avoids N round-trips to the database and prevents SQL injection
  if (fileLabels.length > 0) {
    // Create a parameterized VALUES list with explicit type casting
    const valuesList = sql.join(
      fileLabels.map(
        (label: Label, i: number) => sql`(${label.id}::uuid, ${i}::integer)`
      ),
      sql`, `
    );

    await tx.execute(
      sql`UPDATE labels
          SET "label_position" = new_positions.position
          FROM (VALUES ${valuesList}) AS new_positions(id, position)
          WHERE labels.id = new_positions.id`
    );
  }
}

// ============================================================================
// Type Guards for Enum Values
// ============================================================================

/**
 * Type guard to check if a value is a valid label status
 */
export function isValidLabelStatus(
  value: string | null | undefined
): value is LabelStatus {
  const validStatuses: LabelStatus[] = [
    LabelStatus.DRAFT,
    LabelStatus.REVIEW,
    LabelStatus.FINAL,
  ];
  return (
    value !== null &&
    value !== undefined &&
    validStatuses.includes(value as LabelStatus)
  );
}

// ============================================================================
// Public Types
// ============================================================================

/**
 * Label line with speaker information
 */
export interface LabelLineWithSpeaker extends Omit<
  LabelLine,
  "speakerId" | "createdAt" | "updatedAt"
> {
  speakerId: string | null;
  speakerName: string | null; // From characters.displayName
  speakerTag: string | null; // From characters.renpyTag
  // Explicitly type enum fields to preserve literal types
  contentType: "DIALOGUE" | "NARRATION" | "CHOICE" | "MENU" | "JUMP";
  visualType: "GENERATED" | "BLACK" | "CUSTOM";
  // Date fields as ISO strings for JSON serialization
  createdAt: string;
  updatedAt: string;
}

/**
 * Character in a label (derived from label_lines.speakerId)
 */
export interface LabelCharacterWithInfo {
  id: string;
  name: string;
  displayName: string;
  renpyTag: string;
}

/**
 * Detailed label information with lines and characters
 */
export interface LabelDetail extends PublicLabel {
  lines: LabelLineWithSpeaker[];
  characters: LabelCharacterWithInfo[];
}

/**
 * Label fields needed for PublicLabel mapping
 */
type LabelForPublic = Pick<
  Label,
  | "id"
  | "projectId"
  | "title"
  | "groupType" // was: act
  | "groupValue" // was: chapter
  | "labelNumber"
  | "sequenceOrder"
  | "route"
  | "status"
  | "visibility"
  | "version"
  | "contentHash"
  | "projectFileId"
  | "createdAt"
  | "updatedAt"
> & {
  // filePath from INNER JOIN with project_files
  filePath: string;
};

/**
 * List labels request filters
 */
export interface ListLabelsFilters {
  routeKey?: string;
  status?: LabelStatus;
}

// ============================================================================
// Service Functions
// ============================================================================

/**
 * List all labels for a project
 * @param projectId - The project ID to fetch labels for
 * @param userId - The user ID making the request (for authorization)
 * @param filters - Optional filters for route and status
 * @returns Array of public labels
 */
export async function listLabels(
  projectId: string,
  userId: string,
  filters?: ListLabelsFilters
): Promise<PublicLabel[]> {
  const db = getDb();

  // Verify user has access to the project in a single query
  // A row exists if the project exists AND (user is owner OR user has shared access)
  const accessCheck = await db
    .select({ projectId: projects.id })
    .from(projects)
    .leftJoin(projectUsers, eq(projectUsers.projectId, projects.id))
    .where(
      and(
        eq(projects.id, projectId),
        or(eq(projects.userId, userId), eq(projectUsers.userId, userId))
      )
    )
    .limit(1);

  // No row means project doesn't exist or user has no access
  if (accessCheck.length === 0) {
    return [];
  }

  // Build where conditions for filters
  const whereConditions = [
    eq(labels.projectId, projectId),
    isNull(labels.deletedAt), // Exclude soft-deleted labels
  ];

  if (filters?.routeKey) {
    whereConditions.push(eq(labels.route, filters.routeKey));
  }

  if (filters?.status) {
    // Use type guard to ensure type safety
    if (isValidLabelStatus(filters.status)) {
      whereConditions.push(eq(labels.status, filters.status));
    }
  }

  // Fetch labels with all conditions ANDed together
  const result = await db
    .select({
      // All label fields
      id: labels.id,
      projectId: labels.projectId,
      title: labels.title,
      groupType: labels.groupType,
      groupValue: labels.groupValue,
      labelNumber: labels.labelNumber,
      sequenceOrder: labels.sequenceOrder,
      route: labels.route,
      status: labels.status,
      visibility: labels.visibility,
      version: labels.version,
      contentHash: labels.contentHash,
      projectFileId: labels.projectFileId,
      createdAt: labels.createdAt,
      updatedAt: labels.updatedAt,
      // File data from LEFT JOIN
      filePath: projectFiles.filePath,
    })
    .from(labels)
    .innerJoin(projectFiles, eq(labels.projectFileId, projectFiles.id))
    .where(and(...whereConditions))
    .orderBy(asc(labels.sequenceOrder), asc(labels.labelNumber));

  return result.map((row) => mapToPublicLabel(row));
}

/**
 * Get a single label by ID with full details
 * @param labelId - The label ID to fetch
 * @param userId - The user ID making the request (for authorization)
 * @returns The label detail with lines and characters if found and accessible, null otherwise
 */
export async function getLabel(
  labelId: string,
  userId: string
): Promise<LabelDetail | null> {
  const db = getDb();

  // Get the label and verify user has access in a single query
  // A row exists if the label's project exists AND (user is owner OR user has shared access)
  const labelResult = await db
    .select({
      label: labels,
      filePath: projectFiles.filePath,
    })
    .from(labels)
    .innerJoin(projects, eq(labels.projectId, projects.id))
    .leftJoin(projectUsers, eq(projectUsers.projectId, projects.id))
    .innerJoin(projectFiles, eq(labels.projectFileId, projectFiles.id))
    .where(
      and(
        eq(labels.id, labelId),
        isNull(labels.deletedAt), // Exclude soft-deleted labels
        or(eq(projects.userId, userId), eq(projectUsers.userId, userId))
      )
    )
    .limit(1);

  if (labelResult.length === 0) {
    return null;
  }

  const { label, filePath } = labelResult[0];

  // Fetch label lines with speaker information (excluding soft-deleted)
  const linesResult = await db
    .select({
      line: labelLines,
      speakerName: characters.displayName,
      speakerTag: characters.renpyTag,
    })
    .from(labelLines)
    .leftJoin(characters, eq(labelLines.speakerId, characters.id))
    .where(and(eq(labelLines.labelId, labelId), isNull(labelLines.deletedAt)))
    .orderBy(asc(labelLines.sequence));

  // Map results to the expected format
  const lines: LabelLineWithSpeaker[] = linesResult.map((row) => ({
    ...row.line,
    speakerName: row.speakerName ?? null,
    speakerTag: row.speakerTag ?? null,
    createdAt: row.line.createdAt.toISOString(),
    updatedAt: row.line.updatedAt.toISOString(),
  }));

  // Derive characters using the shared helper function
  const labelCharactersWithInfo = await getDerivedCharactersForLabel(labelId);

  return {
    ...mapToPublicLabel({ ...label, filePath }),
    lines,
    characters: labelCharactersWithInfo,
  };
}

/**
 * Check if a user has access to a label via its project
 * @param labelId - The label ID to check access for
 * @param userId - The user ID to check
 * @returns True if the user has access, false otherwise
 */
export async function authorizeLabelAccess(
  labelId: string,
  userId: string
): Promise<boolean> {
  const db = getDb();

  // Get the label with its project owner
  const labelResult = await db
    .select({
      projectOwnerId: projects.userId,
      projectId: projects.id,
    })
    .from(labels)
    .innerJoin(projects, eq(labels.projectId, projects.id))
    .where(eq(labels.id, labelId))
    .limit(1);

  if (labelResult.length === 0) {
    return false;
  }

  const { projectOwnerId, projectId } = labelResult[0];

  // Check if user is the owner
  if (projectOwnerId === userId) {
    return true;
  }

  // Check if user has access via project_users
  const sharedAccess = await db
    .select()
    .from(projectUsers)
    .where(
      and(
        eq(projectUsers.projectId, projectId),
        eq(projectUsers.userId, userId)
      )
    )
    .limit(1);

  return sharedAccess.length > 0;
}

/**
 * Map a Label to PublicLabel (already excludes sensitive data)
 * @param label - The label data (with filePath from JOIN)
 */
function mapToPublicLabel(label: LabelForPublic): PublicLabel {
  return {
    id: label.id,
    projectId: label.projectId,
    title: label.title,
    groupType: label.groupType ?? null,
    groupValue: label.groupValue ?? null,
    labelNumber: label.labelNumber,
    sequenceOrder: label.sequenceOrder,
    routeKey: label.route ?? null,
    status: isValidLabelStatus(label.status) ? label.status : null,
    visibility: label.visibility,
    version: label.version,
    contentHash: label.contentHash,
    projectFileId: label.projectFileId,
    fileName: extractFileName(label.filePath),
    createdAt: label.createdAt.toISOString(),
    updatedAt: label.updatedAt.toISOString(),
  };
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Validate that a route exists in route_configs for the given project
 * @param projectId - The project ID to check routes for
 * @param routeKey - The route key to validate
 * @returns True if the route exists, false otherwise
 */
async function validateRouteExists(
  projectId: string,
  routeKey: string
): Promise<boolean> {
  const db = getDb();
  const route = await db
    .select({ id: routeConfigs.id })
    .from(routeConfigs)
    .where(
      and(
        eq(routeConfigs.projectId, projectId),
        eq(routeConfigs.routeKey, routeKey)
      )
    )
    .limit(1);
  return route.length > 0;
}

/**
 * Create a new label
 * @param userId - The ID of the user creating the label
 * @param data - The label data to create
 * @returns The created label
 * @throws NotFoundError if project not found or user lacks access
 * @throws ForbiddenError if user lacks permission
 */
export async function createLabel(
  userId: string,
  data: {
    projectId: string;
    title: string;
    route?: string | null;
    groupType?: string | null;
    groupValue?: string | null;
    labelNumber: number;
    sequenceOrder?: number;
    status?: LabelStatus | null;
    visibility?: "EXCLUSIVE" | "SHARED" | "DUO_PAIR" | null;
    projectFileId: string;
    afterLabelId?: string | null;
  }
): Promise<PublicLabel> {
  const db = getDb();

  return await db.transaction(async (tx) => {
    // Verify user has access to the project
    const [project] = await tx
      .select({ userId: projects.userId })
      .from(projects)
      .where(eq(projects.id, data.projectId))
      .limit(1);

    if (!project) {
      throw new NotFoundError("Project");
    }

    if (project.userId !== userId) {
      throw new ForbiddenError("Insufficient permissions");
    }

    // Validate route exists in route_configs for this project
    // If route is provided but doesn't exist, coerce to null
    let validatedRoute = data.route ?? null;
    if (validatedRoute !== null) {
      const routeExists = await validateRouteExists(
        data.projectId,
        validatedRoute
      );
      if (!routeExists) {
        // Coerce to null if route doesn't exist
        logWarn(LogEventType.VALIDATION_WARNING, {
          event: "invalid_route_configuration",
          route: validatedRoute,
          projectId: data.projectId,
        });
        validatedRoute = null;
      }
    }

    // Validate projectFileId and fetch filePath in a single query to avoid extra round-trip
    let afterLabelName = null;
    let afterLabelPosition: number | null = null;
    const validProjectFileId = data.projectFileId;

    if (
      !validProjectFileId ||
      typeof validProjectFileId !== "string" ||
      !validProjectFileId.trim()
    ) {
      throw new ValidationError("projectFileId is required");
    }

    const [projectFile] = await tx
      .select({
        id: projectFiles.id,
        filePath: projectFiles.filePath,
        projectId: projectFiles.projectId,
        content: projectFiles.content,
      })
      .from(projectFiles)
      .where(eq(projectFiles.id, validProjectFileId))
      .for("update")
      .limit(1);

    if (!projectFile) {
      throw new NotFoundError("ProjectFile");
    }

    if (projectFile.projectId !== data.projectId) {
      throw new ForbiddenError(
        "Project file does not belong to the specified project"
      );
    }

    const filePath = projectFile.filePath;
    const rpyContent = projectFile.content;

    // Validate afterLabelId if provided
    if (data.afterLabelId) {
      const [afterLabel] = await tx
        .select({
          id: labels.id,
          labelName: labels.labelName,
          projectFileId: labels.projectFileId,
          labelPosition: labels.labelPosition,
        })
        .from(labels)
        .where(and(eq(labels.id, data.afterLabelId), isNull(labels.deletedAt)))
        .limit(1);

      if (!afterLabel) {
        throw new NotFoundError("Label");
      }

      if (afterLabel.projectFileId !== validProjectFileId) {
        throw new ValidationError("afterLabelId must be in the same file");
      }

      if (!afterLabel.labelName) {
        throw new ValidationError(
          "afterLabelId must refer to a label with a file-backed name"
        );
      }

      afterLabelName = afterLabel.labelName;
      afterLabelPosition = afterLabel.labelPosition;
    }

    // Generate labelName
    let labelName = sanitizeLabelName(data.title);
    let finalTitle = data.title;

    // Check for collisions in the same file
    const existingLabels = await tx
      .select()
      .from(labels)
      .where(
        and(
          eq(labels.projectFileId, validProjectFileId),
          isNull(labels.deletedAt)
        )
      );

    // Check for name collisions (with or without counter suffix)
    const baseLabelName = labelName;
    let counter = 2;
    let hasCollision = existingLabels.some((l) => l.labelName === labelName);

    let attempts = 0;
    while (hasCollision) {
      if (attempts >= MAX_LABEL_ATTEMPTS) {
        // Fallback to timestamp-based unique suffix to avoid infinite loop
        const timestampSuffix = Date.now().toString(36);
        labelName = `${baseLabelName}_${timestampSuffix}`;
        finalTitle = `${data.title}_${timestampSuffix}`;
        logWarn(LogEventType.VALIDATION_WARNING, {
          event: "max_label_name_attempts_exceeded",
          baseLabelName,
          attempts: MAX_LABEL_ATTEMPTS,
          projectId: data.projectId,
          projectFileId: validProjectFileId,
        });
        break;
      }

      const candidateName = `${baseLabelName}_${counter}`;
      if (!existingLabels.some((l) => l.labelName === candidateName)) {
        labelName = candidateName;
        finalTitle = `${data.title}_${counter}`;
        hasCollision = false;
      }
      counter++;
      attempts++;
    }

    // Insert label block into RPY content
    const updatedContent = addLabelToRPYContent(
      rpyContent,
      labelName,
      afterLabelName
    );

    // Determine insertion position: after specified label, or at end of file
    const insertPosition = afterLabelName
      ? (afterLabelPosition ?? 0) + 1
      : existingLabels.length;

    const auditFields = createAuditFields(userId);

    const [label] = await tx
      .insert(labels)
      .values({
        projectId: data.projectId,
        title: finalTitle,
        route: validatedRoute,
        groupType: data.groupType ?? null,
        groupValue: data.groupValue ?? null,
        labelNumber: data.labelNumber,
        sequenceOrder: data.sequenceOrder ?? 0,
        status: data.status ?? "DRAFT",
        visibility: data.visibility ?? "EXCLUSIVE",
        projectFileId: validProjectFileId,
        labelName,
        labelPosition: insertPosition,
        prerequisites: {},
        effects: {},
        ...auditFields,
      })
      .returning();

    // Update project_files.content and contentHash
    await tx
      .update(projectFiles)
      .set({
        content: updatedContent,
        contentHash: calculateContentHash(updatedContent),
      })
      .where(eq(projectFiles.id, validProjectFileId));

    // Resync label positions
    await resyncLabelPositions(tx, validProjectFileId);

    return mapToPublicLabel({ ...label, filePath });
  });
}

/**
 * Update label metadata (title, route, status, visibility)
 * @param labelId - The ID of the label to update
 * @param userId - The ID of the user updating the label
 * @param data - The label data to update
 * @returns The updated label
 * @throws NotFoundError if label not found
 * @throws ForbiddenError if user lacks permission
 */
export async function updateLabel(
  labelId: string,
  userId: string,
  data: {
    title?: string;
    route?: string | null;
    status?: LabelStatus;
    visibility?: "EXCLUSIVE" | "SHARED" | "DUO_PAIR";
  }
): Promise<PublicLabel> {
  const db = getDb();

  // Get label with project owner info and filePath (to avoid extra round-trip)
  const [labelWithProject] = await db
    .select({
      label: labels,
      projectOwnerId: projects.userId,
      filePath: projectFiles.filePath,
    })
    .from(labels)
    .innerJoin(projects, eq(labels.projectId, projects.id))
    .innerJoin(projectFiles, eq(labels.projectFileId, projectFiles.id))
    .where(and(eq(labels.id, labelId), isNull(labels.deletedAt)))
    .limit(1);

  if (!labelWithProject) {
    throw new NotFoundError("Label");
  }

  if (labelWithProject.projectOwnerId !== userId) {
    throw new ForbiddenError("Insufficient permissions");
  }

  // Validate route exists in route_configs for this project
  // If route is provided but doesn't exist, coerce to null
  let validatedRoute = data.route;
  if (validatedRoute !== null && validatedRoute !== undefined) {
    const routeExists = await validateRouteExists(
      labelWithProject.label.projectId,
      validatedRoute
    );
    if (!routeExists) {
      // Coerce to null if route doesn't exist
      logWarn(LogEventType.VALIDATION_WARNING, {
        event: "invalid_route_configuration",
        route: validatedRoute,
        projectId: labelWithProject.label.projectId,
      });
      validatedRoute = null;
    }
  }

  const currentVersion = labelWithProject.label.version ?? 1;
  const auditFields = updateAuditFields(currentVersion, userId);

  // Build update data with validated route
  const updateData = {
    ...data,
    ...(validatedRoute !== undefined ? { route: validatedRoute } : {}),
  };

  const [updated] = await db
    .update(labels)
    .set({
      ...updateData,
      ...auditFields,
    })
    .where(eq(labels.id, labelId))
    .returning();

  return mapToPublicLabel({
    ...updated,
    filePath: labelWithProject.filePath,
  });
}

/**
 * Soft delete a label
 * @param labelId - The ID of the label to delete
 * @param userId - The ID of the user deleting the label
 * @throws NotFoundError if label not found
 * @throws ForbiddenError if user lacks permission
 */
export async function deleteLabel(
  labelId: string,
  userId: string
): Promise<void> {
  const db = getDb();

  // Get label with project owner info and projectFileId
  const [labelWithProject] = await db
    .select({
      label: labels,
      projectOwnerId: projects.userId,
      projectFileContent: projectFiles.content,
      projectFileId: labels.projectFileId,
    })
    .from(labels)
    .innerJoin(projects, eq(labels.projectId, projects.id))
    .leftJoin(projectFiles, eq(labels.projectFileId, projectFiles.id))
    .where(and(eq(labels.id, labelId), isNull(labels.deletedAt)))
    .limit(1);

  if (!labelWithProject) {
    throw new NotFoundError("Label");
  }

  if (labelWithProject.projectOwnerId !== userId) {
    throw new ForbiddenError("Insufficient permissions");
  }

  const labelName = labelWithProject.label.labelName;

  // Soft delete the label and all associated lines in a single transaction
  // This ensures both updates succeed or fail together, preventing
  // inconsistencies where a label is deleted but its lines remain active
  await db.transaction(async (tx) => {
    // Delete the label
    await tx
      .update(labels)
      .set({ deletedAt: new Date() })
      .where(eq(labels.id, labelId));

    // Delete all associated lines
    await tx
      .update(labelLines)
      .set({ deletedAt: new Date() })
      .where(
        and(eq(labelLines.labelId, labelId), isNull(labelLines.deletedAt))
      );

    // If the label has a projectFileId and a valid labelName, rebuild the file content without this label
    // This ensures exports don't re-publish the deleted label.
    // UI-created labels have null labelName and should skip this step since they don't exist in RPY files.
    if (
      labelWithProject.projectFileId &&
      labelWithProject.projectFileContent &&
      labelName !== null
    ) {
      const updatedContent = removeLabelFromRPYContent(
        labelWithProject.projectFileContent,
        labelName
      );

      // Update the project_files.content with the new content (without the deleted label)
      await tx
        .update(projectFiles)
        .set({
          content: updatedContent,
          updatedAt: new Date(),
        })
        .where(eq(projectFiles.id, labelWithProject.projectFileId));
    }
  });
}

/**
 * Reorder labels within a specific file
 * Updates both the RPY file content and label positions in the database
 *
 * @param userId - The ID of the user reordering the labels
 * @param data - The reorder data
 * @returns The updated labels
 * @throws NotFoundError if project file not found
 * @throws ForbiddenError if user lacks permission
 * @throws ValidationError if labels belong to different files
 */
export async function reorderLabelsInFile(
  userId: string,
  data: {
    projectFileId: string;
    labelOrders: Array<{ labelId: string; newPosition: number }>;
  }
): Promise<PublicLabel[]> {
  const db = getDb();

  // Validate input
  if (!data.labelOrders || data.labelOrders.length === 0) {
    throw new ValidationError("At least one label must be reordered");
  }

  return await db.transaction(async (tx) => {
    // Get the project file with row-level lock to prevent concurrent modifications
    const [projectFile] = await tx
      .select({
        id: projectFiles.id,
        content: projectFiles.content,
        projectId: projectFiles.projectId,
        filePath: projectFiles.filePath,
      })
      .from(projectFiles)
      .where(eq(projectFiles.id, data.projectFileId))
      .for("update")
      .limit(1);

    if (!projectFile) {
      throw new NotFoundError("ProjectFile");
    }

    // Verify user owns the project
    const [project] = await tx
      .select({ userId: projects.userId })
      .from(projects)
      .where(eq(projects.id, projectFile.projectId))
      .limit(1);

    if (!project || project.userId !== userId) {
      throw new ForbiddenError("Insufficient permissions");
    }

    // Validate all labels exist and belong to the same file
    const labelIds = data.labelOrders.map((l) => l.labelId);
    const labelsToReorder = await tx
      .select()
      .from(labels)
      .where(and(inArray(labels.id, labelIds), isNull(labels.deletedAt)));

    if (labelsToReorder.length !== labelIds.length) {
      throw new ValidationError("One or more labels not found");
    }

    for (const label of labelsToReorder) {
      if (label.projectFileId !== data.projectFileId) {
        throw new ValidationError("All labels must belong to the same file");
      }
    }

    // Filter out labels without labelName (UI-only labels that aren't in RPY files)
    const labelsWithoutName = labelsToReorder.filter((l) => !l.labelName);
    const validLabelsToReorder = labelsToReorder.filter((l) => l.labelName);

    if (labelsWithoutName.length > 0) {
      const invalidNames = labelsWithoutName.map((l) => l.title).join(", ");
      logWarn(LogEventType.VALIDATION_WARNING, {
        event: "label_reorder_failed_no_file_association",
        invalidNames,
        projectFileId: data.projectFileId,
        labelIds: labelsWithoutName.map((l) => l.id),
      });
      throw new ValidationError("One or more labels cannot be reordered");
    }

    if (validLabelsToReorder.length === 0) {
      throw new ValidationError("At least one valid label must be reordered");
    }

    // Build array of label names in the new order
    const validLabelIds = new Set(validLabelsToReorder.map((l) => l.id));
    const labelMap = new Map(validLabelsToReorder.map((l) => [l.id, l]));
    const newOrder: string[] = [];

    // Only process labels that passed validation
    const validOrders = data.labelOrders.filter((o) =>
      validLabelIds.has(o.labelId)
    );

    const sortedOrders = [...validOrders].sort(
      (a, b) => a.newPosition - b.newPosition
    );

    for (const order of sortedOrders) {
      const label = labelMap.get(order.labelId);
      // labelName is guaranteed to be non-null after validation
      if (label?.labelName) {
        newOrder.push(label.labelName);
      }
    }

    // Reorder labels in RPY content
    const updatedContent = reorderLabelsInRPYContent(
      projectFile.content,
      newOrder
    );

    // Update project_files.content and contentHash
    await tx
      .update(projectFiles)
      .set({
        content: updatedContent,
        contentHash: calculateContentHash(updatedContent),
      })
      .where(eq(projectFiles.id, data.projectFileId));

    // Update label positions for all labels in the file
    const allFileLabels = await tx
      .select()
      .from(labels)
      .where(
        and(
          eq(labels.projectFileId, data.projectFileId),
          isNull(labels.deletedAt)
        )
      )
      .orderBy(asc(labels.labelPosition));

    const reorderedPositionMap = new Map(
      validOrders.map((o) => [o.labelId, o.newPosition])
    );

    // Build new order array
    const newLabelOrder = [...allFileLabels];
    newLabelOrder.sort((a, b) => {
      const aPos = reorderedPositionMap.get(a.id) ?? a.labelPosition ?? 0;
      const bPos = reorderedPositionMap.get(b.id) ?? b.labelPosition ?? 0;
      if (aPos !== bPos) {
        return aPos - bPos;
      }
      // Tie-breaker: prioritize labels being explicitly reordered
      const aIsReordered = reorderedPositionMap.has(a.id);
      const bIsReordered = reorderedPositionMap.has(b.id);
      if (aIsReordered && !bIsReordered) {
        return -1; // a comes first
      }
      if (!aIsReordered && bIsReordered) {
        return 1; // b comes first
      }
      // Both or neither reordered: use original position as tie-breaker
      return (a.labelPosition ?? 0) - (b.labelPosition ?? 0);
    });

    // Update positions in a single batch query using parameterized VALUES
    // Skip labels without labelName since they don't exist in RPY files
    const labelsToUpdate: Array<{ id: string; position: number }> = [];

    for (let i = 0; i < newLabelOrder.length; i++) {
      const label = newLabelOrder[i];
      if (label.labelName === null) {
        continue; // Skip UI-only labels that aren't in RPY files
      }
      labelsToUpdate.push({ id: label.id, position: i });
    }

    if (labelsToUpdate.length > 0) {
      // Create a parameterized VALUES list with explicit type casting
      const valuesList = sql.join(
        labelsToUpdate.map(
          (item) => sql`(${item.id}::uuid, ${item.position}::integer)`
        ),
        sql`, `
      );

      await tx.execute(
        sql`UPDATE labels
            SET "label_position" = new_positions.position,
                "updated_by" = ${userId},
                "updated_at" = NOW()
            FROM (VALUES ${valuesList}) AS new_positions(id, position)
            WHERE labels.id = new_positions.id`
      );
    }

    // Fetch and return updated labels
    const updatedLabels = await tx
      .select()
      .from(labels)
      .where(inArray(labels.id, Array.from(validLabelIds)));

    return updatedLabels.map((l) =>
      mapToPublicLabel({ ...l, filePath: projectFile.filePath })
    );
  });
}

// ============================================================================
// Label-Character Queries
// ============================================================================

/**
 * Get all characters associated with a label
 * @param labelId - The label ID to fetch characters for
 * @param userId - The user ID making the request (for authorization)
 * @returns Array of label characters with their information
 * @throws NotFoundError if label not found
 * @throws ForbiddenError if user lacks permission
 */
export async function getLabelCharacters(
  labelId: string,
  userId: string
): Promise<LabelCharacterWithInfo[]> {
  const db = getDb();

  // Check if user has access to this label (owner or shared via project_users)
  const hasAccess = await authorizeLabelAccess(labelId, userId);

  if (!hasAccess) {
    // Label doesn't exist or user lacks permission
    // Verify label exists to throw appropriate error
    const [label] = await db
      .select()
      .from(labels)
      .where(and(eq(labels.id, labelId), isNull(labels.deletedAt)))
      .limit(1);

    if (!label) {
      throw new NotFoundError("Label");
    }

    throw new ForbiddenError("Insufficient permissions");
  }

  // Return characters derived from dialogue speakers
  return await getDerivedCharactersForLabel(labelId);
}
