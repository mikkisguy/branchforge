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
 * - A target branch that does not exist yet is created from the repository
 *   default branch. Preflight and generated-file actions read that default
 *   branch, because the new branch does not exist until the commit.
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
  projectSettings,
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
  isSourceOwnedRpyFile,
  collectSourceOwnedRpySymbolKeys,
  DEFAULT_EXCLUDED_RENPY_TAGS,
} from "../rpy-statements.service.js";
import { ensureCharacterSourcePreservation } from "../character-source-preservation.service.js";
import { assertExcludedCharactersHaveSourceOwnership } from "../export-consistency.service.js";

import type { SyncOperation } from "../gitlab.types.js";
import type { CharacterSourceDefinition } from "@branchforge/shared";
import {
  createSyncOperation,
  updateSyncOperation,
} from "./gitlab-sync-ops.service.js";
import { batchCommitFiles } from "./gitlab-file.service.js";
import {
  _listFilesWithAuth,
  getBranchCommitSha,
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
import {
  NotFoundError,
  RepositoryNotLinkedError,
  ConflictError,
} from "../../middleware/error-handler.middleware.js";
import type { Transaction } from "../../db/types.js";

type PendingOpRow = typeof projectFilePendingOperations.$inferSelect;
type ProjectFileRow = typeof projectFiles.$inferSelect;
type ExportTx = Transaction;

function remoteContentBaselineHash(file: ProjectFileRow): string | null {
  if (file.remoteContentHash) return file.remoteContentHash;
  const content = file.remoteContent ?? file.originalContent;
  return content === null ? null : calculateContentHash(content);
}

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
  ops: PendingOpRow[],
  excludedTags: ReadonlySet<string>
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
    const baseline = localContentBaselineHash(file, excludedTags);
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

interface GeneratedExportData {
  variables: Array<{
    key: string;
    description: string | null;
    category: string | null;
  }>;
  stats: Array<{
    key: string;
    name: string;
    minValue: number;
    maxValue: number;
    description: string | null;
  }>;
  characters: Array<{
    renpyTag: string;
    name: string;
    nameType: string;
    color: string;
    isNarrator: boolean;
    displayName: string;
    sourceDefinition: CharacterSourceDefinition | null;
  }>;
}

/**
 * Generated files are not tracked in project_files, so GitLab needs an
 * explicit create action on their first export and an update thereafter.
 */
async function buildGeneratedActions(
  projectId: string,
  userId: string,
  branch: string,
  fileDirPrefix: string,
  generated: GeneratedExportData,
  activeFiles: ProjectFileRow[],
  excludedTags: ReadonlySet<string>
): Promise<PlannedAction[]> {
  // Plain names declared in the active source-owned files own the global
  // store: generated declarations must not collide with them.
  const sourceOwnedKeys = collectSourceOwnedRpySymbolKeys(
    activeFiles.map((file) => ({
      filePath: file.filePath,
      content: file.content,
    })),
    excludedTags
  );
  // Candidate selection stays based on the ORIGINAL category length: when a
  // category has DB rows whose symbols were all filtered, the generated file
  // is still pushed (overwriting a stale remote copy that may otherwise
  // collide with the protected declarations). Only a category with no DB
  // rows at all produces no action.
  const filteredVariables = generated.variables.filter(
    (variable) => !sourceOwnedKeys.has(variable.key)
  );
  const filteredStats = generated.stats.filter(
    (stat) => !sourceOwnedKeys.has(stat.key)
  );
  const filteredCharacters = generated.characters.filter(
    (character) =>
      !sourceOwnedKeys.has(character.renpyTag) &&
      !excludedTags.has(character.renpyTag)
  );

  const candidates: Array<{ filePath: string; content: string }> = [];

  if (generated.variables.length > 0) {
    candidates.push({
      filePath: `${fileDirPrefix}branchforge_variables.rpy`,
      content: generateVariablesFile(filteredVariables),
    });
  }
  if (generated.stats.length > 0) {
    candidates.push({
      filePath: `${fileDirPrefix}branchforge_stats.rpy`,
      content: generateStatsFile(filteredStats),
    });
  }
  if (generated.characters.length > 0) {
    candidates.push({
      filePath: `${fileDirPrefix}branchforge_definitions.rpy`,
      content: generateCharacterDefinitionsFile(
        filteredCharacters.map((character) => ({
          ...character,
          nameType: normalizeCharacterNameType(character.nameType),
        }))
      ),
    });
  }

  const generatedActions = await Promise.all(
    candidates.map(
      async ({ filePath, content }): Promise<PlannedAction | null> => {
        // A 404 (including for a new branch) is represented as content: null.
        const remoteFile = await getFileContentWithMetadata(
          projectId,
          userId,
          filePath,
          branch
        );
        if (remoteFile.content === null) {
          return { action: "create", filePath, content };
        }
        if (remoteFile.content === content) {
          // Generated content already matches the remote exactly: avoid a
          // no-op update. Symbol ownership/filtering and empty-generated
          // cleanup are handled before this point.
          return null;
        }
        return { action: "update", filePath, content };
      }
    )
  );

  return generatedActions.filter(
    (action): action is PlannedAction => action !== null
  );
}

const MISSING_DEFAULT_BRANCH_MESSAGE =
  "Export failed. The repository default branch was not found, so a new branch cannot be created.";

/**
 * Fetch the project's excluded Ren'Py character tags. Missing settings rows
 * or null columns fall back to the default excluded tags; explicit empty
 * array means no exclusions.
 */
async function fetchProjectExcludedTags(
  projectId: string
): Promise<Set<string>> {
  const db = getDb();
  const [settings] = await db
    .select({ excludedCharacterTags: projectSettings.excludedCharacterTags })
    .from(projectSettings)
    .where(eq(projectSettings.projectId, projectId))
    .limit(1);

  if (settings?.excludedCharacterTags === undefined) {
    return new Set(DEFAULT_EXCLUDED_RENPY_TAGS);
  }

  if (settings.excludedCharacterTags === null) {
    return new Set(DEFAULT_EXCLUDED_RENPY_TAGS);
  }

  return new Set(settings.excludedCharacterTags);
}

function toUserFacingExportError(error: unknown): string {
  if (error instanceof RepositoryNotLinkedError) {
    return "Export failed. Link a GitLab repository in project settings, then try again.";
  }

  // Export-consistency conflicts are already actionable; pass them through.
  if (error instanceof ConflictError) {
    return error.userMessage;
  }

  if (
    error instanceof Error &&
    (error.message.startsWith("Conflict:") ||
      error.message === MISSING_DEFAULT_BRANCH_MESSAGE)
  ) {
    return error.message;
  }

  return "Export failed. Check your GitLab connection, branch name, and permissions, then try again.";
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
  }>,
  excludedTags: ReadonlySet<string>
): string {
  // Source-owned files (screens.rpy, gui.rpy, ...) are pushed verbatim:
  // no managed-statement strip and no variable patching, independent of
  // any stale fileType.
  if (isSourceOwnedRpyFile(file.filePath)) {
    return file.content;
  }
  if (file.content.length === 0) {
    return "";
  }
  const baseContent = extractAndStripRpySymbols(
    file.content,
    file.filePath,
    excludedTags
  ).cleanedContent;
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
): Promise<Map<string, string | null>> {
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

  const remoteContents = new Map<string, string | null>();

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
    remoteContents.set(remotePath, meta.content);
    const storedFile = filesByRemoteBasePath.get(remotePath);
    const expectedHash = storedFile
      ? remoteContentBaselineHash(storedFile)
      : null;
    if (expectedHash) {
      const remoteHash = calculateContentHash(meta.content);
      if (remoteHash !== expectedHash) {
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

  return remoteContents;
}

/**
 * Advance local baselines for content-only files whose update was omitted
 * because the remote already matches the desired content. Preserves the
 * existing remoteRevision rather than overwriting it with null, since no new
 * commit was created.
 */
async function advanceContentUpdatedBaselines(
  tx: ExportTx,
  contentUpdatedFiles: Array<{ file: ProjectFileRow; content: string }>,
  branch: string
): Promise<void> {
  for (const { file, content } of contentUpdatedFiles) {
    await tx
      .update(projectFiles)
      .set({
        remoteFilePath: file.filePath,
        remoteBranch: branch,
        remoteContent: content,
        remoteContentHash: calculateContentHash(content),
        lastPushedContentHash: file.contentHash,
        hasRemoteConflict: false,
        updatedAt: new Date(),
      })
      .where(eq(projectFiles.id, file.id));
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
  const updatedPaths = new Set(
    plan.actions
      .filter((action) => action.action === "update")
      .map((action) => action.filePath)
  );
  for (const { file, content } of plan.contentUpdatedFiles) {
    await tx
      .update(projectFiles)
      .set({
        remoteFilePath: file.filePath,
        remoteBranch: branch,
        remoteRevision: updatedPaths.has(file.filePath)
          ? commitId
          : file.remoteRevision,
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

/**
 * Branch whose file tree the export commit is applied to.
 * An existing target is that branch. A missing target is created from the
 * repository default branch, so preflight must read the default branch.
 */
async function resolveExportContentBranch(
  projectId: string,
  userId: string,
  targetBranch: string
): Promise<string> {
  try {
    await getBranchCommitSha(projectId, userId, targetBranch);
    return targetBranch;
  } catch (error) {
    if (!(error instanceof NotFoundError)) {
      throw error;
    }
  }

  const repoLink = await getRepositoryLink(projectId);
  if (!repoLink) {
    throw new RepositoryNotLinkedError();
  }

  const baseBranch = repoLink.defaultBranch || "main";
  if (baseBranch === targetBranch) {
    throw new Error(MISSING_DEFAULT_BRANCH_MESSAGE);
  }

  try {
    await getBranchCommitSha(projectId, userId, baseBranch);
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw new Error(MISSING_DEFAULT_BRANCH_MESSAGE, { cause: error });
    }
    throw error;
  }

  return baseBranch;
}

export async function exportToGitlab(
  projectId: string,
  userId: string,
  branch?: string,
  commitMessage?: string
): Promise<SyncOperation> {
  await requireProjectOwnership(projectId, userId);

  // Idempotent source-preservation maintenance must run after the ownership
  // guard and before any file content is read or generated.
  await ensureCharacterSourcePreservation(projectId);

  const db = getDb();
  const message =
    commitMessage || `Export from BranchForge - ${new Date().toISOString()}`;

  // Load the project's character-tag exclusion policy once and use it for
  // every strip/collision decision in this export.
  const excludedTags = await fetchProjectExcludedTags(projectId);

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
      const plan = buildPlannedActions(files, unresolved, excludedTags);
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
    const plan = buildPlannedActions(files, ops, excludedTags);
    for (const item of plan.operations) {
      if (item.file) {
        item.content = buildPushedContent(
          item.file,
          labelsByFile.get(item.file.id) ?? [],
          excludedTags
        );
      }
    }
    for (const item of plan.contentUpdatedFiles) {
      item.content = buildPushedContent(
        item.file,
        labelsByFile.get(item.file.id) ?? [],
        excludedTags
      );
      const action = plan.actions.find(
        (candidate) =>
          candidate.action === "update" &&
          candidate.filePath === item.file.filePath
      );
      if (action) action.content = item.content;
    }

    // Import strips managed statements from the stored source file and sets
    // the local baseline to that cleaned content. The local hash is therefore
    // unchanged even though GitLab still has the original statements. Include
    // any source whose desired export content differs from its remote baseline.
    const plannedFileIds = new Set([
      ...plan.operations.map((item) => item.op.projectFileId),
      ...plan.contentUpdatedFiles.map((item) => item.file.id),
    ]);
    for (const file of activeFiles) {
      if (plannedFileIds.has(file.id)) {
        continue;
      }
      const content = buildPushedContent(
        file,
        labelsByFile.get(file.id) ?? [],
        excludedTags
      );
      const remoteHash = remoteContentBaselineHash(file);
      if (remoteHash === null || calculateContentHash(content) === remoteHash) {
        continue;
      }
      plan.actions.push({ action: "update", filePath: file.filePath, content });
      plan.contentUpdatedFiles.push({ file, content });
    }

    // A missing target is created from the default branch at commit time.
    // Read that base so updates are not treated as 404 conflicts.
    const contentBranch = await resolveExportContentBranch(
      projectId,
      userId,
      targetBranch
    );

    // Determine the directory prefix for generated files (e.g. "game/")
    const fileDirPrefix = computeCommonDirectoryPrefix(
      activeFiles.map((f) => f.filePath)
    );

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
            sourceDefinition: characters.sourceDefinition,
          })
          .from(characters)
          .where(eq(characters.projectId, projectId)),
      ]);

    // Export consistency: an excluded DB character without any current
    // active source-owned global declaration would silently disappear
    // from the remote tree. Fail with an actionable conflict before any
    // remote write.
    assertExcludedCharactersHaveSourceOwnership(
      projectCharacters,
      excludedTags,
      activeFiles.map((file) => ({
        filePath: file.filePath,
        content: file.content,
      }))
    );

    // Generated files share the single atomic commit.
    const generatedActions = await buildGeneratedActions(
      projectId,
      userId,
      contentBranch,
      fileDirPrefix,
      {
        variables: projectVariables,
        stats: projectStats,
        characters: projectCharacters,
      },
      activeFiles,
      excludedTags
    );

    // Preflight each affected source against the stored per-file remote
    // content baseline. The preflight also returns the actual remote content
    // for update paths so identical plain updates can be dropped after
    // conflict checks succeed.
    if (plan.actions.length > 0) {
      const remoteContents = await preflightConflicts(
        projectId,
        userId,
        contentBranch,
        files,
        plan
      );

      // Keep contentUpdatedFiles so omitted updates still advance baselines.
      // Structural actions always remain in the atomic commit.
      plan.actions = plan.actions.filter(
        (action) =>
          action.action !== "update" ||
          remoteContents.get(action.filePath) !== action.content
      );
    }

    const allActions = [...plan.actions, ...generatedActions];

    if (allActions.length > 0) {
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

    // Nothing to push: advance baselines for content-only files whose update
    // was omitted because the remote is already up to date.
    if (plan.contentUpdatedFiles.length > 0) {
      await db.transaction(async (tx) => {
        await lockProject(tx, projectId);
        await advanceContentUpdatedBaselines(
          tx,
          plan.contentUpdatedFiles,
          contentBranch
        );
      });

      const contentUpdatedFileIds = plan.contentUpdatedFiles.map(
        (item) => item.file.id
      );
      await advanceLabelBaselines(db, projectId, contentUpdatedFileIds);
    }

    await updateSyncOperation(operation.id, {
      status: "COMPLETED",
      conflictCount: 0,
    });
    return {
      ...operation,
      status: "COMPLETED",
      conflictCount: 0,
      noChanges: true,
    };
  } catch (error) {
    const errorMessage = toUserFacingExportError(error);
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
