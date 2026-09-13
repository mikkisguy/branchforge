/**
 * GitLab Export Service
 *
 * Exports pending structural operations + content changes from BranchForge
 * to GitLab as ONE atomic commit.
 *
 * The commit contains all required explicit actions:
 * - create  → pending CREATE files (file did not exist on the remote)
 * - move    → pending RENAME files (from the stored remote path to the
 *             current local path; casing-only moves use a deterministic
 *             temporary two-step move, because GitLab rejects same-path
 *             casing moves in one step)
 * - delete  → pending DELETE files (tombstoned files)
 * - update  → active files whose local content differs from the last-pushed
 *             local baseline
 * - generated files (branchforge_variables/stats/definitions.rpy)
 *
 * Safety properties:
 * - Per-file preflight against the stored per-file remote content baseline
 *   (never the branch head SHA); an expected source that 404s is a conflict.
 * - Before the remote call the attempt is durably marked on the pending
 *   rows; on an ambiguous response or retry, the remote source/destination
 *   paths and content are re-read, and the attempt is only treated as
 *   successful when the ENTIRE atomic action set is observed.
 * - Pending rows/tombstones/baselines are only finalized after confirmed
 *   success, in one DB transaction. No force path exists.
 */

import { getDb } from "../../db/index.js";
import {
  projectFiles,
  projectFilePendingOperations,
  labels,
  labelLines,
  characters,
  stats,
  variables,
  projects,
} from "../../db/schema/index.js";
import { eq, and, inArray, isNull } from "drizzle-orm";
import {
  patchRPYWithVariables,
  generateVariablesFile,
  generateStatsFile,
  generateCharacterDefinitionsFile,
  normalizeCharacterNameType,
} from "../rpy-generator.service.js";
import {
  computeCommonDirectoryPrefix,
  extractAndStripRpySymbols,
} from "../rpy-statements.service.js";

import type { SyncOperation } from "../gitlab.types.js";
import {
  createSyncOperation,
  updateSyncOperation,
} from "./gitlab-sync-ops.service.js";
import { batchCommitFiles } from "./gitlab-file.service.js";
import {
  _listFilesWithAuth,
  getFileContentWithMetadata,
  getRepositoryLink,
} from "./gitlab-repository.service.js";
import { calculateContentHash } from "../../lib/hash.js";
import { validateGitLabUrl } from "../encryption.service.js";
import { getDecryptedToken } from "./gitlab-integration.service.js";
import { requireProjectOwnership } from "../authz.service.js";
import { lockProject } from "../project-files-operations.service.js";
import { localContentBaselineHash } from "../project-file-baseline.js";
import { logWarn } from "../../lib/logger.js";
import { NotFoundError } from "../../middleware/error-handler.middleware.js";
import type { Transaction } from "../../db/types.js";

type PendingOpRow = typeof projectFilePendingOperations.$inferSelect;
type ProjectFileRow = typeof projectFiles.$inferSelect;
type ExportTx = Transaction;

/** Deterministic temp path for casing-only two-step moves. */
function casingMoveTempPath(finalPath: string): string {
  return `${finalPath}.branchforge-casing-move-tmp`;
}

interface PlannedAction {
  action: "create" | "update" | "move" | "delete";
  filePath: string;
  previousPath?: string;
  content?: string;
}

interface PlannedOperation {
  op: PendingOpRow;
  file: ProjectFileRow | null;
  content: string;
}

interface ExportPlan {
  actions: PlannedAction[];
  operations: PlannedOperation[];
  /** Active files whose content was pushed as a plain update (no pending op). */
  contentUpdatedFiles: Array<{ file: ProjectFileRow; content: string }>;
}

