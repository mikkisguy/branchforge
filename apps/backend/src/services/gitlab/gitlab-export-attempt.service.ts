import { and, count, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  gitlabExportAttempts,
  gitlabRepositories,
  gitlabSyncOperations,
  labelLines,
  labels,
  projectFilePendingOperations,
  projectFiles,
} from "../../db/schema/index.js";
import type { GitlabExportAttemptSnapshot } from "../../db/schema/index.js";
import type { Transaction } from "../../db/types.js";
import { calculateContentHash } from "../../lib/hash.js";
import {
  ConflictError,
  NotFoundError,
} from "../../middleware/error-handler.middleware.js";
import { lockProject } from "../project-files-operations.service.js";
import {
  GITLAB_EXPORT_ATTEMPT_CHANGED,
  GITLAB_EXPORT_ATTEMPT_UNCERTAIN,
  GITLAB_EXPORT_HISTORY_IN_PROGRESS,
} from "./gitlab-error.helpers.js";
import {
  assertGitlabRepositoryIdentity,
  getBranchCommitSha,
  getExportCommit,
  getFileContentWithMetadata,
} from "./gitlab-repository.service.js";
import type { GitlabRepositoryIdentity } from "./gitlab-repository.service.js";

type Attempt = typeof gitlabExportAttempts.$inferSelect;
type NewAttempt = typeof gitlabExportAttempts.$inferInsert;
type Snapshot = GitlabExportAttemptSnapshot;
type FileBaseline = Snapshot["files"][number];

const HISTORY_SEARCH_LIMIT = 40;

export async function getPendingExportAttempt(projectId: string) {
  const [attempt] = await getDb()
    .select()
    .from(gitlabExportAttempts)
    .where(eq(gitlabExportAttempts.projectId, projectId))
    .limit(1);
  return attempt;
}

/** Called while holding the project lock, before changing a remote baseline. */
export async function assertNoPendingExportAttempt(
  tx: Transaction | ReturnType<typeof getDb>,
  projectId: string,
  message = GITLAB_EXPORT_ATTEMPT_UNCERTAIN
): Promise<void> {
  const [attempt] = await tx
    .select({ id: gitlabExportAttempts.operationId })
    .from(gitlabExportAttempts)
    .where(eq(gitlabExportAttempts.projectId, projectId));
  if (attempt) {
    const conflict = new ConflictError(message);
    conflict.userMessage = message;
    throw conflict;
  }
}

/** A completed receipt commits with the new remote file baselines. */
export async function readExportGeneration(
  db: Transaction | ReturnType<typeof getDb>,
  projectId: string
): Promise<number> {
  const [row] = await db
    .select({ generation: count() })
    .from(gitlabSyncOperations)
    .where(
      and(
        eq(gitlabSyncOperations.projectId, projectId),
        eq(gitlabSyncOperations.operation, "EXPORT"),
        eq(gitlabSyncOperations.status, "COMPLETED"),
        isNotNull(gitlabSyncOperations.commitId)
      )
    );
  return row.generation;
}

function attemptKey(attempt: Pick<Attempt, "projectId" | "operationId">) {
  return and(
    eq(gitlabExportAttempts.projectId, attempt.projectId),
    eq(gitlabExportAttempts.operationId, attempt.operationId)
  );
}

async function checkRepository(
  tx: Transaction,
  attempt: Pick<Attempt, "projectId"> & GitlabRepositoryIdentity
): Promise<void> {
  const [link] = await tx
    .select()
    .from(gitlabRepositories)
    .where(eq(gitlabRepositories.projectId, attempt.projectId))
    .for("update");
  if (!link) throw new Error(GITLAB_EXPORT_ATTEMPT_CHANGED);
  assertGitlabRepositoryIdentity(attempt, link);
}

