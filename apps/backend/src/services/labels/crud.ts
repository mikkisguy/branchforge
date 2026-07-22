/**
 * Labels module - CRUD
 *
 * Create, update, and delete operations for labels.
 */

import { getDb } from "../../db/index.js";
import {
  labels,
  labelLines,
  projects,
  routeConfigs,
  projectFiles,
  stats,
  variables,
  pairGroups,
  userSettings,
} from "../../db/schema/index.js";
import { eq, and, isNull, sql, inArray, ne } from "drizzle-orm";
import { sanitizeLabelName, type StatCondition } from "@branchforge/shared";
import { type LabelStatus } from "@branchforge/shared";
import { RENPY_LABEL_REGEX } from "@branchforge/shared";
import type { PublicLabel } from "@branchforge/shared";
import { createAuditFields, updateAuditFields } from "../../lib/audit.js";
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
} from "../../middleware/error-handler.middleware.js";
import { logWarn, LogEventType } from "../../lib/logger.js";
import { requireProjectOwnership } from "../authz.service.js";
import {
  addLabelToRPYContent,
  removeLabelFromRPYContent,
} from "../rpy-parser.service.js";
import { calculateContentHash } from "../../lib/hash.js";
import { normalizeStatCondition } from "../label-line-mapper.js";
import { mapToPublicLabel } from "./queries.js";
import { resyncLabelPositions } from "./sync.js";
import { MAX_LABEL_ATTEMPTS } from "./types.js";
import type { UpdateLabelInput } from "../../lib/validation.js";

// ============================================================================
// Internal Helpers
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

