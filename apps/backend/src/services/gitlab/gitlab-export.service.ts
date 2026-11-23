import { randomUUID } from "node:crypto";
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
 * - The ordered batch and affected baselines are persisted before the
 *   remote request. An ambiguous attempt is recovered from GitLab commit
 *   evidence and the captured path states.
 * - Pending rows/tombstones/baselines are only finalized after confirmed
 *   success, in one DB transaction. No force path exists.
 */

import { getDb } from "../../db/index.js";
import {
  projectFiles,
  projectFilePendingOperations,
  labels,
  labelLines,
  projects,
  projectSettings,
  gitlabSyncOperations,
} from "../../db/schema/index.js";
import type { GitlabExportAttemptSnapshot } from "../../db/schema/index.js";
import { eq, and, inArray, isNull, ne } from "drizzle-orm";
import { patchRPYWithVariables } from "../rpy-generator.service.js";
import {
  computeCommonDirectoryPrefix,
  extractAndStripRpySymbols,
  isSourceOwnedRpyFile,
  DEFAULT_EXCLUDED_RENPY_TAGS,
} from "../rpy-statements.service.js";
import { ensureCharacterSourcePreservation } from "../character-source-preservation.service.js";
import { catchUpManagedDefaults } from "../managed-defaults.service.js";
import { fetchSupportingFileSources } from "../export-sources.service.js";
import { assertExcludedCharactersHaveSourceOwnership } from "../export-consistency.service.js";

import type { SyncOperation } from "../gitlab.types.js";
import {
  createSyncOperation,
  getSyncOperation,
  updateSyncOperation,
} from "./gitlab-sync-ops.service.js";
import {
  batchCommitFiles,
  GitLabCommitRejectedError,
  GitLabCommitNotSentError,
} from "./gitlab-file.service.js";
import type { BatchCommitAction } from "./gitlab-file.service.js";
import {
  buildGeneratedActions,
  findGeneratedCommitConflict,
} from "./gitlab-generated-export.js";
import {
  assertNoPendingExportAttempt,
  captureExportPreimages,
  claimExportAttempt,
  discardExportAttempt,
  finalizeExportAttempt,
  getPendingExportAttempt,
  guardExportActions,
  prepareExportAttempt,
  recordExportAttemptReceipt,
  verifyExportAttempt,
} from "./gitlab-export-attempt.service.js";
import {
  assertGitlabRepositoryIdentity,
  gitlabRepositoryIdentity,
  getBranchCommitSha,
  getFileContentWithMetadata,
  getRepositoryLink,
} from "./gitlab-repository.service.js";
import type { GitlabRepositoryIdentity } from "./gitlab-repository.service.js";
import { calculateContentHash } from "../../lib/hash.js";
import { requireProjectOwnership } from "../authz.service.js";
import { lockProject } from "../project-files-operations.service.js";
import { localContentBaselineHash } from "../project-file-baseline.js";
import { logError } from "../../lib/logger.js";
import {
  NotFoundError,
  RepositoryNotLinkedError,
} from "../../middleware/error-handler.middleware.js";
import type { Transaction } from "../../db/types.js";
import {
  GITLAB_EXPORT_ATTEMPT_CHANGED,
  GITLAB_EXPORT_ATTEMPT_UNCERTAIN,
  createPreflightSourceMissingError,
  createPreflightRemoteChangedError,
  createPreflightFileExistsError,
  toUserFacingExportError,
} from "./gitlab-error.helpers.js";

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

interface PlannedOperation {
  op: PendingOpRow;
  file: ProjectFileRow | null;
  content: string;
}

interface ExportPlan {
  actions: BatchCommitAction[];
  operations: PlannedOperation[];
  /** Active files whose content was pushed as a plain update (no pending op). */
  contentUpdatedFiles: Array<{ file: ProjectFileRow; content: string }>;
}