async function lockLocalBaselines(
  tx: Transaction,
  projectId: string,
  baselines: FileBaseline[],
  preparing = false
) {
  const ids = baselines.map(({ id }) => id).sort();
  const files =
    ids.length === 0
      ? []
      : await tx
          .select()
          .from(projectFiles)
          .where(
            and(
              eq(projectFiles.projectId, projectId),
              inArray(projectFiles.id, ids)
            )
          )
          .orderBy(projectFiles.id)
          .for("update");
  const pending =
    ids.length === 0
      ? []
      : await tx
          .select()
          .from(projectFilePendingOperations)
          .where(inArray(projectFilePendingOperations.projectFileId, ids))
          .orderBy(projectFilePendingOperations.projectFileId)
          .for("update");
  const filesById = new Map(files.map((file) => [file.id, file]));
  const pendingByFile = new Map(pending.map((op) => [op.projectFileId, op]));

  return baselines.map((baseline) => {
    const local = filesById.get(baseline.id);
    const pending = pendingByFile.get(baseline.id);
    const expected = baseline.pending;
    const samePending =
      pending?.id === expected?.id &&
      pending?.operation === expected?.operation &&
      pending?.remoteBasePath === expected?.remoteBasePath &&
      pending?.localPath === expected?.localPath &&
      pending?.updatedAt.toISOString() === expected?.updatedAt;
    if (
      !local ||
      local.source !== "GITLAB" ||
      local.remoteFilePath !== baseline.previousRemotePath ||
      local.remoteBranch !== baseline.previousRemoteBranch ||
      local.remoteRevision !== baseline.previousRemoteRevision ||
      local.remoteContentHash !== baseline.previousRemoteHash ||
      local.lastPushedContentHash !== baseline.previousPushedHash ||
      (preparing &&
        (!samePending ||
          local.filePath !== baseline.path ||
          local.contentHash !== baseline.pushedHash)) ||
      (pending
        ? pending.localPath !== local.filePath
        : local.filePath !== baseline.path) ||
      Boolean(local.deletedAt) !== (pending?.operation === "DELETE") ||
      (expected?.operation === "DELETE" && !samePending)
    ) {
      throw new Error(GITLAB_EXPORT_ATTEMPT_CHANGED);
    }
    return { baseline, local, pending, samePending };
  });
}

/** Admission effects share this transaction and roll back with failed guards. */
export async function prepareExportAttempt(
  attempt: NewAttempt,
  beforePrepare?: (tx: Transaction) => Promise<void>
): Promise<Attempt> {
  return getDb().transaction(async (tx) => {
    await lockProject(tx, attempt.projectId);
    await checkRepository(tx, attempt);
    await beforePrepare?.(tx);
    await lockLocalBaselines(
      tx,
      attempt.projectId,
      attempt.snapshot.files,
      true
    );
    const [inserted] = await tx
      .insert(gitlabExportAttempts)
      .values(attempt)
      .onConflictDoNothing()
      .returning();
    if (!inserted) throw new Error(GITLAB_EXPORT_ATTEMPT_UNCERTAIN);
    return inserted;
  });
}

export async function claimExportAttempt(attempt: Attempt): Promise<void> {
  const [row] = await getDb()
    .update(gitlabExportAttempts)
    .set({ dispatchedAt: new Date() })
    .where(and(attemptKey(attempt), isNull(gitlabExportAttempts.dispatchedAt)))
    .returning({ operationId: gitlabExportAttempts.operationId });
  if (!row) throw new Error(GITLAB_EXPORT_ATTEMPT_UNCERTAIN);
}

export async function discardExportAttempt(
  attempt: Attempt,
  definitelyRejected = false
): Promise<void> {
  const [removed] = await getDb()
    .delete(gitlabExportAttempts)
    .where(
      and(
        attemptKey(attempt),
        definitelyRejected
          ? undefined
          : isNull(gitlabExportAttempts.dispatchedAt)
      )
    )
    .returning({ operationId: gitlabExportAttempts.operationId });
  if (!removed) throw new Error(GITLAB_EXPORT_ATTEMPT_UNCERTAIN);
}

