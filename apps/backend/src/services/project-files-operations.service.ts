/**
 * Project File Operations Service
 *
 * Handles durable structural operations on project files: create recording,
 * rename/move, delete/restore, reverse, project-wide discard, impact
 * analysis, and the pending structural summary.
 *
 * Lock order (EVERY mutation in this file):
 *   1. projects FOR UPDATE
 *   2. relevant project_files FOR UPDATE in deterministic (ID) order
 *   3. labels FOR UPDATE in deterministic (ID) order
 * Never acquired in reverse.
 */

import { getDb } from "../db/index.js";
import {
  projectFiles,
  labels,
  labelLines,
  projectFilePendingOperations,
  projects,
  userSettings,
} from "../db/schema/index.js";
import type { ProjectFile } from "../db/schema/tables/project-files.js";
import type { ProjectFilePendingOperation } from "../db/schema/tables/project-file-operations.js";
import type { LabelWordCounts } from "../db/schema/tables/user-settings.js";
import { eq, and, isNull, inArray, sql, asc, ne } from "drizzle-orm";
import type { Transaction } from "../db/types.js";
import {
  NotFoundError,
  ValidationError,
  ConflictError,
} from "../middleware/error-handler.middleware.js";
import { requireProjectOwnership } from "./authz.service.js";
import { canonicalizeRpyFilePath } from "@branchforge/shared";
import { calculateContentHash } from "../lib/hash.js";
import {
  computeCommonDirectoryPrefix,
  extractAndStripRpySymbols,
} from "./rpy-statements.service.js";
import { parseRPYFileWithLabels } from "./rpy-parser.service.js";
import { logWarn } from "../lib/logger.js";
import type {
  ProjectFileOperation,
  ProjectFileDeleteImpact,
  ProjectFilePendingStructuralSummary,
} from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

type OperationType = "CREATE" | "RENAME" | "DELETE";

type FileWithProject = ProjectFile;

// ============================================================================
// Helpers
// ============================================================================

/**
 * The exactly-three generated file names BranchForge exports/imports.
 * These exact basenames are protected from rename and delete. Arbitrary
 * `branchforge_*.rpy` files are NOT protected.
 */
export const PROTECTED_GENERATED_BASENAMES = new Set([
  "branchforge_variables.rpy",
  "branchforge_stats.rpy",
  "branchforge_definitions.rpy",
]);

function getBasename(filePath: string): string {
  const lastSlash = filePath.lastIndexOf("/");
  return filePath.slice(lastSlash + 1);
}

function isProtectedGeneratedPath(filePath: string): boolean {
  return PROTECTED_GENERATED_BASENAMES.has(getBasename(filePath).toLowerCase());
}