function buildPlannedActions(
  files: ProjectFileRow[],
  ops: PendingOpRow[],
  excludedTags: ReadonlySet<string>,
  renderFile: (file: ProjectFileRow) => string
): ExportPlan {
  const actions: BatchCommitAction[] = [];
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
      const content = file ? renderFile(file) : "";
      actions.push({ action: "create", filePath: op.localPath, content });
      operations.push({ op, file, content });
    } else if (op.operation === "RENAME") {
      const content = file ? renderFile(file) : "";
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
    const content = renderFile(file);
    actions.push({ action: "update", filePath: file.filePath, content });
    contentUpdatedFiles.push({ file, content });
  }

  return { actions, operations, contentUpdatedFiles };
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
  plan: ExportPlan,
  repository: GitlabRepositoryIdentity
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

  const remoteContents = new Map<string, string | null>();

  for (const remotePath of mustExist) {
    const meta = await getFileContentWithMetadata(
      projectId,
      userId,
      remotePath,
      branch,
      undefined,
      repository
    );
    if (meta.content === null) {
      throw createPreflightSourceMissingError(remotePath);
    }
    remoteContents.set(remotePath, meta.content);
    const storedFile = filesByRemoteBasePath.get(remotePath);
    const expectedHash = storedFile
      ? remoteContentBaselineHash(storedFile)
      : null;
    if (expectedHash) {
      const remoteHash = calculateContentHash(meta.content);
      if (remoteHash !== expectedHash) {
        throw createPreflightRemoteChangedError(remotePath);
      }
    }
  }

  for (const remotePath of mustNotExist) {
    const meta = await getFileContentWithMetadata(
      projectId,
      userId,
      remotePath,
      branch,
      undefined,
      repository
    );
    if (meta.content !== null) {
      throw createPreflightFileExistsError(remotePath);
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
  targetBranch: string,
  defaultBranch: string,
  repository: GitlabRepositoryIdentity
): Promise<{ branch: string; revision: string; branchExisted: boolean }> {
  try {
    const revision = await getBranchCommitSha(
      projectId,
      userId,
      targetBranch,
      undefined,
      repository
    );
    return { branch: targetBranch, revision, branchExisted: true };
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error;
  }
  if (defaultBranch === targetBranch) {
    throw new Error(MISSING_DEFAULT_BRANCH_MESSAGE);
  }
  try {
    const revision = await getBranchCommitSha(
      projectId,
      userId,
      defaultBranch,
      undefined,
      repository
    );
    return { branch: defaultBranch, revision, branchExisted: false };
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw new Error(MISSING_DEFAULT_BRANCH_MESSAGE, { cause: error });
    }
    throw error;
  }
}