export async function recordExportAttemptReceipt(
  attempt: Attempt,
  commitId: string
): Promise<void> {
  const [row] = await getDb()
    .update(gitlabExportAttempts)
    .set({ commitId })
    .where(attemptKey(attempt))
    .returning({ operationId: gitlabExportAttempts.operationId });
  if (!row) throw new Error(GITLAB_EXPORT_ATTEMPT_UNCERTAIN);
}

function reduceExpectedPaths(snapshot: Snapshot): Snapshot["before"] {
  const hashes = new Map(snapshot.before.map(({ path, hash }) => [path, hash]));
  for (const action of snapshot.actions) {
    const source = action.previousPath ?? action.filePath;
    const previous = hashes.get(source);
    if (action.action === "delete") {
      hashes.set(source, null);
      continue;
    }
    if (action.action === "move") hashes.set(source, null);
    if (action.content !== undefined) {
      hashes.set(action.filePath, calculateContentHash(action.content));
    } else if (action.action === "move" && previous) {
      hashes.set(action.filePath, previous);
    } else {
      throw new Error(GITLAB_EXPORT_ATTEMPT_UNCERTAIN);
    }
  }
  return [...hashes].map(([path, hash]) => ({ path, hash }));
}

export async function captureExportPreimages(
  projectId: string,
  userId: string,
  repository: GitlabRepositoryIdentity,
  revision: string,
  actions: Snapshot["actions"],
  additionalPaths: string[] = []
): Promise<Snapshot["before"]> {
  const paths = new Set([
    ...actions.flatMap(({ filePath, previousPath }) =>
      previousPath ? [filePath, previousPath] : [filePath]
    ),
    ...additionalPaths,
  ]);
  const ordered = [...paths];
  const results: Snapshot["before"] = [];
  for (let index = 0; index < ordered.length; index += 5) {
    const batch = await Promise.allSettled(
      ordered.slice(index, index + 5).map(async (path) => {
        const { content, lastCommitId } = await getFileContentWithMetadata(
          projectId,
          userId,
          path,
          revision,
          undefined,
          repository
        );
        return {
          path,
          hash: content === null ? null : calculateContentHash(content),
          // GitLab's per-file guard accepts a real Git commit revision.
          ...(lastCommitId && /^[a-f0-9]{40}$/i.test(lastCommitId)
            ? { lastCommitId }
            : {}),
        };
      })
    );
    for (const result of batch) {
      if (result.status === "rejected") throw result.reason;
      results.push(result.value);
    }
  }
  return results;
}

export function guardExportActions(
  actions: Snapshot["actions"],
  preimages: Snapshot["before"]
): Snapshot["actions"] {
  const revisions = new Map(
    preimages.map(({ path, lastCommitId }) => [path, lastCommitId])
  );
  const produced = new Set<string>();
  return actions.map((action) => {
    const source = action.previousPath ?? action.filePath;
    const intermediate = produced.has(source);
    const lastCommitId = intermediate
      ? undefined
      : (action.lastCommitId ?? revisions.get(source));
    if (action.action !== "create" && !intermediate && !lastCommitId) {
      throw new Error(
        "GitLab did not provide the file revision required to protect this export. Refresh or recover before retrying."
      );
    }
    revisions.delete(source);
    revisions.delete(action.filePath);
    produced.delete(source);
    if (action.action !== "delete") produced.add(action.filePath);
    return action.action !== "create" && lastCommitId
      ? { ...action, lastCommitId }
      : action;
  });
}

async function matchesRemote(
  attempt: Attempt,
  userId: string,
  revision: string,
  expected: Snapshot["before"]
): Promise<boolean> {
  const paths = await captureExportPreimages(
    attempt.projectId,
    userId,
    attempt,
    revision,
    [],
    expected.map(({ path }) => path)
  );
  return expected.every(({ hash }, index) => paths[index].hash === hash);
}

