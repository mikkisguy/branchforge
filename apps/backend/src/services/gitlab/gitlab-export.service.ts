import {
  GITLAB_EXPORT_RECOVERY_REQUIRED,
  type GitlabExportReview,
} from "@branchforge/shared";
import { createHash, randomUUID } from "node:crypto";
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
  characters,
  gitlabRepositories,
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
import {
  projectCharacterSourcePreservation,
  applyCharacterSourceProjection,
} from "../character-source-preservation.service.js";

import {
  managedVariableDefaultValues,
  managedStatDefaultValues,
} from "../managed-defaults.service.js";
import { readSupportingFileSources } from "../export-sources.service.js";
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
  GitLabBranchCreationUncertainError,
  GitLabBranchCreationRejectedError,
} from "./gitlab-file.service.js";
import type { BatchCommitAction } from "./gitlab-file.service.js";
import {
  buildGeneratedActions,
  findGeneratedCommitConflict,
} from "./gitlab-generated-export.js";
import {
  advanceCapturedLabelBaselines,
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
  validateNoopExportBaselines,
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
  ConflictError,
  NotFoundError,
  RepositoryNotLinkedError,
} from "../../middleware/error-handler.middleware.js";
import type { Transaction } from "../../db/types.js";
import {
  GitLabExportConflictError,
  GITLAB_EXPORT_BRANCH_UNCERTAIN,
  GITLAB_EXPORT_BRANCH_COMMIT_REJECTED,
  GITLAB_EXPORT_BRANCH_CREATE_REJECTED,
  GITLAB_EXPORT_ATTEMPT_CHANGED,
  GitLabRepositoryChangedError,
  GITLAB_EXPORT_REVIEW_STALE,
  GITLAB_EXPORT_ATTEMPT_UNCERTAIN,
  GITLAB_EXPORT_HISTORY_IN_PROGRESS,
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

export { GITLAB_EXPORT_REVIEW_STALE } from "./gitlab-error.helpers.js";
function staleReview(): ConflictError {
  const error = new ConflictError(GITLAB_EXPORT_REVIEW_STALE);
  error.userMessage = GITLAB_EXPORT_REVIEW_STALE;
  return error;
}

/** Local rendering and maintenance inputs, read together by review and admission. */
async function readLocalExportInputs(db: Transaction, projectId: string) {
  const [rawFiles, ops] = await Promise.all([
    db
      .select()
      .from(projectFiles)
      .where(eq(projectFiles.projectId, projectId))
      .orderBy(projectFiles.filePath),
    db
      .select()
      .from(projectFilePendingOperations)
      .where(eq(projectFilePendingOperations.projectId, projectId))
      .orderBy(
        projectFilePendingOperations.remoteBasePath,
        projectFilePendingOperations.localPath
      ),
  ]);
  const [settings] = await db
    .select()
    .from(projectSettings)
    .where(eq(projectSettings.projectId, projectId));
  const rawCharacters = await db
    .select()
    .from(characters)
    .where(eq(characters.projectId, projectId))
    .orderBy(characters.renpyTag);
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
    .where(and(eq(labels.projectId, projectId), isNull(labels.deletedAt)))
    .orderBy(labels.id);

  const generatedInputs = await readSupportingFileSources(db, projectId);
  return {
    rawFiles,
    ops,
    settings,
    rawCharacters,
    projectLabels,
    generatedInputs,
  };
}

function localExportFingerprint(
  inputs: Awaited<ReturnType<typeof readLocalExportInputs>>
) {
  return calculateContentHash(
    JSON.stringify({
      files: inputs.rawFiles.map((file) => ({
        id: file.id,
        source: file.source,
        filePath: file.filePath,
        content: file.content,
        contentHash: file.contentHash,
        deletedAt: file.deletedAt,
        remoteFilePath: file.remoteFilePath,
        remoteBranch: file.remoteBranch,
        remoteRevision: file.remoteRevision,
        remoteContent: file.remoteContent,
        remoteContentHash: file.remoteContentHash,
        originalContent: file.originalContent,
        lastPushedContentHash: file.lastPushedContentHash,
        hasRemoteConflict: file.hasRemoteConflict,
        characterDefinitions: file.characterDefinitions,
        legacyZipUntouched:
          file.source === "ZIP"
            ? file.createdAt.getTime() === file.updatedAt.getTime()
            : undefined,
      })),
      operations: inputs.ops,
      settings: {
        excludedTags:
          inputs.settings?.excludedCharacterTags ?? DEFAULT_EXCLUDED_RENPY_TAGS,
        characterSourcePreservationVersion:
          inputs.settings?.characterSourcePreservationVersion,
        managedDefaultsRecovered: inputs.settings?.managedDefaultsRecovered,
      },
      characters: inputs.rawCharacters.map(
        ({ id, renpyTag, name, nameType, color, sourceDefinition }) => ({
          id,
          renpyTag,
          name,
          nameType,
          color,
          sourceDefinition,
        })
      ),
      // Baseline-only hash changes are preserved by finalization's CAS. The
      // fields used to render source remain admission dependencies.
      labels: inputs.projectLabels.map((label) => ({
        id: label.id,
        title: label.title,
        labelName: label.labelName,
        conditions: label.conditions,
        effects: label.effects,
        projectFileId: label.projectFileId,
      })),
      generated: inputs.generatedInputs,
    })
  );
}

async function readExportPlanSnapshot(projectId: string, branch?: string) {
  return getDb().transaction(
    async (db) => {
      await assertNoPendingExportAttempt(
        db,
        projectId,
        GITLAB_EXPORT_RECOVERY_REQUIRED
      );
      const [repoLink] = await db
        .select()
        .from(gitlabRepositories)
        .where(eq(gitlabRepositories.projectId, projectId));
      if (!repoLink) throw new RepositoryNotLinkedError();
      const repository = gitlabRepositoryIdentity(repoLink);
      const defaultBranch = repoLink.defaultBranch || "main";
      const targetBranch = branch || defaultBranch;
      const inputs = await readLocalExportInputs(db, projectId);
      const { rawFiles, ops, settings, rawCharacters, projectLabels } = inputs;
      const localFingerprint = localExportFingerprint(inputs);
      if (ops.some((op) => op.attemptStartedAt !== null)) {
        // Legacy attempts cannot be reconstructed from potentially newer edits.
        throw new Error(GITLAB_EXPORT_ATTEMPT_UNCERTAIN);
      }
      const maintenance = projectCharacterSourcePreservation(
        rawFiles.filter((file) => !file.deletedAt),
        rawCharacters,
        settings
      );
      const trackedFiles = rawFiles.map((file) => ({
        ...file,
        ...maintenance.fileUpdates.find((update) => update.id === file.id)
          ?.values,
      })) as ProjectFileRow[];
      const excludedTags = new Set(
        settings?.excludedCharacterTags ?? DEFAULT_EXCLUDED_RENPY_TAGS
      );
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
        if (
          remoteHash === null ||
          calculateContentHash(content) === remoteHash
        ) {
          continue;
        }
        plan.actions.push({
          action: "update",
          filePath: file.filePath,
          content,
        });
        plan.contentUpdatedFiles.push({ file, content });
      }

      const activeIds = new Set([
        ...plan.operations.flatMap(({ file, op }) =>
          file && op.operation !== "DELETE" ? [file.id] : []
        ),
        ...plan.contentUpdatedFiles.map(({ file }) => file.id),
      ]);
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
      capturedLines.sort((a, b) => a.id.localeCompare(b.id));
      const labelBaselines = {
        labels: capturedLabels,
        lines: capturedLines.flatMap((line) =>
          line.hash ? [{ ...line, hash: line.hash }] : []
        ),
      };

      return {
        inputs,
        repository,
        defaultBranch,
        targetBranch,
        localFingerprint,
        maintenance,
        trackedFiles,
        excludedTags,
        files,
        previousPrefix,
        activeFiles,
        plan,
        labelBaselines,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}

async function planGitlabExport(
  projectId: string,
  userId: string,
  branch?: string
) {
  const {
    inputs,
    repository,
    defaultBranch,
    targetBranch,
    localFingerprint,
    maintenance,
    trackedFiles,
    excludedTags,
    files,
    previousPrefix,
    activeFiles,
    plan,
    labelBaselines,
  } = await readExportPlanSnapshot(projectId, branch);
  const { ops, rawCharacters } = inputs;

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

  const generated = structuredClone(inputs.generatedInputs);
  const generatedInputs = structuredClone(generated);
  generated.projectVariables.sort((a, b) => a.key.localeCompare(b.key));
  generated.projectStats.sort((a, b) => a.key.localeCompare(b.key));
  generated.projectCharacters.sort((a, b) =>
    a.renpyTag.localeCompare(b.renpyTag)
  );
  for (const [declarations, legacy] of [
    [maintenance.currentDefaults, false],
    [maintenance.legacyDefaults, true],
  ] as const) {
    for (const declaration of declarations) {
      if (declaration.kind === "variable") {
        const row = generated.projectVariables.find(
          (row) => row.key === declaration.key
        );
        if (row && row.authoredDefault === null)
          row.authoredDefault = declaration.value === "True";
        else if (!row && !legacy)
          generated.projectVariables.push({
            ...managedVariableDefaultValues(declaration),
            description: null,
            category: null,
          });
      } else {
        const row = generated.projectStats.find(
          (row) => row.key === declaration.key
        );
        if (row && row.authoredDefault === null)
          row.authoredDefault = declaration.value;
        else if (!row && !legacy)
          generated.projectStats.push({
            ...managedStatDefaultValues(declaration),
            description: null,
          });
      }
    }
  }
  for (const update of maintenance.characterUpdates) {
    const raw = rawCharacters.find((row) => row.id === update.id)!;
    const row = generated.projectCharacters.find(
      (row) => row.renpyTag === raw.renpyTag
    )!;
    Object.assign(row, update.values);
  }
  generated.projectVariables.sort((a, b) => a.key.localeCompare(b.key));
  generated.projectStats.sort((a, b) => a.key.localeCompare(b.key));
  const beforeByPath = new Map<
    string,
    GitlabExportAttemptSnapshot["before"][number]
  >();

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
    repository,
    (path, remote) => {
      beforeByPath.set(path, {
        path,
        hash:
          remote.content === null ? null : calculateContentHash(remote.content),
        ...(remote.lastCommitId ? { lastCommitId: remote.lastCommitId } : {}),
      });
    }
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

  const updatedPaths = new Set(
    plan.actions
      .filter((action) => action.action === "update")
      .map((action) => action.filePath)
  );
  const capturedFiles = [
    ...plan.operations.map(({ file, content, op }) => {
      if (!file) throw new Error(GITLAB_EXPORT_ATTEMPT_CHANGED);
      return captureFile(file, content, true, op);
    }),
    ...plan.contentUpdatedFiles.map(({ file, content }) =>
      captureFile(file, content, updatedPaths.has(file.filePath))
    ),
  ];
  const actionPreimages = await captureExportPreimages(
    projectId,
    userId,
    repository,
    base.revision,
    allActions,
    capturedFiles.filter((file) => !file.changedRemote).map(({ path }) => path)
  );
  for (const file of actionPreimages) beforeByPath.set(file.path, file);
  const before = [...beforeByPath.values()].sort((a, b) =>
    a.path.localeCompare(b.path)
  );
  const actions = guardExportActions(allActions, before);
  const reviewToken = createHash("sha256")
    .update(
      JSON.stringify({
        projectId,
        repository,
        targetBranch,
        branchExisted: base.branchExisted,
        newBranchBase: base.branchExisted ? null : base,
        actions,
        before,
        generatedInputs,
        localFingerprint,
        maintenance,
        files: capturedFiles,
        labelBaselines,
        excludedTags: [...excludedTags].sort(),
      })
    )
    .digest("hex");
  return {
    plan,
    generatedActions,
    allActions: actions,
    capturedFiles,
    before,
    labelBaselines,
    base,
    repository,
    defaultBranch,
    targetBranch,
    maintenance,
    localFingerprint,
    reviewToken,
  };
}

/** Recheck every consumed local dependency under the project lock before writes. */
async function validateLocalExportPlan(
  tx: Transaction,
  projectId: string,
  planned: Awaited<ReturnType<typeof planGitlabExport>>
): Promise<void> {
  // Label/line saves lock files without taking the project lock. Maintenance
  // consumes every active source, so hold those rows before reading inputs.
  await tx
    .select({ id: projectFiles.id })
    .from(projectFiles)
    .where(eq(projectFiles.projectId, projectId))
    .orderBy(projectFiles.id)
    .for("update");
  // Keep direct row guards for recovery as well as the shared project lock.
  const recoveryIds = planned.maintenance.characterUpdates.map(({ id }) => id);
  if (recoveryIds.length > 0) {
    await tx
      .select({ id: characters.id })
      .from(characters)
      .where(
        and(
          eq(characters.projectId, projectId),
          inArray(characters.id, recoveryIds)
        )
      )
      .orderBy(characters.id)
      .for("update");
  }
  const current = await readLocalExportInputs(tx, projectId);
  if (localExportFingerprint(current) !== planned.localFingerprint)
    throw staleReview();
  const [link] = await tx
    .select()
    .from(gitlabRepositories)
    .where(eq(gitlabRepositories.projectId, projectId));
  if (!link) throw staleReview();
  assertGitlabRepositoryIdentity(planned.repository, link);
  if (
    !planned.base.branchExisted &&
    (link.defaultBranch || "main") !== planned.defaultBranch
  )
    throw staleReview();
}

/** A no-op has no commit guards, so observe its remote baselines again. */
async function validateNoopRemotePlan(
  projectId: string,
  userId: string,
  planned: Awaited<ReturnType<typeof planGitlabExport>>
) {
  const currentBase = await resolveExportContentBranch(
    projectId,
    userId,
    planned.targetBranch,
    planned.defaultBranch,
    planned.repository
  );
  if (
    currentBase.branchExisted !== planned.base.branchExisted ||
    (!currentBase.branchExisted &&
      currentBase.revision !== planned.base.revision)
  )
    throw staleReview();
  const expected = new Map(planned.before.map((file) => [file.path, file]));
  const current = await captureExportPreimages(
    projectId,
    userId,
    planned.repository,
    currentBase.revision,
    [],
    [...expected.keys()]
  );
  if (
    current.some((file) => {
      const previous = expected.get(file.path)!;
      return (
        file.hash !== previous.hash ||
        (file.lastCommitId ?? null) !== (previous.lastCommitId ?? null)
      );
    })
  )
    throw staleReview();
}

export async function reviewGitlabExport(
  projectId: string,
  userId: string,
  branch?: string
): Promise<GitlabExportReview> {
  await requireProjectOwnership(projectId, userId);
  const planned = await planGitlabExport(projectId, userId, branch);
  return {
    projectId,
    repository: planned.repository,
    targetBranch: planned.targetBranch,
    branchExisted: planned.base.branchExisted,
    baseBranch: planned.base.branchExisted ? null : planned.defaultBranch,
    actions: planned.allActions.map(({ action, filePath, previousPath }) => ({
      action,
      filePath,
      ...(previousPath ? { previousPath } : {}),
    })),
    reviewToken: planned.reviewToken,
  };
}

/** Explicit recovery only: never plans or dispatches another remote write. */
export async function recoverGitlabExport(
  projectId: string,
  userId: string
): Promise<boolean> {
  await requireProjectOwnership(projectId, userId);
  const attempt = await getPendingExportAttempt(projectId);
  if (!attempt) return false;
  const link = await getRepositoryLink(projectId);
  if (!link) throw new RepositoryNotLinkedError();
  assertGitlabRepositoryIdentity(attempt, link);
  if (!attempt.dispatchedAt) {
    await discardExportAttempt(attempt);
    return true;
  }
  const commitId = await verifyExportAttempt(attempt, userId);
  await finalizeExportAttempt(attempt, commitId);
  return true;
}

export async function exportToGitlab(
  projectId: string,
  userId: string,
  branch?: string,
  commitMessage?: string,
  reviewToken?: string
): Promise<SyncOperation> {
  await requireProjectOwnership(projectId, userId);

  // Public confirmation validates before maintenance, history, or remote writes.
  const validatedPlan =
    reviewToken === undefined
      ? null
      : await planGitlabExport(projectId, userId, branch).catch(
          (error: unknown) => {
            if (
              error instanceof GitLabExportConflictError ||
              error instanceof RepositoryNotLinkedError ||
              error instanceof GitLabRepositoryChangedError
            )
              throw staleReview();
            throw error;
          }
        );
  if (validatedPlan && validatedPlan.reviewToken !== reviewToken)
    throw staleReview();
  if (validatedPlan) {
    await getDb()
      .transaction(async (tx) => {
        await lockProject(tx, projectId);
        await assertNoPendingExportAttempt(tx, projectId);
        await validateLocalExportPlan(tx, projectId, validatedPlan);
      })
      .catch((error: unknown) => {
        if (error instanceof GitLabRepositoryChangedError) throw staleReview();
        throw error;
      });
  }

  const db = getDb();
  const message =
    commitMessage || `Export from BranchForge - ${new Date().toISOString()}`;

  // Resolve the target branch (existing or new non-default branch)
  let targetBranch = validatedPlan?.targetBranch ?? branch;
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

  let attemptRetained = false;
  try {
    const repoLink = await getRepositoryLink(projectId);
    if (!repoLink) throw new RepositoryNotLinkedError();
    if (validatedPlan)
      assertGitlabRepositoryIdentity(validatedPlan.repository, repoLink);
    const repository = gitlabRepositoryIdentity(repoLink);
    const defaultBranch = repoLink.defaultBranch || "main";
    const pendingAttempt = await getPendingExportAttempt(projectId);
    let reconciledCommitId: string | null = null;
    if (pendingAttempt) {
      if (validatedPlan) throw staleReview();
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
            (error.message === GITLAB_EXPORT_ATTEMPT_CHANGED ||
              error.message === GITLAB_EXPORT_HISTORY_IN_PROGRESS)
          ) {
            throw error;
          }
          throw new Error(GITLAB_EXPORT_ATTEMPT_UNCERTAIN, { cause: error });
        }
        if (
          (await finalizeExportAttempt(pendingAttempt, reconciledCommitId)) ===
          "already-completed"
        ) {
          const original = await getSyncOperation(
            pendingAttempt.operationId,
            userId
          );
          if (!original) throw new Error(GITLAB_EXPORT_ATTEMPT_CHANGED);
          await updateSyncOperation(operation.id, { status: "COMPLETED" });
          return original;
        }
      } else {
        await discardExportAttempt(pendingAttempt);
      }
    }
    const planned =
      validatedPlan ??
      (await planGitlabExport(projectId, userId, targetBranch));
    const {
      plan,
      generatedActions,
      allActions,
      capturedFiles,
      before,
      labelBaselines,
      base,
    } = planned;
    const applyAdmittedMaintenance = async (tx: Transaction) => {
      await validateLocalExportPlan(tx, projectId, planned);
      await applyCharacterSourceProjection(tx, projectId, planned.maintenance);
    };

    if (allActions.length > 0) {
      const attempt = await prepareExportAttempt(
        {
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
            actions: allActions,
            before,
            files: capturedFiles,
            ...labelBaselines,
          },
        },
        applyAdmittedMaintenance
      );
      attemptRetained = true;
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
          attemptRetained = false;
          throw error;
        }
        if (error instanceof GitLabBranchCreationUncertainError) {
          throw new Error(GITLAB_EXPORT_BRANCH_UNCERTAIN, { cause: error });
        }
        if (error instanceof GitLabCommitRejectedError) {
          await discardExportAttempt(attempt, true);
          attemptRetained = false;
          if (error instanceof GitLabBranchCreationRejectedError)
            throw new Error(GITLAB_EXPORT_BRANCH_CREATE_REJECTED, {
              cause: error,
            });
          if (error.branchCreated)
            throw new Error(GITLAB_EXPORT_BRANCH_COMMIT_REJECTED, {
              cause: error,
            });
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
        if (
          error instanceof Error &&
          error.message === GITLAB_EXPORT_HISTORY_IN_PROGRESS
        ) {
          throw error;
        }
        throw new Error(GITLAB_EXPORT_ATTEMPT_UNCERTAIN, { cause: error });
      }

      if (!commitId) throw new Error(GITLAB_EXPORT_ATTEMPT_UNCERTAIN);
      await recordExportAttemptReceipt(attempt, commitId);
      await finalizeExportAttempt(attempt, commitId);
      return { ...operation, status: "COMPLETED", conflictCount: 0, commitId };
    }

    // Release the remote reads before taking admission locks. Local inputs
    // are checked again under the lock before saving the observed baselines.
    await validateNoopRemotePlan(projectId, userId, planned);
    await db.transaction(async (tx) => {
      await lockProject(tx, projectId);
      await assertNoPendingExportAttempt(tx, projectId);
      await applyAdmittedMaintenance(tx);
      if (plan.contentUpdatedFiles.length > 0) {
        await validateNoopExportBaselines(
          tx,
          projectId,
          plan.contentUpdatedFiles.map(({ file, content }) =>
            captureFile(file, content, false)
          )
        );
        await advanceContentUpdatedBaselines(
          tx,
          plan.contentUpdatedFiles,
          base.branch
        );
        await advanceCapturedLabelBaselines(tx, labelBaselines);
      }
    });

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
  } catch (cause) {
    const repositoryError =
      cause instanceof GitLabCommitNotSentError ? cause.cause : cause;
    const error =
      reviewToken &&
      !attemptRetained &&
      (repositoryError instanceof GitLabRepositoryChangedError ||
        repositoryError instanceof RepositoryNotLinkedError)
        ? staleReview()
        : cause;
    const errorMessage = toUserFacingExportError(error);
    // Drizzle can embed raw bound parameters, including saved scripts, in
    // the message, stack and cause. Log only the sanitized classification.
    logError("gitlab_export.failed", { projectId, branch, errorMessage });
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
    if (
      reviewToken &&
      error instanceof ConflictError &&
      error.userMessage === GITLAB_EXPORT_REVIEW_STALE
    ) {
      throw error;
    }
    // Pending rows, tombstones and baselines are preserved untouched.
    return {
      ...operation,
      status: "FAILED",
      errorMessage,
    };
  }
}