export async function exportToGitlab(
  projectId: string,
  userId: string,
  branch?: string,
  commitMessage?: string
): Promise<SyncOperation> {
  await requireProjectOwnership(projectId, userId);

  // Promote current defaults before character recovery can strip them.
  // Both maintenance steps run after authorization and before export reads.
  await catchUpManagedDefaults(projectId);
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
    const repoLink = await getRepositoryLink(projectId);
    if (!repoLink) throw new RepositoryNotLinkedError();
    const repository = gitlabRepositoryIdentity(repoLink);
    const defaultBranch = repoLink.defaultBranch || "main";
    const pendingAttempt = await getPendingExportAttempt(projectId);
    let reconciledCommitId: string | null = null;
    if (pendingAttempt) {
      assertGitlabRepositoryIdentity(pendingAttempt, repoLink);
      if (pendingAttempt.branch !== targetBranch) {
        throw new Error(GITLAB_EXPORT_ATTEMPT_CHANGED);
      }
      if (pendingAttempt.dispatchedAt) {
        try {
          reconciledCommitId = await verifyExportAttempt(
            pendingAttempt,
            userId
          );
        } catch (error) {
          if (
            error instanceof Error &&
            error.message === GITLAB_EXPORT_ATTEMPT_CHANGED
          ) {
            throw error;
          }
          throw new Error(GITLAB_EXPORT_ATTEMPT_UNCERTAIN, { cause: error });
        }
        await finalizeExportAttempt(pendingAttempt, reconciledCommitId);
      } else {
        await discardExportAttempt(pendingAttempt);
      }
    }
    const [trackedFiles, ops] = await Promise.all([
      db
        .select()
        .from(projectFiles)
        .where(eq(projectFiles.projectId, projectId)),
      db
        .select()
        .from(projectFilePendingOperations)
        .where(eq(projectFilePendingOperations.projectId, projectId)),
    ]);
    if (ops.some((op) => op.attemptStartedAt !== null)) {
      // Legacy attempts cannot be reconstructed from potentially newer edits.
      throw new Error(GITLAB_EXPORT_ATTEMPT_UNCERTAIN);
    }
    const files = trackedFiles.filter((file) => file.source === "GITLAB");
    const opsByFileId = new Map(ops.map((op) => [op.projectFileId, op]));
    const previousPrefix = computeCommonDirectoryPrefix(
      files.flatMap((file) => {
        const op = opsByFileId.get(file.id);
        if (op?.operation === "CREATE") return [];
        return [op?.remoteBasePath ?? file.remoteFilePath ?? file.filePath];
      })
    );

    // Active (non-tombstoned) files for label patching and generated files.
    const activeFiles = files.filter((f) => !f.deletedAt);

    // Get all labels with projectFileId, conditions and effects for variable patching
    const projectLabels = await db
      .select({
        id: labels.id,
        contentHash: labels.contentHash,
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

    const renderFile = (file: ProjectFileRow) =>
      buildPushedContent(file, labelsByFile.get(file.id) ?? [], excludedTags);

    // Dispatch and store the same rendered bytes for every action.
    const plan = buildPlannedActions(files, ops, excludedTags, renderFile);

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
      const content = renderFile(file);
      const remoteHash = remoteContentBaselineHash(file);
      if (remoteHash === null || calculateContentHash(content) === remoteHash) {
        continue;
      }
      plan.actions.push({ action: "update", filePath: file.filePath, content });
      plan.contentUpdatedFiles.push({ file, content });
    }

    // A missing target is created from the default branch at commit time.
    // Read that base so updates are not treated as 404 conflicts.
    const base = await resolveExportContentBranch(
      projectId,
      userId,
      targetBranch,
      defaultBranch,
      repository
    );

    // Determine the directory prefix for generated files (e.g. "game/")
    const fileDirPrefix = computeCommonDirectoryPrefix(
      activeFiles.map((f) => f.filePath)
    );

    const generated = await fetchSupportingFileSources(projectId);

    // Export consistency: an excluded DB character without any current
    // active source-owned global declaration would silently disappear
    // from the remote tree. Fail with an actionable conflict before any
    // remote write.
    assertExcludedCharactersHaveSourceOwnership(
      generated.projectCharacters,
      excludedTags,
      activeFiles.map((file) => ({
        filePath: file.filePath,
        content: file.content,
      }))
    );

    const occupiedPaths = new Set(
      [
        ...trackedFiles.flatMap((file) => [file.filePath, file.remoteFilePath]),
        ...ops.flatMap((op) => [op.localPath, op.remoteBasePath]),
        ...plan.actions.flatMap((action) => [
          action.filePath,
          action.previousPath,
        ]),
      ].flatMap((path) => (path ? [path.toLowerCase()] : []))
    );

    // Generated files share the single atomic commit.
    const generatedActions = await buildGeneratedActions(
      projectId,
      userId,
      base.revision,
      fileDirPrefix,
      previousPrefix,
      generated,
      activeFiles,
      occupiedPaths,
      excludedTags,
      repository
    );

    // Preflight each affected source against the stored per-file remote
    // content baseline. The preflight also returns the actual remote content
    // for update paths so identical plain updates can be dropped after
    // conflict checks succeed.
    if (plan.actions.length > 0) {
      const remoteContents = await preflightConflicts(
        projectId,
        userId,
        base.revision,
        files,
        plan,
        repository
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
      const updatedPaths = new Set(
        plan.actions
          .filter((action) => action.action === "update")
          .map((action) => action.filePath)
      );
      const captureFile = (
        file: ProjectFileRow,
        content: string,
        changedRemote: boolean,
        op?: PendingOpRow
      ): GitlabExportAttemptSnapshot["files"][number] => ({
        id: file.id,
        path: file.filePath,
        pushedHash: file.contentHash,
        content,
        changedRemote,
        previousRemotePath: file.remoteFilePath,
        previousRemoteBranch: file.remoteBranch,
        previousRemoteRevision: file.remoteRevision,
        previousRemoteHash: file.remoteContentHash,
        previousPushedHash: file.lastPushedContentHash,
        ...(op
          ? {
              pending: {
                id: op.id,
                operation: op.operation,
                remoteBasePath: op.remoteBasePath,
                localPath: op.localPath,
                updatedAt: op.updatedAt.toISOString(),
              },
            }
          : {}),
      });
      const capturedFiles = [
        ...plan.operations.map(({ file, content, op }) => {
          if (!file) throw new Error(GITLAB_EXPORT_ATTEMPT_CHANGED);
          return captureFile(file, content, true, op);
        }),
        ...plan.contentUpdatedFiles.map(({ file, content }) =>
          captureFile(file, content, updatedPaths.has(file.filePath))
        ),
      ];
      const activeIds = new Set(
        capturedFiles
          .filter((file) => file.pending?.operation !== "DELETE")
          .map((file) => file.id)
      );
      const capturedLabels = projectLabels.flatMap((label) =>
        label.projectFileId &&
        activeIds.has(label.projectFileId) &&
        label.contentHash
          ? [
              {
                id: label.id,
                fileId: label.projectFileId,
                hash: label.contentHash,
              },
            ]
          : []
      );
      const capturedLines =
        capturedLabels.length > 0
          ? await db
              .select({
                id: labelLines.id,
                labelId: labelLines.labelId,
                hash: labelLines.contentHash,
              })
              .from(labelLines)
              .where(
                and(
                  inArray(
                    labelLines.labelId,
                    capturedLabels.map(({ id }) => id)
                  ),
                  isNull(labelLines.deletedAt)
                )
              )
          : [];
      const before = await captureExportPreimages(
        projectId,
        userId,
        repository,
        base.revision,
        allActions,
        capturedFiles
          .filter((file) => !file.changedRemote)
          .map(({ path }) => path)
      );
      const attempt = await prepareExportAttempt({
        projectId,
        operationId: operation.id,
        ...repository,
        branch: targetBranch,
        baseRevision: base.revision,
        branchExisted: base.branchExisted,
        message: `${message.trimEnd()}

BranchForge-Export-Attempt: ${randomUUID()}`,
        snapshot: {
          version: 1,
          actions: guardExportActions(allActions, before),
          before,
          files: capturedFiles,
          labels: capturedLabels,
          lines: capturedLines.flatMap((line) =>
            line.hash ? [{ ...line, hash: line.hash }] : []
          ),
        },
      });
      await claimExportAttempt(attempt);

      let commitId: string | null;
      try {
        commitId = await batchCommitFiles(
          projectId,
          userId,
          targetBranch,
          attempt.message,
          attempt.snapshot.actions,
          undefined,
          {
            repository,
            baseRevision: base.revision,
            branchExisted: base.branchExisted,
            verifyMovedReceipt: async (commitId) => {
              await recordExportAttemptReceipt(attempt, commitId);
              await verifyExportAttempt(
                { ...attempt, commitId, dispatchedAt: new Date() },
                userId
              );
            },
          }
        );
      } catch (error) {
        if (error instanceof GitLabCommitNotSentError) {
          await discardExportAttempt(attempt, true);
          throw error;
        }
        if (error instanceof GitLabCommitRejectedError) {
          await discardExportAttempt(attempt, true);
          if (generatedActions.length > 0) {
            const recheck = base.branchExisted
              ? targetBranch
              : await resolveExportContentBranch(
                  projectId,
                  userId,
                  targetBranch,
                  defaultBranch,
                  repository
                ).then(
                  ({ branch }) => branch,
                  () => null
                );
            if (recheck) {
              const conflict = await findGeneratedCommitConflict(
                projectId,
                userId,
                recheck,
                generatedActions,
                repository
              );
              if (conflict) throw conflict;
            }
          }
          throw error;
        }
        throw new Error(GITLAB_EXPORT_ATTEMPT_UNCERTAIN, { cause: error });
      }

      if (!commitId) throw new Error(GITLAB_EXPORT_ATTEMPT_UNCERTAIN);
      await recordExportAttemptReceipt(attempt, commitId);
      await finalizeExportAttempt(attempt, commitId);
      return { ...operation, status: "COMPLETED", conflictCount: 0, commitId };
    }

    // Nothing to push: advance baselines for content-only files whose update
    // was omitted because the remote is already up to date.
    if (plan.contentUpdatedFiles.length > 0) {
      await db.transaction(async (tx) => {
        await lockProject(tx, projectId);
        await assertNoPendingExportAttempt(tx, projectId);
        await advanceContentUpdatedBaselines(
          tx,
          plan.contentUpdatedFiles,
          base.branch
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
      ...(reconciledCommitId ? { commitId: reconciledCommitId } : {}),
    });
    return {
      ...operation,
      status: "COMPLETED",
      conflictCount: 0,
      ...(reconciledCommitId
        ? { commitId: reconciledCommitId }
        : { noChanges: true }),
    };
  } catch (error) {
    logError("gitlab_export.failed", { projectId, branch }, error);
    const errorMessage = toUserFacingExportError(error);
    const [failed] = await db
      .update(gitlabSyncOperations)
      .set({ status: "FAILED", errorMessage, completedAt: new Date() })
      .where(
        and(
          eq(gitlabSyncOperations.id, operation.id),
          ne(gitlabSyncOperations.status, "COMPLETED")
        )
      )
      .returning({ id: gitlabSyncOperations.id });
    // A concurrent retry may have finalized the original request.
    if (!failed) {
      const completed = await getSyncOperation(operation.id, userId);
      if (completed?.status === "COMPLETED") return completed;
    }
    // Pending rows, tombstones and baselines are preserved untouched.
    return {
      ...operation,
      status: "FAILED",
      errorMessage,
    };
  }
}