export async function verifyExportAttempt(
  attempt: Attempt,
  userId: string
): Promise<string> {
  if (!attempt.dispatchedAt || attempt.snapshot.version !== 1) {
    throw new Error(GITLAB_EXPORT_ATTEMPT_UNCERTAIN);
  }

  let revision: string;
  try {
    revision = await getBranchCommitSha(
      attempt.projectId,
      userId,
      attempt.branch,
      undefined,
      attempt
    );
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw new Error(GITLAB_EXPORT_ATTEMPT_UNCERTAIN, { cause: error });
    }
    throw error;
  }
  const head = revision;
  const saved = attempt.verification;
  let match: { id: string; parent: string } | null = null;
  if (saved?.head === head && saved.receipt === attempt.commitId) {
    revision = saved.next;
    match = saved.match;
  }
  for (let depth = 0; depth < HISTORY_SEARCH_LIMIT; depth++) {
    if (revision === attempt.baseRevision) break;
    const commit = await getExportCommit(
      attempt.projectId,
      userId,
      attempt,
      revision
    );
    if (commit.id !== revision || !commit.parent_ids[0]) {
      throw new Error(GITLAB_EXPORT_ATTEMPT_UNCERTAIN);
    }
    if (
      commit.id === attempt.commitId ||
      (!attempt.commitId &&
        commit.message.trimEnd() === attempt.message.trimEnd())
    ) {
      if (match || commit.parent_ids.length !== 1) {
        throw new Error(GITLAB_EXPORT_ATTEMPT_UNCERTAIN);
      }
      match = { id: commit.id, parent: commit.parent_ids[0] };
    }
    revision = commit.parent_ids[0];
  }

  if (revision !== attempt.baseRevision) {
    const progress = { head, next: revision, receipt: attempt.commitId, match };
    // Progress belongs to one immutable chain and receipt.
    await getDb()
      .update(gitlabExportAttempts)
      .set({ verification: progress })
      .where(
        and(
          attemptKey(attempt),
          attempt.commitId
            ? eq(gitlabExportAttempts.commitId, attempt.commitId)
            : isNull(gitlabExportAttempts.commitId),
          saved
            ? sql`${gitlabExportAttempts.verification} = ${JSON.stringify(saved)}::jsonb`
            : isNull(gitlabExportAttempts.verification)
        )
      );
    throw new Error(GITLAB_EXPORT_HISTORY_IN_PROGRESS);
  }
  if (!match) throw new Error(GITLAB_EXPORT_ATTEMPT_UNCERTAIN);
  if (
    !(await matchesRemote(
      attempt,
      userId,
      match.parent,
      attempt.snapshot.before
    ))
  ) {
    throw new Error(GITLAB_EXPORT_ATTEMPT_UNCERTAIN);
  }
  if (
    !(await matchesRemote(
      attempt,
      userId,
      match.id,
      reduceExpectedPaths(attempt.snapshot)
    ))
  ) {
    throw new Error(GITLAB_EXPORT_ATTEMPT_UNCERTAIN);
  }
  return match.id;
}

