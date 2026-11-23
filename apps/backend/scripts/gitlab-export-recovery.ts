/**
 * Operator recovery for an independently confirmed, unapplied GitLab write.
 * This command never sends a GitLab request or changes a source baseline.
 */
import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { closeDb, getDb } from "../src/db/index.js";
import {
  gitlabExportAttempts,
  gitlabRepositories,
  gitlabSyncOperations,
  projectFilePendingOperations,
  projects,
} from "../src/db/schema/index.js";
import type { Transaction } from "../src/db/types.js";
import { calculateContentHash } from "../src/lib/hash.js";
import { lockProject } from "../src/services/project-files-operations.service.js";

class RecoveryError extends Error {}

async function readRecoveryState(tx: Transaction, projectId: string) {
  const [project] = await tx
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!project) throw new RecoveryError("Project does not exist");
  const [repository] = await tx
    .select()
    .from(gitlabRepositories)
    .where(eq(gitlabRepositories.projectId, projectId))
    .for("update");
  const [attempt] = await tx
    .select()
    .from(gitlabExportAttempts)
    .where(eq(gitlabExportAttempts.projectId, projectId))
    .for("update");
  const legacy = await tx
    .select()
    .from(projectFilePendingOperations)
    .where(
      and(
        eq(projectFilePendingOperations.projectId, projectId),
        isNotNull(projectFilePendingOperations.attemptStartedAt)
      )
    )
    .orderBy(projectFilePendingOperations.id)
    .for("update");

  return {
    repository,
    attempt,
    legacy,
    fingerprint: calculateContentHash(
      JSON.stringify({ repository, attempt, legacy })
    ),
  };
}

async function main(args: string[]) {
  const [command, projectId, fingerprint, attestation, evidence] = args;
  if (!projectId || !z.string().uuid().safeParse(projectId).success)
    throw new RecoveryError("Supply a project UUID");
  const inspect = command === "inspect" && args.length === 2;
  const confirm =
    command === "confirm-unapplied" &&
    args.length === 5 &&
    /^[a-f0-9]{64}$/.test(fingerprint) &&
    attestation === "--write-confirmed-unapplied-and-drained" &&
    evidence.trim().length > 0;
  if (!inspect && !confirm) {
    throw new RecoveryError(
      "Usage: inspect <project-uuid> | confirm-unapplied <project-uuid> <fingerprint> --write-confirmed-unapplied-and-drained <evidence-reference>"
    );
  }

  await getDb().transaction(async (tx) => {
    await lockProject(tx, projectId);
    const state = await readRecoveryState(tx, projectId);
    const { attempt, legacy, repository } = state;
    if (inspect) {
      const { snapshot, message, ...metadata } = attempt ?? {};
      console.log(
        JSON.stringify(
          {
            projectId,
            fingerprint: state.fingerprint,
            repository,
            attempt: attempt
              ? {
                  ...metadata,
                  marker: message?.split("\n").at(-1),
                  actions: snapshot?.actions.map(
                    ({ action, filePath, previousPath }) => ({
                      action,
                      filePath,
                      previousPath,
                    })
                  ),
                }
              : null,
            legacy: legacy.map(
              ({
                id,
                operation,
                remoteBasePath,
                localPath,
                attemptBranch,
                attemptStartedAt,
                lastAttemptCommitId,
              }) => ({
                id,
                operation,
                remoteBasePath,
                localPath,
                attemptBranch,
                attemptStartedAt,
                lastAttemptCommitId,
              })
            ),
          },
          null,
          2
        )
      );
      return;
    }

    if (
      state.fingerprint !== fingerprint ||
      (!attempt && legacy.length === 0)
    ) {
      throw new RecoveryError(
        "Recovery state changed or is empty. Inspect again."
      );
    }
    if (
      attempt?.commitId ||
      attempt?.verification?.match ||
      legacy.some((op) => op.lastAttemptCommitId)
    ) {
      throw new RecoveryError(
        "This state has a commit receipt. Preserve it for reconciliation."
      );
    }
    if (attempt) {
      await tx
        .delete(gitlabExportAttempts)
        .where(eq(gitlabExportAttempts.operationId, attempt.operationId));
      await tx
        .update(gitlabSyncOperations)
        .set({
          status: "FAILED",
          completedAt: new Date(),
          errorMessage:
            "An operator confirmed the GitLab push did not apply. Retry the export.",
        })
        .where(eq(gitlabSyncOperations.id, attempt.operationId));
    }
    for (const op of legacy) {
      await tx
        .update(projectFilePendingOperations)
        .set({
          attemptStartedAt: null,
          attemptBranch: null,
          lastAttemptCommitId: null,
        })
        .where(eq(projectFilePendingOperations.id, op.id));
    }
  });
  if (confirm) {
    console.log(
      JSON.stringify({
        projectId,
        fingerprint,
        evidence,
        disposition: "confirmed unapplied",
      })
    );
  }
}

main(process.argv.slice(2))
  .catch((error: unknown) => {
    // Database errors can contain snapshot bytes. Keep the CLI failure generic.
    console.error(
      error instanceof RecoveryError
        ? error.message
        : "GitLab recovery stopped. Verify database access and inspect the state again."
    );
    process.exitCode = 1;
  })
  .finally(closeDb);