function mapOperation(
  record: ProjectFilePendingOperation
): ProjectFileOperation {
  return {
    id: record.id,
    projectId: record.projectId,
    projectFileId: record.projectFileId,
    operation: record.operation as OperationType,
    remoteBasePath: record.remoteBasePath,
    localPath: record.localPath,
    deletedLabelIds: record.deletedLabelIds ?? [],
    deletedLineIds: record.deletedLineIds ?? [],
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

// ============================================================================
// Ownership / Access
// ============================================================================

async function getFileWithProject(
  fileId: string
): Promise<FileWithProject | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(projectFiles)
    .where(eq(projectFiles.id, fileId))
    .limit(1);
  return row || null;
}

// ============================================================================
// Locking (project -> files (ID order) -> labels (ID order))
// ============================================================================

export async function lockProject(
  tx: Transaction,
  projectId: string
): Promise<void> {
  await tx
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .for("update");
}

export async function lockFilesByIds(
  tx: Transaction,
  fileIds: string[]
): Promise<void> {
  const sorted = [...fileIds].sort();
  if (sorted.length === 0) return;
  await tx
    .select({ id: projectFiles.id })
    .from(projectFiles)
    .where(inArray(projectFiles.id, sorted))
    .orderBy(asc(projectFiles.id))
    .for("update");
}

async function lockLabelsByIds(
  tx: Transaction,
  labelIds: string[]
): Promise<void> {
  const sorted = [...labelIds].sort();
  if (sorted.length === 0) return;
  await tx
    .select({ id: labels.id })
    .from(labels)
    .where(inArray(labels.id, sorted))
    .orderBy(asc(labels.id))
    .for("update");
}

// ============================================================================
// Uniqueness
// ============================================================================

/**
 * Case-insensitive cross-source uniqueness for ACTIVE files within a
 * project. Callers must hold the project row lock so concurrent
 * create/rename/import are serialized. Case-only renames of the same file
 * ID are allowed; every other active collision is rejected.
 */
export async function assertCaseInsensitiveUnique(
  tx: Transaction,
  projectId: string,
  newPath: string,
  excludeFileId?: string
): Promise<void> {
  const duplicate = await tx
    .select({ id: projectFiles.id })
    .from(projectFiles)
    .where(
      and(
        eq(projectFiles.projectId, projectId),
        isNull(projectFiles.deletedAt),
        ...(excludeFileId ? [ne(projectFiles.id, excludeFileId)] : []),
        sql`lower(${projectFiles.filePath}) = ${newPath.toLowerCase()}`
      )
    )
    .limit(1);

  if (duplicate.length > 0) {
    throw new ConflictError("A file with this path already exists");
  }
}

// ============================================================================
// Rename safety guards
// ============================================================================

/**
 * Block renames into or out of the exact reserved generated basenames.
 * Arbitrary branchforge_*.rpy files are not protected.
 */
export function assertGeneratedProtection(
  oldPath: string,
  newPath: string
): void {
  if (isProtectedGeneratedPath(oldPath)) {
    throw new ValidationError(
      "BranchForge-generated files cannot be renamed or moved"
    );
  }
  if (isProtectedGeneratedPath(newPath)) {
    throw new ValidationError(
      "Renaming to a BranchForge-generated file name is not allowed"
    );
  }
}

/**
 * Parse the SAME content with the NEW path and block dangerous
 * STORY/SETTINGS classification changes (e.g. renaming a story file with
 * labels to screens.rpy would re-classify it as SETTINGS and silently
 * delete its labels on the next content save).
 */
export function assertClassificationStable(
  filePath: string,
  newPath: string,
  content: string,
  currentFileType: "STORY" | "SETTINGS",
  hasActiveLabels: boolean
): void {
  if (currentFileType !== "STORY" || !hasActiveLabels) {
    return;
  }
  let reparsedType: "STORY" | "SETTINGS";
  try {
    reparsedType = parseRPYFileWithLabels(content, newPath).fileType;
  } catch {
    reparsedType = "STORY";
  }
  if (reparsedType !== "STORY") {
    throw new ValidationError(
      "Renaming to this path would change the file classification from STORY to SETTINGS and silently delete its labels"
    );
  }
}

/**
 * Prevent a move from changing a non-empty established common generated-file
 * directory prefix (e.g. game/), so generated exports cannot silently
 * relocate outside the Ren'Py game directory.
 */
async function assertDirectoryPrefixStable(
  tx: Transaction,
  projectId: string,
  fileId: string,
  newPath: string
): Promise<void> {
  const activePaths = await tx
    .select({ filePath: projectFiles.filePath })
    .from(projectFiles)
    .where(
      and(eq(projectFiles.projectId, projectId), isNull(projectFiles.deletedAt))
    );

  const paths = activePaths.map((f) => f.filePath);
  const currentPrefix = computeCommonDirectoryPrefix(paths);
  if (currentPrefix === "") {
    return;
  }

  // Identify the moved file's current path by re-reading its locked row.
  const [movedFile] = await tx
    .select({ filePath: projectFiles.filePath })
    .from(projectFiles)
    .where(eq(projectFiles.id, fileId))
    .limit(1);
  const oldPath = movedFile?.filePath ?? "";
  const finalPaths = paths.map((p) => (p === oldPath ? newPath : p));
  const newPrefix = computeCommonDirectoryPrefix(finalPaths);
  if (newPrefix !== currentPrefix) {
    throw new ValidationError(
      "Moving this file would relocate it outside the project's established game directory"
    );
  }
}

// ============================================================================
// Pending operation collapse
// ============================================================================

async function getPendingOperation(
  tx: Transaction,
  projectFileId: string
): Promise<ProjectFilePendingOperation | null> {
  const [row] = await tx
    .select()
    .from(projectFilePendingOperations)
    .where(eq(projectFilePendingOperations.projectFileId, projectFileId))
    .for("update")
    .limit(1);
  return row ?? null;
}

/**
 * Collapse a rename into the file's pending structural row:
 * - no row + GitLab file → new RENAME (remoteBasePath = remote/legacy path)
 * - pending CREATE → stays CREATE at the final path
 * - pending RENAME → keeps the original remote path, records final local path
 * - ZIP files never get structural rows (ordinary local state).
 */
async function collapseRename(
  tx: Transaction,
  file: ProjectFile,
  newPath: string,
  originalRemotePath: string
): Promise<ProjectFileOperation | null> {
  const pending = await getPendingOperation(tx, file.id);
  const now = new Date();

  if (pending) {
    if (pending.operation === "CREATE") {
      // CREATE → rename remains CREATE at the final path.
      const [updated] = await tx
        .update(projectFilePendingOperations)
        .set({ localPath: newPath, remoteBasePath: newPath, updatedAt: now })
        .where(eq(projectFilePendingOperations.id, pending.id))
        .returning();
      return updated ? mapOperation(updated) : null;
    }
    if (pending.operation === "RENAME") {
      // Repeated rename keeps original remote path and final local path.
      const [updated] = await tx
        .update(projectFilePendingOperations)
        .set({ localPath: newPath, updatedAt: now })
        .where(eq(projectFilePendingOperations.id, pending.id))
        .returning();
      return updated ? mapOperation(updated) : null;
    }
    // DELETE pending is unreachable here (tombstoned files are rejected).
    throw new ConflictError("File has a pending deletion");
  }

  if (file.source === "GITLAB") {
    const [created] = await tx
      .insert(projectFilePendingOperations)
      .values({
        projectId: file.projectId,
        projectFileId: file.id,
        operation: "RENAME",
        remoteBasePath: originalRemotePath,
        localPath: newPath,
      })
      .returning();
    return created ? mapOperation(created) : null;
  }

  return null;
}

// ============================================================================
// Rename / Move
// ============================================================================

export interface RenameProjectFileResult {
  file: FileWithProject;
  operation: ProjectFileOperation | null;
}

/**
 * Rename or move a project file.
 *
 * Optional expectedContentHash is checked under the project/file lock.
 * Case-only renames of the same file ID are allowed; other active
 * collisions are rejected. Preserves ID, source, content, labels, and
 * label IDs.
 */
export async function renameProjectFile(
  fileId: string,
  userId: string,
  newFilePath: string,
  expectedContentHash?: string
): Promise<RenameProjectFileResult> {
  const file = await getFileWithProject(fileId);
  if (!file) {
    throw new NotFoundError("File");
  }
  await requireProjectOwnership(file.projectId, userId);

  const canonical = canonicalizeRpyFilePath(newFilePath);
  if (!canonical.ok) {
    throw new ValidationError(canonical.message);
  }
  const canonicalPath = canonical.filePath;

  const db = getDb();

  return await db.transaction(async (tx) => {
    await lockProject(tx, file.projectId);

    const [lockedFile] = await tx
      .select()
      .from(projectFiles)
      .where(eq(projectFiles.id, fileId))
      .for("update");

    if (!lockedFile) {
      throw new NotFoundError("File");
    }

    if (lockedFile.deletedAt) {
      throw new ConflictError("Cannot rename a deleted file");
    }

    if (
      expectedContentHash !== undefined &&
      lockedFile.contentHash !== expectedContentHash
    ) {
      throw new ConflictError(
        "Content hash mismatch: the file changed before the rename",
        {
          reason: "STALE_CONTENT_HASH",
          currentContentHash: lockedFile.contentHash,
        }
      );
    }

    assertGeneratedProtection(lockedFile.filePath, canonicalPath);

    const isCaseOnly =
      canonicalPath.toLowerCase() === lockedFile.filePath.toLowerCase();

    if (!isCaseOnly) {
      await assertCaseInsensitiveUnique(
        tx,
        file.projectId,
        canonicalPath,
        fileId
      );
    }

    const [labelCountRow] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(labels)
      .where(and(eq(labels.projectFileId, fileId), isNull(labels.deletedAt)));
    const hasActiveLabels = (labelCountRow?.count ?? 0) > 0;

    assertClassificationStable(
      lockedFile.filePath,
      canonicalPath,
      lockedFile.content,
      lockedFile.fileType,
      hasActiveLabels
    );

    await assertDirectoryPrefixStable(
      tx,
      file.projectId,
      fileId,
      canonicalPath
    );

    const originalRemotePath = lockedFile.remoteFilePath ?? lockedFile.filePath;
    const [updated] = await tx
      .update(projectFiles)
      .set({
        filePath: canonicalPath,
        updatedAt: new Date(),
      })
      .where(eq(projectFiles.id, fileId))
      .returning();

    if (!updated) {
      throw new NotFoundError("File");
    }

    const operation = await collapseRename(
      tx,
      updated,
      canonicalPath,
      originalRemotePath
    );

    return { file: updated, operation };
  });
}

// ============================================================================
// Word count scrubbing
// ============================================================================

/**
 * Remove deleted label IDs from the project owner's
 * user_settings.labelWordCounts so deleted labels stop contributing to
 * daily word counts.
 */
async function scrubLabelWordCounts(
  tx: Transaction,
  ownerId: string,
  deletedLabelIds: string[]
): Promise<void> {
  if (deletedLabelIds.length === 0) return;
  const [settings] = await tx
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, ownerId))
    .for("update")
    .limit(1);
  if (!settings || !settings.labelWordCounts) return;

  const counts = (settings.labelWordCounts ?? {}) as LabelWordCounts;
  const remaining: LabelWordCounts = {};
  const deleted = new Set(deletedLabelIds);
  let changed = false;
  for (const [labelId, value] of Object.entries(counts)) {
    if (deleted.has(labelId)) {
      changed = true;
      continue;
    }
    remaining[labelId] = value;
  }
  if (changed) {
    await tx
      .update(userSettings)
      .set({ labelWordCounts: remaining, updatedAt: new Date() })
      .where(eq(userSettings.userId, ownerId));
  }
}