export async function finalizeExportAttempt(
  attempt: Attempt,
  commitId: string
): Promise<"finalized" | "already-completed"> {
  return getDb().transaction(async (tx) => {
    await lockProject(tx, attempt.projectId);
    const [current] = await tx
      .select()
      .from(gitlabExportAttempts)
      .where(attemptKey(attempt))
      .for("update");
    if (!current) {
      const [original] = await tx
        .select({
          status: gitlabSyncOperations.status,
          commitId: gitlabSyncOperations.commitId,
        })
        .from(gitlabSyncOperations)
        .where(
          and(
            eq(gitlabSyncOperations.id, attempt.operationId),
            eq(gitlabSyncOperations.projectId, attempt.projectId)
          )
        );
      if (original?.status === "COMPLETED" && original.commitId === commitId) {
        return "already-completed";
      }
      throw new Error(GITLAB_EXPORT_ATTEMPT_CHANGED);
    }
    await checkRepository(tx, attempt);
    if (
      !current.dispatchedAt ||
      (current.commitId && current.commitId !== commitId)
    ) {
      throw new Error(GITLAB_EXPORT_ATTEMPT_CHANGED);
    }

    const snapshot = current.snapshot;
    const baselines = await lockLocalBaselines(
      tx,
      attempt.projectId,
      snapshot.files
    );
    for (const { baseline: file, local, pending, samePending } of baselines) {
      if (file.pending?.operation === "DELETE") {
        await tx.delete(projectFiles).where(eq(projectFiles.id, file.id));
        continue;
      }
      await tx
        .update(projectFiles)
        .set({
          remoteFilePath: file.path,
          remoteBranch: attempt.branch,
          ...(file.changedRemote ? { remoteRevision: commitId } : {}),
          remoteContent: file.content,
          remoteContentHash: calculateContentHash(file.content),
          lastPushedContentHash: file.pushedHash,
          hasRemoteConflict: false,
          updatedAt: new Date(),
        })
        .where(eq(projectFiles.id, file.id));

      if (!pending) continue;
      if (samePending || (!local.deletedAt && local.filePath === file.path)) {
        await tx
          .delete(projectFilePendingOperations)
          .where(eq(projectFilePendingOperations.id, pending.id));
      } else {
        // A later rename or soft delete starts from the path now in GitLab.
        // Keep the newer row and its deletion snapshots.
        await tx
          .update(projectFilePendingOperations)
          .set({
            operation: local.deletedAt ? "DELETE" : "RENAME",
            remoteBasePath: file.path,
            updatedAt: new Date(),
          })
          .where(eq(projectFilePendingOperations.id, pending.id));
      }
    }

    await advanceCapturedLabelBaselines(tx, snapshot);
    await tx
      .update(gitlabSyncOperations)
      .set({
        commitId,
        status: "COMPLETED",
        errorMessage: null,
        completedAt: new Date(),
      })
      .where(eq(gitlabSyncOperations.id, attempt.operationId));
    await tx.delete(gitlabExportAttempts).where(attemptKey(attempt));
    return "finalized";
  });
}

export async function advanceCapturedLabelBaselines(
  tx: Transaction,
  snapshot: Pick<Snapshot, "labels" | "lines">
): Promise<void> {
  // Match the captured versions in the write, so a later edit stays dirty.
  if (snapshot.labels.length > 0) {
    await tx.execute(sql`
      update ${labels} as label
      set last_synced_hash = captured.hash,
          sync_status = 'SYNCED',
          last_exported_at = now()
      from jsonb_to_recordset(${JSON.stringify(snapshot.labels)}::jsonb)
           as captured(id uuid, "fileId" uuid, hash text)
      where label.id = captured.id
        and label.project_file_id = captured."fileId"
        and label.content_hash = captured.hash
        and label.deleted_at is null
    `);
  }
  if (snapshot.lines.length > 0) {
    await tx.execute(sql`
      update ${labelLines} as line
      set last_synced_hash = captured.hash,
          last_synced_at = now(),
          is_dirty = false
      from jsonb_to_recordset(${JSON.stringify(snapshot.lines)}::jsonb)
           as captured(id uuid, "labelId" uuid, hash text)
      join ${labels} as label on label.id = captured."labelId"
      where line.id = captured.id
        and line.label_id = captured."labelId"
        and line.content_hash = captured.hash
        and line.deleted_at is null
        and label.deleted_at is null
    `);
  }
}

export async function validateNoopExportBaselines(
  tx: Transaction,
  projectId: string,
  files: FileBaseline[]
): Promise<void> {
  await lockLocalBaselines(tx, projectId, files, true);
}