function buildPlannedActions(
  files: ProjectFileRow[],
  ops: PendingOpRow[]
): ExportPlan {
  const actions: PlannedAction[] = [];
  const operations: PlannedOperation[] = [];
  const contentUpdatedFiles: Array<{
    file: ProjectFileRow;
    content: string;
  }> = [];
  const opsByFileId = new Map(ops.map((op) => [op.projectFileId, op]));
  const filesById = new Map(files.map((f) => [f.id, f]));

  // Structural actions first: a deleted path can legally be recreated or
  // renamed-to within the same atomic commit.
  for (const op of ops) {
    const file = filesById.get(op.projectFileId) ?? null;
    if (op.operation === "CREATE") {
      const content = file?.content ?? "";
      actions.push({ action: "create", filePath: op.localPath, content });
      operations.push({ op, file, content });
    } else if (op.operation === "RENAME") {
      const content = file?.content ?? "";
      if (
        op.remoteBasePath.toLowerCase() === op.localPath.toLowerCase() &&
        op.remoteBasePath !== op.localPath
      ) {
        // Casing-only move: deterministic temporary two-step move.
        const tempPath = casingMoveTempPath(op.localPath);
        actions.push({
          action: "move",
          filePath: tempPath,
          previousPath: op.remoteBasePath,
          content,
        });
        actions.push({
          action: "move",
          filePath: op.localPath,
          previousPath: tempPath,
          content,
        });
      } else {
        actions.push({
          action: "move",
          filePath: op.localPath,
          previousPath: op.remoteBasePath,
          content,
        });
      }
      operations.push({ op, file, content });
    } else {
      // DELETE: tombstoned file must really be gone locally.
      if (file && !file.deletedAt) continue;
      actions.push({ action: "delete", filePath: op.remoteBasePath });
      operations.push({ op, file, content: "" });
    }
  }

  // Content-only changes for active files without a pending structural op.
  for (const file of files) {
    if (file.deletedAt) continue;
    if (opsByFileId.has(file.id)) continue;
    const baseline = localContentBaselineHash(file);
    if (baseline === null || baseline === file.contentHash) continue;
    actions.push({
      action: "update",
      filePath: file.filePath,
      content: file.content,
    });
    contentUpdatedFiles.push({ file, content: file.content });
  }

  return { actions, operations, contentUpdatedFiles };
}

/**
 * Build the patched content pushed for a file (defensive symbol strip +
 * variable patching for labels with conditions).
 */
function buildPushedContent(
  file: ProjectFileRow,
  labelsForFile: Array<{
    title: string;
    labelName: string | null;
    conditions: unknown;
    effects: unknown;
    projectFileId: string | null;
  }>
): string {
  if (file.content.length === 0) {
    return "";
  }
  const baseContent = extractAndStripRpySymbols(file.content).cleanedContent;
  if (labelsForFile.length === 0) {
    return baseContent;
  }
  return patchRPYWithVariables(
    baseContent,
    labelsForFile as Parameters<typeof patchRPYWithVariables>[1]
  );
}

/**
 * Verify that the ENTIRE atomic action set is observable on the remote.
 * Used to reconcile a durably-marked push attempt after an ambiguous
 * response.
 */