// ============================================================================
// CRUD Operations
// ============================================================================

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
    labelNumber?: number;
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
    await requireProjectOwnership(data.projectId, userId, tx);

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
    let afterLabelSequenceOrder: number | null = null;
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
          sequenceOrder: labels.sequenceOrder,
          labelNumber: labels.labelNumber,
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
      afterLabelSequenceOrder = afterLabel.sequenceOrder;
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

    // Compute sequenceOrder: use explicit value, place after specified label,
    // or append to the end of the file's labels
    let sequenceOrder: number;
    if (data.sequenceOrder !== undefined) {
      sequenceOrder = data.sequenceOrder;
    } else if (afterLabelSequenceOrder !== null) {
      sequenceOrder = afterLabelSequenceOrder + 1;
    } else {
      const maxSequenceOrder = existingLabels.reduce(
        (max, l) => Math.max(max, l.sequenceOrder ?? 0),
        -1
      );
      sequenceOrder = maxSequenceOrder + 1;
    }

    // Compute labelNumber: use explicit value, derive from afterLabelId,
    // or append to the end
    let labelNumber: number;
    if (data.labelNumber !== undefined) {
      labelNumber = data.labelNumber;
    } else if (afterLabelSequenceOrder !== null) {
      // When inserting after a specific label, find its labelNumber
      // and add 1 to place it immediately after
      const afterLabel = existingLabels.find(
        (l) => l.sequenceOrder === afterLabelSequenceOrder
      );
      labelNumber = (afterLabel?.labelNumber ?? 0) + 1;
    } else {
      const maxLabelNumber = existingLabels.reduce(
        (max, l) => Math.max(max, l.labelNumber ?? 0),
        0
      );
      labelNumber = maxLabelNumber + 1;
    }

    const auditFields = createAuditFields(userId);

    const [label] = await tx
      .insert(labels)
      .values({
        projectId: data.projectId,
        title: finalTitle,
        route: validatedRoute,
        groupType: data.groupType ?? null,
        groupValue: data.groupValue ?? null,
        labelNumber,
        sequenceOrder,
        status: data.status ?? "DRAFT",
        visibility: data.visibility ?? "EXCLUSIVE",
        projectFileId: validProjectFileId,
        labelName,
        labelPosition: insertPosition,
        conditions: {},
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
 * Update label metadata (title, route, status, visibility, labelName)
 *
 * When `labelName` changes, the RPY file content is updated to reflect
 * the new name in the label definition line and the project_file's content
 * hash is recalculated.
 *
 * @param labelId - The ID of the label to update
 * @param userId - The ID of the user updating the label
 * @param data - The label data to update
 * @returns The updated label
 * @throws NotFoundError if label not found
 * @throws ForbiddenError if user lacks permission
 * @throws ValidationError if labelName format is invalid
 * @throws ConflictError if labelName already exists in the file
 */
export async function updateLabel(
  labelId: string,
  userId: string,
  data: UpdateLabelInput,
  expectedVersion?: number
): Promise<PublicLabel> {
  const db = getDb();

  // Wrap the initial DB read, content parsing, and writes in a single
  // transaction to prevent lost updates from concurrent renames.  The
  // FOR UPDATE lock on the project file row serialises renames targeting
  // the same file.
  return await db.transaction(async (tx) => {
    // Get label with project owner info, filePath, and file content
    const [labelWithProject] = await tx
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

    // Acquire a row-level lock on the project file so concurrent renames
    // targeting the same file are serialised and cannot produce lost updates.
    // Also re-read content under the lock to avoid stale reads.
    const [lockedFile] = await tx
      .select({ id: projectFiles.id, content: projectFiles.content })
      .from(projectFiles)
      .where(eq(projectFiles.id, labelWithProject.label.projectFileId))
      .for("update")
      .limit(1);

    // Use content read under the lock for the rename logic
    const fileContent = lockedFile?.content ?? null;

    // Re-select the label with FOR UPDATE after locking the project file
    // to prevent TOCTOU races (e.g. concurrent soft-delete).  Use the
    // refreshed label for all subsequent metadata updates and the result.
    const [lockedLabel] = await tx
      .select()
      .from(labels)
      .where(and(eq(labels.id, labelId), isNull(labels.deletedAt)))
      .for("update")
      .limit(1);

    if (!lockedLabel) {
      throw new NotFoundError("Label");
    }

    // Handle labelName update: validate and update RPY file content
    let updatedContent: string | null = null;
    const oldLabelName = lockedLabel.labelName;

    // Reject null labelName for file-backed labels — persisting null
    // would desync the DB from the file content.
    if (data.labelName === null && oldLabelName) {
      throw new ValidationError(
        "Cannot set labelName to null for file-backed labels"
      );
    }

    if (data.labelName != null && data.labelName !== oldLabelName) {
      // Validate label name format (must match Ren'Py label name rules)
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(data.labelName)) {
        throw new ValidationError(
          "Label name must start with a letter or underscore and contain only letters, numbers, and underscores"
        );
      }

      if (!oldLabelName) {
        throw new ValidationError(
          "Cannot rename a label that has no file-backed label name"
        );
      }

      if (!fileContent) {
        throw new ValidationError(
          "Cannot rename a label in a file with no content"
        );
      }

      // Check uniqueness in the file (case-insensitive, consistent with
      // validateRPYContent which rejects case-variant duplicates at import).
      const [existingInFile] = await tx
        .select({ id: labels.id })
        .from(labels)
        .where(
          and(
            eq(labels.projectFileId, lockedLabel.projectFileId),
            sql`lower(${labels.labelName}) = ${data.labelName.toLowerCase()}`,
            isNull(labels.deletedAt),
            ne(labels.id, labelId)
          )
        )
        .limit(1);

      if (existingInFile) {
        throw new ConflictError(
          `A label named "${data.labelName}" already exists in this file`
        );
      }

      // Replace old label name with new name in the RPY content.
      // We locate the label definition line (e.g. "label start:") and
      // replace only the name portion so indentation and trailing text
      // (like ":") stay intact.
      const lines = fileContent.split("\n");
      let replaced = false;

      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(RENPY_LABEL_REGEX);
        if (match && match[1] === oldLabelName) {
          lines[i] = lines[i].replace(
            new RegExp(
              `^(\\s*label\\s+)${oldLabelName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([\\s(:].*)$`
            ),
            `$1${data.labelName}$2`
          );
          replaced = true;
          break;
        }
      }

      if (!replaced) {
        throw new NotFoundError(
          `Label "${oldLabelName}" not found in file content`
        );
      }

      updatedContent = lines.join("\n");
    }

    // Validate route exists in route_configs for this project and
    // enforce DUO_PAIR visibility requires a non-null duoPairId.
    // Both existence checks are independent reads — run in parallel.
    let validatedRoute = data.route;

    // When the caller touches visibility or duoPairId, enforce
    // consistency: DUO_PAIR requires a non-null pair group id;
    // any other visibility clears the stale pair association.
    const isTouchingPairFields =
      data.visibility !== undefined || data.duoPairId !== undefined;
    const effectiveVisibility = data.visibility ?? lockedLabel.visibility;
    let validatedDuoPairId: string | null | undefined;

    if (isTouchingPairFields) {
      if (effectiveVisibility === "DUO_PAIR") {
        // Distinguish explicit null ("unlink this pair") from
        // undefined ("not provided, keep existing") — ?? would
        // coalesce both and silently preserve a stale pair id.
        validatedDuoPairId =
          data.duoPairId !== undefined ? data.duoPairId : lockedLabel.duoPairId;
        if (validatedDuoPairId == null) {
          throw new ValidationError(
            "duoPairId is required when visibility is DUO_PAIR"
          );
        }
      } else {
        validatedDuoPairId = null; // clear stale pair association
      }
    } else {
      // Caller isn't changing visibility or duoPairId — leave
      // existing duoPairId alone (validated below only if non-null).
      validatedDuoPairId = lockedLabel.duoPairId;
    }

    const [routeResult, pairGroupResult] = await Promise.all([
      validatedRoute !== null && validatedRoute !== undefined
        ? tx
            .select({ id: routeConfigs.id })
            .from(routeConfigs)
            .where(
              and(
                eq(routeConfigs.projectId, lockedLabel.projectId),
                eq(routeConfigs.routeKey, validatedRoute)
              )
            )
            .limit(1)
        : Promise.resolve(null),
      validatedDuoPairId != null
        ? tx
            .select({ id: pairGroups.id })
            .from(pairGroups)
            .where(
              and(
                eq(pairGroups.id, validatedDuoPairId),
                eq(pairGroups.projectId, lockedLabel.projectId)
              )
            )
            .limit(1)
        : Promise.resolve(null),
    ]);

    if (validatedRoute !== null && validatedRoute !== undefined) {
      const routeRows = routeResult as { id: string }[] | null;
      if (!routeRows || routeRows.length === 0) {
        // Coerce to null if route doesn't exist
        logWarn(LogEventType.VALIDATION_WARNING, {
          event: "invalid_route_configuration",
          route: validatedRoute,
          projectId: lockedLabel.projectId,
        });
        validatedRoute = null;
      }
    }

    if (validatedDuoPairId != null) {
      const pairRows = pairGroupResult as { id: string }[] | null;
      if (!pairRows || pairRows.length === 0) {
        throw new ValidationError(
          "Referenced pair group does not exist in this project"
        );
      }
    }

    // Validate condition stat keys and variable keys exist in the
    // project. These two existence checks are independent — run them concurrently.
    const statKeys =
      data.conditions?.stats && Object.keys(data.conditions.stats).length > 0
        ? Object.keys(data.conditions.stats)
        : [];
    const variableKeys =
      data.conditions?.variables &&
      Object.keys(data.conditions.variables).length > 0
        ? Object.keys(data.conditions.variables)
        : [];

    const [existingStats, existingVariables] = await Promise.all([
      statKeys.length > 0
        ? tx
            .select({ key: stats.key })
            .from(stats)
            .where(
              and(
                eq(stats.projectId, lockedLabel.projectId),
                inArray(stats.key, statKeys)
              )
            )
        : ([] as { key: string }[]),
      variableKeys.length > 0
        ? tx
            .select({ key: variables.key })
            .from(variables)
            .where(
              and(
                eq(variables.projectId, lockedLabel.projectId),
                inArray(variables.key, variableKeys)
              )
            )
        : ([] as { key: string }[]),
    ]);

    if (statKeys.length > 0) {
      const existingKeys = new Set(existingStats.map((m) => m.key));
      const invalidKeys = statKeys.filter((k) => !existingKeys.has(k));
      if (invalidKeys.length > 0) {
        throw new ValidationError(
          `Invalid stat key(s): ${invalidKeys.join(", ")}. ` +
            "Referenced stats must exist in the project."
        );
      }
    }

    if (variableKeys.length > 0) {
      const existingKeys = new Set(existingVariables.map((sv) => sv.key));
      const invalidKeys = variableKeys.filter((k) => !existingKeys.has(k));
      if (invalidKeys.length > 0) {
        throw new ValidationError(
          `Invalid variable key(s): ${invalidKeys.join(", ")}. ` +
            "Referenced variables must exist in the project."
        );
      }
    }

    const currentVersion = expectedVersion ?? lockedLabel.version ?? 1;
    const auditFields = updateAuditFields(currentVersion, userId);

    // Build typed update data — exclude `version` (used only for concurrency check)
    // and `conditions` (handled separately with normalization below).
    const { version: _v, conditions: _c, ...labelFields } = data;

    const updateData: Partial<typeof labels.$inferInsert> = {
      ...labelFields,
      ...(validatedRoute !== undefined ? { route: validatedRoute } : {}),
    };

    if (isTouchingPairFields) {
      updateData.duoPairId = validatedDuoPairId as string | null | undefined;
    }
    if (data.conditions !== undefined) {
      const conditions = data.conditions ?? {};
      // Normalize any plain number values to StatCondition objects
      // (handles legacy data where frontend may send plain numbers)
      if (conditions.stats) {
        const normalizedStats: Record<string, StatCondition> = {};
        for (const [key, value] of Object.entries(conditions.stats)) {
          normalizedStats[key] = normalizeStatCondition(
            value as number | StatCondition
          );
        }
        conditions.stats = normalizedStats;
      }
      updateData.conditions =
        conditions as typeof labels.$inferInsert.conditions;
    }

    // Also update project_files content if labelName changed
    if (updatedContent !== null) {
      await tx
        .update(projectFiles)
        .set({
          content: updatedContent,
          contentHash: calculateContentHash(updatedContent),
        })
        .where(eq(projectFiles.id, lockedLabel.projectFileId));
    }

    const [updated] = await tx
      .update(labels)
      .set({
        ...updateData,
        ...auditFields,
        updatedAt: new Date(),
      })
      .where(and(eq(labels.id, labelId), eq(labels.version, currentVersion)))
      .returning();

    if (!updated) {
      throw new ConflictError(
        "Label was modified by another user, please refresh and try again"
      );
    }

    return mapToPublicLabel({
      ...updated,
      filePath: labelWithProject.filePath,
    });
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

  // Read label with project owner info, projectFileId, and labelName
  const [labelWithProject] = await db
    .select({
      label: labels,
      projectOwnerId: projects.userId,
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

  await db.transaction(async (tx) => {
    // Lock the associated projectFiles row FIRST to prevent deadlock with
    // updateLabel, which locks projectFiles → labels.
    let lockedFile: { id: string; content: string } | undefined;
    if (labelWithProject.projectFileId) {
      const [pf] = await tx
        .select({ id: projectFiles.id, content: projectFiles.content })
        .from(projectFiles)
        .where(eq(projectFiles.id, labelWithProject.projectFileId))
        .for("update")
        .limit(1);
      lockedFile = pf;
    }

    // Lock the label row to serialize concurrent operations (e.g. rename)
    // Read labelName and projectFileId under the lock to prevent TOCTOU races
    const [lockedLabel] = await tx
      .select({
        id: labels.id,
        labelName: labels.labelName,
        projectFileId: labels.projectFileId,
      })
      .from(labels)
      .where(and(eq(labels.id, labelId), isNull(labels.deletedAt)))
      .for("update")
      .limit(1);

    if (!lockedLabel) {
      throw new NotFoundError("Label");
    }

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

    // If the label has a projectFileId and a valid labelName, rebuild the file
    // content without this label. Reuse content read under the projectFiles lock
    // (acquired before the labels lock) to avoid a second lock.
    if (lockedFile?.content && lockedLabel.labelName !== null) {
      const updatedContent = removeLabelFromRPYContent(
        lockedFile.content,
        lockedLabel.labelName
      );

      await tx
        .update(projectFiles)
        .set({
          content: updatedContent,
          contentHash: calculateContentHash(updatedContent),
          updatedAt: new Date(),
        })
        .where(eq(projectFiles.id, lockedLabel.projectFileId!));
    }

    // Reindex labelPosition, sequenceOrder, and labelNumber after deletion
    // to prevent later appends from colliding with stale positions.
    await resyncLabelPositions(tx, lockedLabel.projectFileId!);
  });
}

/**
 * Clean up labelWordCounts in userSettings after a label is deleted.
 * This prevents orphaned entries from accumulating over time.
 * Non-critical: the caller should wrap in try/catch and not fail the
 * primary operation if cleanup fails.
 *
 * @param labelId - The ID of the deleted label
 * @param userId - The user ID
 * @param db - Optional database context (defaults to getDb())
 */
export async function cleanupLabelWordCounts(
  labelId: string,
  userId: string,
  db?: ReturnType<typeof getDb>
): Promise<void> {
  const ctx = db ?? getDb();
  await ctx
    .update(userSettings)
    .set({
      labelWordCounts: sql`COALESCE(label_word_counts, '{}'::jsonb) - ${labelId}`,
    })
    .where(eq(userSettings.userId, userId));
}