// ============================================================================
// Incoming reference recompute (after delete / restore)
// ============================================================================

async function recomputeIncomingReferences(
  tx: Transaction,
  projectId: string
): Promise<void> {
  const savepoint = "incoming_reference_recompute";
  await tx.execute(sql.raw(`SAVEPOINT ${savepoint}`));
  try {
    const { updateIncomingJumpsForLabels } =
      await import("./labels/incoming-jumps.js");
    const activeLabels = await tx
      .select({ id: labels.id })
      .from(labels)
      .where(and(eq(labels.projectId, projectId), isNull(labels.deletedAt)));
    await updateIncomingJumpsForLabels(
      tx,
      activeLabels.map((l) => l.id),
      projectId
    );
    await tx.execute(sql.raw(`RELEASE SAVEPOINT ${savepoint}`));
  } catch (error) {
    await tx.execute(sql.raw(`ROLLBACK TO SAVEPOINT ${savepoint}`));
    await tx.execute(sql.raw(`RELEASE SAVEPOINT ${savepoint}`));
    // Best-effort: a recompute failure must not invalidate the
    // delete/restore transaction that already committed its rows.
    logWarn("project_files.incoming_reference_recompute_failed", {
      projectId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ============================================================================
// Restore (reverse-DELETE and discard-all)
// ============================================================================

/**
 * Reactivate exactly the rows recorded on the DELETE operation: only the
 * labels/lines that were deleted together with this file (never rows that
 * were already deleted earlier). Returns whether the deletion collapsed a
 * pending rename (localPath !== remoteBasePath), in which case a RENAME
 * pending row must be re-created so the remote move is not lost.
 */
async function restoreTombstonedFile(
  tx: Transaction,
  file: ProjectFile,
  deleteOp: ProjectFilePendingOperation
): Promise<void> {
  const labelIds = deleteOp.deletedLabelIds ?? [];
  const lineIds = deleteOp.deletedLineIds ?? [];

  await lockLabelsByIds(tx, labelIds);

  if (labelIds.length > 0) {
    await tx
      .update(labels)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(inArray(labels.id, labelIds));
  }
  if (lineIds.length > 0) {
    await tx
      .update(labelLines)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(inArray(labelLines.id, lineIds));
  }

  await tx
    .update(projectFiles)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(eq(projectFiles.id, file.id));

  // The DELETE row is consumed in every case.
  await tx
    .delete(projectFilePendingOperations)
    .where(eq(projectFilePendingOperations.id, deleteOp.id));

  // If the deletion had collapsed a pending rename, restoring the file
  // must leave a RENAME pending (the remote still lives at the original
  // path while the local file kept the renamed path).
  const hadPendingRename = deleteOp.localPath !== deleteOp.remoteBasePath;
  if (hadPendingRename) {
    await tx.insert(projectFilePendingOperations).values({
      projectId: file.projectId,
      projectFileId: file.id,
      operation: "RENAME",
      remoteBasePath: deleteOp.remoteBasePath,
      localPath: file.filePath,
    });
  }
}

// ============================================================================
// Delete impact (authoritative + occurrence-based)
// ============================================================================

interface TargetLabel {
  id: string;
  labelName: string;
  title: string;
}

interface SourceLabel {
  id: string;
  labelName: string | null;
  title: string;
  projectFileId: string;
  filePath: string;
}

interface CandidateLine {
  labelId: string;
  content: string;
  contentType: string;
  menuOptions: Array<{
    label: string;
    targetLabelId: string;
    targetLabelName: string;
  }> | null;
  rpyLineNumber: number | null;
  linePosition: number | null;
}

export function buildOccurrences(
  targetLabels: TargetLabel[],
  sourceLabels: SourceLabel[],
  candidateLines: CandidateLine[]
): ProjectFileDeleteImpact["occurrences"] {
  const targetsByName = new Map<string, TargetLabel>();
  for (const target of targetLabels) {
    const key = target.labelName.toLowerCase();
    if (!targetsByName.has(key)) {
      targetsByName.set(key, target);
    }
  }
  const targetsById = new Map<string, TargetLabel>(
    targetLabels.map((t) => [t.id, t])
  );
  const sourcesById = new Map<string, SourceLabel>(
    sourceLabels.map((s) => [s.id, s])
  );
  const patternsByTargetId = new Map(
    targetLabels.map((target) => {
      const name = target.labelName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return [
        target.id,
        {
          jumpPattern: new RegExp(`\\bjump\\s+${name}\\b`, "i"),
          callPattern: new RegExp(`\\bcall\\s+${name}\\b`, "i"),
        },
      ] as const;
    })
  );

  const occurrences: ProjectFileDeleteImpact["occurrences"] = [];

  for (const line of candidateLines) {
    const source = sourcesById.get(line.labelId);
    if (!source) continue;

    const isChoice =
      line.contentType === "CHOICE" || line.contentType === "MENU";

    if (line.menuOptions && line.menuOptions.length > 0) {
      // Authoritative structured menu choices.
      for (const option of line.menuOptions) {
        const target =
          (option.targetLabelId
            ? targetsById.get(option.targetLabelId)
            : undefined) ??
          (option.targetLabelName
            ? targetsByName.get(option.targetLabelName.toLowerCase())
            : undefined);
        if (!target) continue;
        occurrences.push({
          referenceType: "MENU_CHOICE",
          targetLabelId: target.id,
          targetLabelName: target.labelName,
          sourceFileId: source.projectFileId,
          sourceFilePath: source.filePath,
          sourceLabelId: source.id,
          sourceLabelName: source.labelName,
          sourceLabelTitle: source.title,
          sourceLineNumber: line.rpyLineNumber ?? line.linePosition,
          lineContent: line.content || null,
        });
      }
      // Menu choices carry their jump inside the choice; do not also count
      // the line's raw jump text as a separate direct jump.
      continue;
    }

    if (isChoice) {
      // Choice line without structured options: skip raw-content jump
      // matching to avoid fabricated occurrences.
      continue;
    }

    if (!line.content) continue;

    // Direct jump/call references in label-line content, case-insensitive.
    for (const target of targetLabels) {
      const { jumpPattern, callPattern } = patternsByTargetId.get(target.id)!;
      if (jumpPattern.test(line.content) || callPattern.test(line.content)) {
        occurrences.push({
          referenceType: jumpPattern.test(line.content) ? "JUMP" : "CALL",
          targetLabelId: target.id,
          targetLabelName: target.labelName,
          sourceFileId: source.projectFileId,
          sourceFilePath: source.filePath,
          sourceLabelId: source.id,
          sourceLabelName: source.labelName,
          sourceLabelTitle: source.title,
          sourceLineNumber: line.rpyLineNumber ?? line.linePosition,
          lineContent: line.content,
        });
      }
    }
  }

  return occurrences;
}

export async function getDeleteImpact(
  fileId: string,
  userId: string
): Promise<ProjectFileDeleteImpact> {
  const file = await getFileWithProject(fileId);
  if (!file) {
    throw new NotFoundError("File");
  }
  await requireProjectOwnership(file.projectId, userId);

  if (file.deletedAt) {
    throw new ConflictError("File is already deleted");
  }

  const db = getDb();

  const activeTargetLabels: ProjectFileDeleteImpact["labels"] = await db
    .select({
      id: labels.id,
      labelName: labels.labelName,
      title: labels.title,
    })
    .from(labels)
    .where(and(eq(labels.projectFileId, fileId), isNull(labels.deletedAt)));

  const targetLabels: TargetLabel[] = activeTargetLabels
    .filter((label): label is TargetLabel & { labelName: string } =>
      Boolean(label.labelName)
    )
    .map((label) => ({
      id: label.id,
      labelName: label.labelName,
      title: label.title,
    }));

  // Source labels live in every OTHER active project file.
  const sourceLabels: SourceLabel[] = await db
    .select({
      id: labels.id,
      labelName: labels.labelName,
      title: labels.title,
      projectFileId: labels.projectFileId,
      filePath: projectFiles.filePath,
    })
    .from(labels)
    .innerJoin(projectFiles, eq(labels.projectFileId, projectFiles.id))
    .where(
      and(
        eq(labels.projectId, file.projectId),
        isNull(labels.deletedAt),
        isNull(projectFiles.deletedAt),
        ne(labels.projectFileId, fileId)
      )
    );

  const sourceLabelIds = sourceLabels.map((l) => l.id);
  const candidateLines: CandidateLine[] =
    sourceLabelIds.length === 0
      ? []
      : await db
          .select({
            labelId: labelLines.labelId,
            content: labelLines.content,
            contentType: labelLines.contentType,
            menuOptions: labelLines.menuOptions,
            rpyLineNumber: labelLines.rpyLineNumber,
            linePosition: labelLines.linePosition,
          })
          .from(labelLines)
          .where(
            and(
              inArray(labelLines.labelId, sourceLabelIds),
              isNull(labelLines.deletedAt)
            )
          );

  const occurrences = buildOccurrences(
    targetLabels,
    sourceLabels,
    candidateLines
  );

  return {
    fileId,
    filePath: file.filePath,
    labelCount: activeTargetLabels.length,
    labels: activeTargetLabels,
    occurrenceCount: occurrences.length,
    occurrences,
  };
}

// ============================================================================
// Delete
// ============================================================================

export interface DeleteProjectFileResult {
  file: FileWithProject;
  operation: ProjectFileOperation | null;
  hardDeleted: boolean;
}

export async function deleteProjectFile(
  fileId: string,
  userId: string
): Promise<DeleteProjectFileResult> {
  const file = await getFileWithProject(fileId);
  if (!file) {
    throw new NotFoundError("File");
  }
  await requireProjectOwnership(file.projectId, userId);

  const db = getDb();

  return await db.transaction(async (tx) => {
    await lockProject(tx, file.projectId);

    // Lock the file and any pending operation (one row per file).
    await lockFilesByIds(tx, [fileId]);
    const [lockedFile] = await tx
      .select()
      .from(projectFiles)
      .where(eq(projectFiles.id, fileId))
      .for("update");

    if (!lockedFile) {
      throw new NotFoundError("File");
    }
    if (lockedFile.deletedAt) {
      throw new ConflictError("File is already deleted");
    }

    if (isProtectedGeneratedPath(lockedFile.filePath)) {
      throw new ValidationError(
        "BranchForge-generated files cannot be deleted"
      );
    }

    const now = new Date();

    // Snapshot labels + lines ACTIVE at this moment (deterministic ID order).
    const activeLabels = await tx
      .select({ id: labels.id })
      .from(labels)
      .where(and(eq(labels.projectFileId, fileId), isNull(labels.deletedAt)))
      .orderBy(asc(labels.id))
      .for("update");
    const labelIds = activeLabels.map((l) => l.id);

    const activeLines =
      labelIds.length === 0
        ? []
        : await tx
            .select({ id: labelLines.id })
            .from(labelLines)
            .where(
              and(
                inArray(labelLines.labelId, labelIds),
                isNull(labelLines.deletedAt)
              )
            )
            .orderBy(asc(labelLines.id))
            .for("update");
    const lineIds = activeLines.map((l) => l.id);

    const pending = await getPendingOperation(tx, fileId);
    const isPendingCreate = pending?.operation === "CREATE";

    // ZIP deletion and CREATE→delete are HARD deletes: the file never
    // existed on the remote (CREATE) or is ordinary local state (ZIP).
    const hardDeleted = lockedFile.source === "ZIP" || isPendingCreate;

    if (hardDeleted) {
      if (pending) {
        // CREATE → delete cancels the operation entirely.
        await tx
          .delete(projectFilePendingOperations)
          .where(eq(projectFilePendingOperations.id, pending.id));
      }
      // Labels and lines are removed via ON DELETE CASCADE.
      await tx.delete(projectFiles).where(eq(projectFiles.id, fileId));
      return { file: lockedFile, operation: null, hardDeleted: true };
    }

    // GitLab soft delete: file becomes a restorable tombstone; only
    // labels/lines active at this moment are affected, and their exact IDs
    // are retained so a restore reactivates only rows from this deletion.
    if (lineIds.length > 0) {
      await tx
        .update(labelLines)
        .set({ deletedAt: now })
        .where(inArray(labelLines.id, lineIds));
    }
    if (labelIds.length > 0) {
      await tx
        .update(labels)
        .set({ deletedAt: now })
        .where(inArray(labels.id, labelIds));
    }

    // Collapse: rename → delete produces DELETE of the original remote path,
    // retaining the current (renamed) local path for restoration.
    let remoteBasePath: string;
    if (pending?.operation === "RENAME") {
      remoteBasePath = pending.remoteBasePath;
      await tx
        .delete(projectFilePendingOperations)
        .where(eq(projectFilePendingOperations.id, pending.id));
    } else {
      remoteBasePath = lockedFile.remoteFilePath ?? lockedFile.filePath;
    }

    const [createdOp] = await tx
      .insert(projectFilePendingOperations)
      .values({
        projectId: file.projectId,
        projectFileId: fileId,
        operation: "DELETE",
        remoteBasePath,
        localPath: lockedFile.filePath,
        deletedLabelIds: labelIds,
        deletedLineIds: lineIds,
      })
      .returning();

    const [updatedFile] = await tx
      .update(projectFiles)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(projectFiles.id, fileId))
      .returning();

    // Scrub word counts and recompute incoming references.
    const [project] = await tx
      .select({ userId: projects.userId })
      .from(projects)
      .where(eq(projects.id, file.projectId))
      .limit(1);
    if (project) {
      await scrubLabelWordCounts(tx, project.userId, labelIds);
    }
    await recomputeIncomingReferences(tx, file.projectId);

    return {
      file: updatedFile ?? lockedFile,
      operation: createdOp ? mapOperation(createdOp) : null,
      hardDeleted: false,
    };
  });
}

// ============================================================================
// Pending Structural Summary
// ============================================================================

export async function getPendingStructuralSummary(
  projectId: string,
  userId: string
): Promise<ProjectFilePendingStructuralSummary> {
  await requireProjectOwnership(projectId, userId);
  const db = getDb();

  const [pendingOps, activeFiles] = await Promise.all([
    db
      .select()
      .from(projectFilePendingOperations)
      .where(eq(projectFilePendingOperations.projectId, projectId))
      .orderBy(asc(projectFilePendingOperations.createdAt)),
    db
      .select({
        id: projectFiles.id,
        filePath: projectFiles.filePath,
        contentHash: projectFiles.contentHash,
        lastPushedContentHash: projectFiles.lastPushedContentHash,
        originalContent: projectFiles.originalContent,
      })
      .from(projectFiles)
      .where(
        and(
          eq(projectFiles.projectId, projectId),
          isNull(projectFiles.deletedAt)
        )
      ),
  ]);

  const createPendingFileIds = new Set(
    pendingOps
      .filter((op) => op.operation === "CREATE")
      .map((op) => op.projectFileId)
  );

  // Content-modified: local contentHash differs from the last-pushed LOCAL
  // baseline; excludes new files (pending CREATE) and tombstones. For
  // legacy rows without a local baseline, fall back to the imported original
  // content. This deliberately matches the export planner's fallback, so
  // pre-migration GitLab projects expose the same edits that will be pushed.
  const contentChanges = activeFiles.filter((f) => {
    if (createPendingFileIds.has(f.id)) return false;
    const baseline =
      f.lastPushedContentHash ??
      (f.originalContent != null
        ? calculateContentHash(
            extractAndStripRpySymbols(f.originalContent).cleanedContent
          )
        : null);
    if (baseline === null) return false;
    return f.contentHash !== baseline;
  });

  return {
    operations: pendingOps.map(mapOperation),
    contentChanges: contentChanges.map((file) => ({
      fileId: file.id,
      filePath: file.filePath,
    })),
    contentModifiedCount: contentChanges.length,
  };
}

// ============================================================================
// Reverse one pending operation
// ============================================================================

export interface ReverseResult {
  reversed: boolean;
  operation: ProjectFileOperation | null;
}

export async function reverseOneOperation(
  fileId: string,
  userId: string
): Promise<ReverseResult> {
  const file = await getFileWithProject(fileId);
  if (!file) {
    throw new NotFoundError("File");
  }
  await requireProjectOwnership(file.projectId, userId);

  const db = getDb();

  return await db.transaction(async (tx) => {
    await lockProject(tx, file.projectId);
    await lockFilesByIds(tx, [fileId]);
    const [lockedFile] = await tx
      .select()
      .from(projectFiles)
      .where(eq(projectFiles.id, fileId))
      .for("update");
    if (!lockedFile) {
      throw new NotFoundError("File");
    }

    const pending = await getPendingOperation(tx, fileId);
    if (!pending) {
      return { reversed: false, operation: null };
    }

    if (pending.operation === "CREATE") {
      // A GitLab CREATE has no remote predecessor. Reversing it therefore
      // cancels the creation itself, including its local labels and lines.
      // The operation row is removed by the file FK cascade.
      await tx.delete(projectFiles).where(eq(projectFiles.id, fileId));
      return { reversed: true, operation: mapOperation(pending) };
    }

    if (pending.operation === "RENAME") {
      // Reverse RENAME restores the remote path locally.
      await tx
        .update(projectFiles)
        .set({
          filePath: pending.remoteBasePath,
          updatedAt: new Date(),
        })
        .where(eq(projectFiles.id, fileId));
      await tx
        .delete(projectFilePendingOperations)
        .where(eq(projectFilePendingOperations.id, pending.id));
      return { reversed: true, operation: mapOperation(pending) };
    }

    // DELETE: restore exactly the recorded deletion and the correct
    // collapsed predecessor (keeps local path; leaves RENAME pending if the
    // file had been renamed before deletion).
    await restoreTombstonedFile(tx, lockedFile, pending);
    await recomputeIncomingReferences(tx, file.projectId);
    return { reversed: true, operation: mapOperation(pending) };
  });
}

// ============================================================================
// Discard all pending operations (project-wide)
// ============================================================================

export interface DiscardAllResult {
  discarded: boolean;
  count: number;
}

/**
 * Discard every pending structural operation in the project in ONE
 * transaction, restoring each file to its actual pre-operation state:
 * - CREATE: the local creation is cancelled and removed
 * - RENAME: the local path is restored to the remote path
 * - DELETE: the deletion is restored AND the remote path is restored
 *   (unlike per-file Restore, which keeps the local state).
 */
export async function discardAllOperations(
  projectId: string,
  userId: string
): Promise<DiscardAllResult> {
  await requireProjectOwnership(projectId, userId);
  const db = getDb();

  return await db.transaction(async (tx) => {
    await lockProject(tx, projectId);

    // Lock all files with pending operations in deterministic ID order.
    const pendingFiles = await tx
      .select({ id: projectFiles.id })
      .from(projectFiles)
      .innerJoin(
        projectFilePendingOperations,
        eq(projectFilePendingOperations.projectFileId, projectFiles.id)
      )
      .where(eq(projectFilePendingOperations.projectId, projectId))
      .orderBy(asc(projectFiles.id))
      .for("update", { of: [projectFiles] });

    const fileIds = pendingFiles.map((f) => f.id);
    if (fileIds.length === 0) {
      return { discarded: false, count: 0 };
    }

    await lockFilesByIds(tx, fileIds);

    const pendingOps = await tx
      .select()
      .from(projectFilePendingOperations)
      .where(eq(projectFilePendingOperations.projectId, projectId))
      .for("update");

    const opsByFileId = new Map(pendingOps.map((op) => [op.projectFileId, op]));

    // Lock affected labels (deleted by DELETE ops) in deterministic order.
    const deletedLabelIds = pendingOps
      .filter((op) => op.operation === "DELETE")
      .flatMap((op) => op.deletedLabelIds ?? []);
    await lockLabelsByIds(tx, deletedLabelIds);

    const files = await tx
      .select()
      .from(projectFiles)
      .where(inArray(projectFiles.id, fileIds));

    for (const file of files) {
      const op = opsByFileId.get(file.id);
      if (!op) continue;

      if (op.operation === "CREATE") {
        // Discarding a pending creation returns the project to its remote
        // state, which has no corresponding file.
        await tx.delete(projectFiles).where(eq(projectFiles.id, file.id));
        continue;
      }

      if (op.operation === "RENAME") {
        await tx
          .update(projectFiles)
          .set({ filePath: op.remoteBasePath, updatedAt: new Date() })
          .where(eq(projectFiles.id, file.id));
        await tx
          .delete(projectFilePendingOperations)
          .where(eq(projectFilePendingOperations.id, op.id));
        continue;
      }

      // DELETE: restore the deletion, then restore the REMOTE path.
      const labelIds = op.deletedLabelIds ?? [];
      const lineIds = op.deletedLineIds ?? [];
      if (labelIds.length > 0) {
        await tx
          .update(labels)
          .set({ deletedAt: null, updatedAt: new Date() })
          .where(inArray(labels.id, labelIds));
      }
      if (lineIds.length > 0) {
        await tx
          .update(labelLines)
          .set({ deletedAt: null, updatedAt: new Date() })
          .where(inArray(labelLines.id, lineIds));
      }
      await tx
        .update(projectFiles)
        .set({
          deletedAt: null,
          filePath: op.remoteBasePath,
          updatedAt: new Date(),
        })
        .where(eq(projectFiles.id, file.id));
      await tx
        .delete(projectFilePendingOperations)
        .where(eq(projectFilePendingOperations.id, op.id));
    }

    await recomputeIncomingReferences(tx, projectId);

    return { discarded: true, count: fileIds.length };
  });
}

// ============================================================================
// Pull guard
// ============================================================================

/**
 * Import/pull is blocked iff any structural CREATE/RENAME/DELETE exists.
 * Ordinary autosaved content edits do NOT block pull. Must be called under
 * the project lock (re-checked) before DB writes.
 */
export async function assertNoPendingStructuralOperations(
  tx: Transaction,
  projectId: string
): Promise<void> {
  const [row] = await tx
    .select({ id: projectFilePendingOperations.id })
    .from(projectFilePendingOperations)
    .where(eq(projectFilePendingOperations.projectId, projectId))
    .limit(1);
  if (row) {
    throw new ConflictError(
      "Push or discard your structural file changes before pulling from GitLab"
    );
  }
}