async function verifyActionSetObserved(
  projectId: string,
  userId: string,
  branch: string,
  actions: PlannedAction[]
): Promise<boolean> {
  try {
    const repoLink = await getRepositoryLink(projectId);
    if (!repoLink) return false;
    const token = await getDecryptedToken(userId);
    const url = validateGitLabUrl(repoLink.gitlabUrl || undefined);
    const listing = await _listFilesWithAuth(
      token,
      url,
      String(repoLink.gitlabProjectId),
      branch,
      () => true
    );
    const remotePaths = new Set(listing.map((f) => f.path));

    const finalPaths = new Map<string, string | undefined>();
    for (const action of actions) {
      if (action.action === "delete") {
        finalPaths.delete(action.filePath);
      } else if (action.action === "move") {
        finalPaths.delete(action.previousPath ?? action.filePath);
        finalPaths.set(action.filePath, action.content);
      } else {
        finalPaths.set(action.filePath, action.content);
      }
    }

    for (const [filePath, content] of finalPaths) {
      if (!remotePaths.has(filePath)) return false;
      if (content === undefined) continue;
      const meta = await getFileContentWithMetadata(
        projectId,
        userId,
        filePath,
        branch
      );
      if (meta.content !== content) return false;
    }
    return true;
  } catch (error) {
    logWarn("gitlab_export.reconciliation_check_failed", {
      projectId,
      branch,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Preflight every affected remote path against the stored per-file remote
 * content baseline:
 * - an expected source that 404s is a conflict (normally)
 * - a create/update destination that already exists is a conflict
 * - remote content drift from the stored per-file baseline is a conflict
 */
async function preflightConflicts(
  projectId: string,
  userId: string,
  branch: string,
  files: ProjectFileRow[],
  plan: ExportPlan
): Promise<void> {
  const filesByRemoteBasePath = new Map<string, ProjectFileRow>();
  for (const f of files) {
    filesByRemoteBasePath.set(f.remoteFilePath ?? f.filePath, f);
  }

  const mustNotExist = new Set<string>();
  const mustExist = new Set<string>();
  const producedPaths = new Set<string>();
  for (const action of plan.actions) {
    if (action.action === "delete") {
      mustExist.add(action.filePath);
      mustNotExist.delete(action.filePath);
      producedPaths.delete(action.filePath);
    } else if (action.action === "create") {
      mustNotExist.add(action.filePath);
      mustExist.delete(action.filePath);
      producedPaths.add(action.filePath);
    } else if (action.action === "move") {
      const source = action.previousPath ?? action.filePath;
      if (producedPaths.has(source)) {
        mustExist.delete(source);
        mustNotExist.delete(source);
      } else {
        mustExist.add(source);
        mustNotExist.delete(source);
      }
      mustNotExist.add(action.filePath);
      producedPaths.add(action.filePath);
    } else {
      // update: source must exist (and be the same file)
      mustExist.add(action.filePath);
      mustNotExist.delete(action.filePath);
      producedPaths.add(action.filePath);
    }
  }
  // Generated files are managed content and are overwritten unconditionally.

  for (const remotePath of mustExist) {
    const meta = await getFileContentWithMetadata(
      projectId,
      userId,
      remotePath,
      branch
    );
    if (meta.content === null) {
      throw new Error(
        `Conflict: expected source file not found on the remote: ${remotePath}`
      );
    }
    const storedFile = filesByRemoteBasePath.get(remotePath);
    if (storedFile?.remoteContentHash) {
      const remoteHash = calculateContentHash(meta.content);
      if (remoteHash !== storedFile.remoteContentHash) {
        throw new Error(
          `Conflict: remote file changed since the last sync: ${remotePath}`
        );
      }
    }
  }

  for (const remotePath of mustNotExist) {
    const meta = await getFileContentWithMetadata(
      projectId,
      userId,
      remotePath,
      branch
    );
    if (meta.content !== null) {
      throw new Error(
        `Conflict: file already exists on the remote: ${remotePath}`
      );
    }
  }
}

/**
 * Advance baselines/remote paths and remove pending rows after a confirmed
 * successful push. Runs inside one DB transaction.
 */
async function finalizeSuccessfulPush(
  tx: ExportTx,
  projectId: string,
  plan: ExportPlan,
  branch: string,
  commitId: string | null
): Promise<void> {
  for (const item of plan.operations) {
    if (!item.file) continue;
    if (item.op.operation === "DELETE") {
      // Permanently remove the successfully deleted tombstone.
      await tx.delete(projectFiles).where(eq(projectFiles.id, item.file.id));
      continue;
    }
    // CREATE / RENAME: the file now lives at its local path on the remote.
    await tx
      .update(projectFiles)
      .set({
        remoteFilePath: item.op.localPath,
        remoteBranch: branch,
        remoteRevision: commitId,
        remoteContent: item.content,
        remoteContentHash: calculateContentHash(item.content),
        lastPushedContentHash: item.file.contentHash,
        hasRemoteConflict: false,
        updatedAt: new Date(),
      })
      .where(eq(projectFiles.id, item.file.id));
  }

  // Content-only updated files advance their local baseline too.
  for (const { file, content } of plan.contentUpdatedFiles) {
    await tx
      .update(projectFiles)
      .set({
        remoteFilePath: file.filePath,
        remoteBranch: branch,
        remoteRevision: commitId,
        remoteContent: content,
        remoteContentHash: calculateContentHash(content),
        lastPushedContentHash: file.contentHash,
        hasRemoteConflict: false,
        updatedAt: new Date(),
      })
      .where(eq(projectFiles.id, file.id));
  }

  // Consume only the pending rows that were included in this push plan.
  // Concurrent structural ops created during the remote call must survive.
  const plannedIds = plan.operations.map((item) => item.op.id);
  if (plannedIds.length > 0) {
    await tx
      .delete(projectFilePendingOperations)
      .where(inArray(projectFilePendingOperations.id, plannedIds));
  }
}

/**
 * Advance label sync baselines for exported (active) files.
 */
async function advanceLabelBaselines(
  db: ReturnType<typeof getDb>,
  projectId: string,
  exportedFileIds: string[]
): Promise<void> {
  if (exportedFileIds.length === 0) return;

  const exportedLabels = await db
    .select({ id: labels.id, contentHash: labels.contentHash })
    .from(labels)
    .where(
      and(
        eq(labels.projectId, projectId),
        inArray(labels.projectFileId, exportedFileIds),
        isNull(labels.deletedAt)
      )
    );

  const labelsWithContentHash = exportedLabels.filter(
    (l) => l.contentHash !== null
  );

  if (labelsWithContentHash.length > 0) {
    const exportedLabelIds = labelsWithContentHash.map((l) => l.id);

    await db
      .update(labels)
      .set({
        lastSyncedHash: labels.contentHash,
        syncStatus: "SYNCED",
        lastExportedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(inArray(labels.id, exportedLabelIds));

    await db
      .update(labelLines)
      .set({
        lastSyncedHash: labelLines.contentHash,
        lastSyncedAt: new Date(),
        isDirty: false,
      })
      .where(
        and(
          inArray(labelLines.labelId, exportedLabelIds),
          isNull(labelLines.deletedAt)
        )
      );
  }
}

export async function exportToGitlab(
  projectId: string,
  userId: string,
  branch?: string,
  commitMessage?: string
): Promise<SyncOperation> {
  await requireProjectOwnership(projectId, userId);

  const db = getDb();
  const message =
    commitMessage || `Export from BranchForge - ${new Date().toISOString()}`;

  // Resolve the target branch (existing or new non-default branch)
  let targetBranch = branch;
  if (!targetBranch) {
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) {
      throw new NotFoundError("Project");
    }
    const repoLink = await getRepositoryLink(projectId);
    targetBranch = repoLink?.defaultBranch || "main";
  }

  // Create sync operation
  const operation = await createSyncOperation(
    projectId,
    "EXPORT",
    targetBranch
  );

  try {
    // Load ALL GitLab files (including tombstones: pending DELETEs live on
    // tombstoned rows) and pending structural operations.
    const files = await db
      .select()
      .from(projectFiles)
      .where(
        and(
          eq(projectFiles.projectId, projectId),
          eq(projectFiles.source, "GITLAB")
        )
      );

    const ops = await db
      .select()
      .from(projectFilePendingOperations)
      .where(eq(projectFilePendingOperations.projectId, projectId));

    // Reconciliation: a previously marked attempt without confirmed success
    // must be reconciled before a fresh push. The previous attempt is only
    // treated as success if the ENTIRE atomic action set is observed on the
    // remote. Only rows carrying the attempt marker are part of that attempt.
    const unresolved = ops.filter((op) => op.attemptStartedAt !== null);
    if (unresolved.length > 0) {
      const unresolvedIds = unresolved.map((op) => op.id);
      const plan = buildPlannedActions(files, unresolved);
      const observed = await verifyActionSetObserved(
        projectId,
        userId,
        targetBranch,
        plan.actions
      );
      if (observed) {
        // The previous attempt actually succeeded remotely: finalize now.
        await db.transaction(async (tx) => {
          await lockProject(tx, projectId);
          await finalizeSuccessfulPush(
            tx,
            projectId,
            plan,
            unresolved[0]?.attemptBranch ?? targetBranch,
            unresolved[0]?.lastAttemptCommitId ?? null
          );
        });
        await updateSyncOperation(operation.id, {
          status: "COMPLETED",
          conflictCount: 0,
          commitId: unresolved[0]?.lastAttemptCommitId ?? null,
        });
        return {
          ...operation,
          status: "COMPLETED",
          conflictCount: 0,
          commitId: unresolved[0]?.lastAttemptCommitId ?? null,
        };
      }
      // Not observed: the previous attempt did not fully apply. Clear the
      // attempt markers on the marked rows only and proceed with a fresh push.
      await db
        .update(projectFilePendingOperations)
        .set({
          attemptStartedAt: null,
          attemptBranch: null,
          updatedAt: new Date(),
        })
        .where(inArray(projectFilePendingOperations.id, unresolvedIds));
    }

    // Active (non-tombstoned) files for label patching and generated files.
    const activeFiles = files.filter((f) => !f.deletedAt);

    // Get all labels with projectFileId, conditions and effects for variable patching
    const projectLabels = await db
      .select({
        title: labels.title,
        labelName: labels.labelName,
        conditions: labels.conditions,
        effects: labels.effects,
        projectFileId: labels.projectFileId,
      })
      .from(labels)
      .where(and(eq(labels.projectId, projectId), isNull(labels.deletedAt)));

    const labelsByFile = new Map<string, typeof projectLabels>();
    for (const label of projectLabels) {
      if (label.projectFileId) {
        if (!labelsByFile.has(label.projectFileId)) {
          labelsByFile.set(label.projectFileId, []);
        }
        labelsByFile.get(label.projectFileId)!.push(label);
      }
    }

    // Build the plan and patch content for every affected file.
    const plan = buildPlannedActions(files, ops);
    for (const item of plan.operations) {
      if (item.file) {
        item.content = buildPushedContent(
          item.file,
          labelsByFile.get(item.file.id) ?? []
        );
      }
    }
    for (const item of plan.contentUpdatedFiles) {
      item.content = buildPushedContent(
        item.file,
        labelsByFile.get(item.file.id) ?? []
      );
      const action = plan.actions.find(
        (candidate) =>
          candidate.action === "update" &&
          candidate.filePath === item.file.filePath
      );
      if (action) action.content = item.content;
    }

    // Determine the directory prefix for generated files (e.g. "game/")
    const fileDirPrefix = computeCommonDirectoryPrefix(
      activeFiles.map((f) => f.filePath)
    );

    // Generated files share the single atomic commit.
    const generatedActions: PlannedAction[] = [];
    const [projectVariables, projectStats, projectCharacters] =
      await Promise.all([
        db
          .select({
            key: variables.key,
            description: variables.description,
            category: variables.category,
          })
          .from(variables)
          .where(eq(variables.projectId, projectId)),
        db
          .select({
            key: stats.key,
            name: stats.name,
            minValue: stats.minValue,
            maxValue: stats.maxValue,
            description: stats.description,
          })
          .from(stats)
          .where(eq(stats.projectId, projectId))
          .orderBy(stats.key),
        db
          .select({
            renpyTag: characters.renpyTag,
            name: characters.name,
            nameType: characters.nameType,
            color: characters.color,
            isNarrator: characters.isNarrator,
            displayName: characters.displayName,
          })
          .from(characters)
          .where(eq(characters.projectId, projectId)),
      ]);

    if (projectVariables.length > 0) {
      generatedActions.push({
        action: "update",
        filePath: `${fileDirPrefix}branchforge_variables.rpy`,
        content: generateVariablesFile(projectVariables),
      });
    }
    if (projectStats.length > 0) {
      generatedActions.push({
        action: "update",
        filePath: `${fileDirPrefix}branchforge_stats.rpy`,
        content: generateStatsFile(projectStats),
      });
    }
    if (projectCharacters.length > 0) {
      generatedActions.push({
        action: "update",
        filePath: `${fileDirPrefix}branchforge_definitions.rpy`,
        content: generateCharacterDefinitionsFile(
          projectCharacters.map((c) => ({
            ...c,
            nameType: normalizeCharacterNameType(c.nameType),
          }))
        ),
      });
    }

    const allActions = [...plan.actions, ...generatedActions];

    if (allActions.length > 0) {
      // Preflight each affected source against the stored per-file remote
      // content baseline.
      await preflightConflicts(projectId, userId, targetBranch, files, plan);

      // Durably mark the exact planned attempt BEFORE the remote call.
      const plannedIds = plan.operations.map((item) => item.op.id);
      if (plannedIds.length > 0) {
        await db.transaction(async (tx) => {
          await lockProject(tx, projectId);
          await tx
            .update(projectFilePendingOperations)
            .set({
              attemptBranch: targetBranch,
              attemptStartedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(inArray(projectFilePendingOperations.id, plannedIds));
        });
      }

      // ONE GitLab commit containing all required explicit actions.
      const commitId = await batchCommitFiles(
        projectId,
        userId,
        targetBranch,
        message,
        allActions
      );

      // Finalize baselines/remote paths and remove successfully deleted
      // tombstones only after confirmed success, in one DB transaction.
      await db.transaction(async (tx) => {
        await lockProject(tx, projectId);
        await finalizeSuccessfulPush(
          tx,
          projectId,
          plan,
          targetBranch,
          commitId
        );
      });

      // Advance label sync baselines for exported active files.
      const exportedActiveFileIds = [
        ...plan.operations
          .filter((item) => item.file && !item.file.deletedAt)
          .map((item) => item.file!.id),
        ...plan.contentUpdatedFiles.map((item) => item.file.id),
      ];
      await advanceLabelBaselines(db, projectId, exportedActiveFileIds);

      await updateSyncOperation(operation.id, {
        status: "COMPLETED",
        conflictCount: 0,
        commitId,
      });

      return {
        ...operation,
        status: "COMPLETED",
        conflictCount: 0,
        commitId,
      };
    }

    // Nothing to push
    await updateSyncOperation(operation.id, {
      status: "COMPLETED",
      conflictCount: 0,
    });
    return {
      ...operation,
      status: "COMPLETED",
      conflictCount: 0,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    await updateSyncOperation(operation.id, {
      status: "FAILED",
      errorMessage,
    });
    // Pending rows, tombstones and baselines are preserved untouched.
    return {
      ...operation,
      status: "FAILED",
      errorMessage,
    };
  }
}
