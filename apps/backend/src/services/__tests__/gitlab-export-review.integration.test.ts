import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  users,
  projects,
  projectFiles,
  projectSettings,
  variables,
  characters,
  stats,
  gitlabRepositories,
  gitlabExportAttempts,
  gitlabSyncOperations,
  projectFilePendingOperations,
  labels,
  labelLines,
} from "../../db/schema/index.js";
import { testEmail, testUuid } from "../../utils/test-ids.js";
import { calculateContentHash } from "../../lib/hash.js";
import {
  exportToGitlab,
  reviewGitlabExport,
  recoverGitlabExport,
} from "../gitlab/gitlab-export.service.js";
import * as repository from "../gitlab/gitlab-repository.service.js";
import * as files from "../gitlab/gitlab-file.service.js";
import * as apiClient from "../gitlab/gitlab-api.client.js";
import * as integration from "../gitlab/gitlab-integration.service.js";
import * as preservation from "../character-source-preservation.service.js";
import * as syncOperations from "../gitlab/gitlab-sync-ops.service.js";
import { charactersService } from "../characters.service.js";
import { createVariable, updateVariable } from "../variables.service.js";
import { statsService } from "../stats.service.js";
import { lockProject } from "../project-files-operations.service.js";
import {
  deleteProjectFile,
  renameProjectFile,
} from "../project-files-operations.service.js";

const projectId = testUuid("17473000", 1);
const userId = testUuid("07473000", 1);
const fileId = testUuid("57473000", 1);
const base = "a".repeat(40);
const revision = "b".repeat(40);
const commit = "c".repeat(40);
const original = 'label start:\n    "Original"\n    return';
const edited = `${original}\n# edited`;
const db = getDb();
let remote: Map<string, { content: string; revision: string }>;
let head: string;
let branchExists: boolean;

async function snapshot() {
  return {
    files: await db
      .select()
      .from(projectFiles)
      .where(eq(projectFiles.projectId, projectId)),
    settings: await db
      .select()
      .from(projectSettings)
      .where(eq(projectSettings.projectId, projectId)),
    variables: await db
      .select()
      .from(variables)
      .where(eq(variables.projectId, projectId)),
    characters: await db
      .select()
      .from(characters)
      .where(eq(characters.projectId, projectId)),
    stats: await db.select().from(stats).where(eq(stats.projectId, projectId)),
    pending: await db
      .select()
      .from(projectFilePendingOperations)
      .where(eq(projectFilePendingOperations.projectId, projectId)),
    attempts: await db
      .select()
      .from(gitlabExportAttempts)
      .where(eq(gitlabExportAttempts.projectId, projectId)),
    history: await db
      .select()
      .from(gitlabSyncOperations)
      .where(eq(gitlabSyncOperations.projectId, projectId)),
    labels: await db
      .select()
      .from(labels)
      .where(eq(labels.projectId, projectId)),
    lines: await db.select().from(labelLines),
  };
}

beforeEach(async () => {
  await db.delete(projects).where(eq(projects.id, projectId));
  await db.delete(users).where(eq(users.id, userId));
  await db.insert(users).values({
    id: userId,
    email: testEmail("export-review", "owner"),
    passwordHash: "test",
    role: "OWNER",
  });
  await db
    .insert(projects)
    .values({ id: projectId, userId, name: "Review", source: "GITLAB" });
  await db.insert(gitlabRepositories).values({
    projectId,
    gitlabProjectId: 42,
    repositoryName: "review/repo",
    defaultBranch: "main",
  });
  await db.insert(projectFiles).values({
    id: fileId,
    projectId,
    source: "GITLAB",
    filePath: "game/script.rpy",
    fileType: "STORY",
    content: edited,
    contentHash: calculateContentHash(edited),
    remoteFilePath: "game/script.rpy",
    remoteContent: original,
    remoteContentHash: calculateContentHash(original),
    remoteBranch: "main",
    remoteRevision: revision,
    lastPushedContentHash: calculateContentHash(original),
  });
  remote = new Map([["game/script.rpy", { content: original, revision }]]);
  head = base;
  branchExists = true;
  vi.spyOn(repository, "getBranchCommitSha").mockImplementation(
    async (_project, _user, branch) => {
      if (branch === "new-branch" && !branchExists) {
        const { NotFoundError } =
          await import("../../middleware/error-handler.middleware.js");
        throw new NotFoundError("Branch");
      }
      return head;
    }
  );
  vi.spyOn(repository, "getFileContentWithMetadata").mockImplementation(
    async (_project, _user, path) => ({
      content: remote.get(path)?.content ?? null,
      lastCommitId: remote.get(path)?.revision ?? null,
      contentSha256: null,
      blobId: null,
    })
  );
});

afterEach(async () => {
  vi.restoreAllMocks();
  await db.delete(projects).where(eq(projects.id, projectId));
  await db.delete(users).where(eq(users.id, userId));
});

function mockCommit() {
  return vi.spyOn(files, "batchCommitFiles").mockResolvedValue(commit);
}

function summaries(actions: ReadonlyArray<files.BatchCommitAction>) {
  return actions.map(({ action, filePath, previousPath }) => ({
    action,
    filePath,
    ...(previousPath ? { previousPath } : {}),
  }));
}

async function waitForBlockedWriter(stop = () => false) {
  for (let count = 0; count < 100; count++) {
    if (stop()) return;
    const result = await db.execute<{ blocked: boolean }>(sql`
      select exists (select 1 from pg_stat_activity
        where datname = current_database()
        and cardinality(pg_blocking_pids(pid)) > 0) as blocked
    `);
    if (result.rows[0]?.blocked) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Writer did not wait for admission");
}

describe("exact GitLab export review", () => {
  it("preserves a file-row script save started between validation and legacy recovery", async () => {
    const source = `define s = Character("Sylvie", color="#abcdef")\n${original}`;
    const next = `${source}\n# concurrent script edit`;
    await db
      .update(projectFiles)
      .set({
        content: source,
        contentHash: calculateContentHash(source),
        remoteContent: source,
        remoteContentHash: calculateContentHash(source),
        lastPushedContentHash: calculateContentHash(source),
      })
      .where(eq(projectFiles.id, fileId));
    await db.insert(characters).values({
      projectId,
      renpyTag: "s",
      name: "Sylvie",
      displayName: "Sylvie",
      color: "#abcdef",
    });
    remote.set("game/script.rpy", { content: source, revision });
    const review = await reviewGitlabExport(projectId, userId, "main");
    const apply = preservation.applyCharacterSourceProjection;
    let editing: Promise<unknown> | undefined;
    vi.spyOn(
      preservation,
      "applyCharacterSourceProjection"
    ).mockImplementationOnce(async (...args) => {
      // Label saves use a file-row transaction without taking the project lock.
      editing = db.transaction(async (tx) => {
        await tx
          .select()
          .from(projectFiles)
          .where(eq(projectFiles.id, fileId))
          .for("update");
        await tx
          .update(projectFiles)
          .set({ content: next, contentHash: calculateContentHash(next) })
          .where(eq(projectFiles.id, fileId));
      });
      let stop = false;
      try {
        await Promise.race([editing, waitForBlockedWriter(() => stop)]);
      } finally {
        stop = true;
      }
      await apply(...args);
    });
    mockCommit();
    const result = await exportToGitlab(
      projectId,
      userId,
      "main",
      undefined,
      review.reviewToken
    );
    await editing;
    expect(result.status, result.errorMessage ?? undefined).toBe("COMPLETED");
    const [file] = await db
      .select()
      .from(projectFiles)
      .where(eq(projectFiles.id, fileId));
    expect(file.content).toBe(next);
  });

  it.each(["character", "variable", "stat", "new variable"])(
    "serializes %s writes with export admission",
    async (kind) => {
      const [character] = await db
        .insert(characters)
        .values({
          projectId,
          renpyTag: "s",
          name: "Sylvie",
          displayName: "Sylvie",
          color: "#abcdef",
        })
        .returning();
      const [variable] = await db
        .insert(variables)
        .values({ projectId, key: "flag" })
        .returning();
      const [stat] = await db
        .insert(stats)
        .values({ projectId, key: "trust", name: "Trust" })
        .returning();
      await db.insert(projectSettings).values({
        projectId,
        characterSourcePreservationVersion: 1,
        managedDefaultsRecovered: true,
      });
      let write: Promise<unknown> | undefined;
      let committed = false;
      await db.transaction(async (tx) => {
        await lockProject(tx, projectId);
        write = (
          kind === "character"
            ? charactersService.updateCharacter(character.id, userId, {
                name: "New name",
              })
            : kind === "variable"
              ? updateVariable(variable.id, userId, {
                  description: "New description",
                })
              : kind === "stat"
                ? statsService.updateStat(stat.id, userId, { minValue: 5 })
                : createVariable(userId, projectId, { key: "new_flag" })
        ).then(() => {
          committed = true;
        });
        await waitForBlockedWriter();
        expect(committed).toBe(false);
      });
      await write;
      expect(committed).toBe(true);
    }
  );

  it.each(["content", "revision"])(
    "refreshes a no-op when remote %s changes before baseline admission",
    async (change) => {
      await db
        .update(projectFiles)
        .set({
          content: original,
          contentHash: calculateContentHash(original),
          lastPushedContentHash: "stale",
        })
        .where(eq(projectFiles.id, fileId));
      const review = await reviewGitlabExport(projectId, userId, "main");
      expect(review.actions).toEqual([]);
      const before = await snapshot();
      const createOperation = syncOperations.createSyncOperation;
      vi.spyOn(syncOperations, "createSyncOperation").mockImplementationOnce(
        async (...args) => {
          const operation = await createOperation(...args);
          head = "d".repeat(40);
          remote.set("game/script.rpy", {
            content: change === "content" ? `${original}\n# remote` : original,
            revision: head,
          });
          return operation;
        }
      );
      const commitSpy = mockCommit();
      await expect(
        exportToGitlab(projectId, userId, "main", undefined, review.reviewToken)
      ).rejects.toThrow(/Refresh the review/);
      const after = await snapshot();
      expect({ ...after, history: [] }).toEqual({ ...before, history: [] });
      expect(commitSpy).not.toHaveBeenCalled();
    }
  );

  it("does not claim recovery when no attempt exists", async () => {
    const before = await snapshot();
    expect(await recoverGitlabExport(projectId, userId)).toBe(false);
    expect(await snapshot()).toEqual(before);
  });

  it("preserves a character edit started after validation and before legacy maintenance", async () => {
    const characterId = testUuid("67473000", 1);
    const source = `define s = Character("Sylvie", color="#abcdef")\n${original}`;
    await db
      .update(projectFiles)
      .set({
        content: source,
        contentHash: calculateContentHash(source),
        remoteContent: source,
        remoteContentHash: calculateContentHash(source),
        lastPushedContentHash: calculateContentHash(source),
      })
      .where(eq(projectFiles.id, fileId));
    await db.insert(characters).values({
      id: characterId,
      projectId,
      renpyTag: "s",
      name: "Sylvie",
      displayName: "Sylvie",
      nameType: "literal",
      color: "#abcdef",
    });
    remote.set("game/script.rpy", { content: source, revision });
    const review = await reviewGitlabExport(projectId, userId, "main");
    const apply = preservation.applyCharacterSourceProjection;
    let editing:
      ReturnType<typeof charactersService.updateCharacter> | undefined;
    vi.spyOn(
      preservation,
      "applyCharacterSourceProjection"
    ).mockImplementationOnce(async (...args) => {
      editing = charactersService.updateCharacter(characterId, userId, {
        name: "Edited during export",
        color: "#654321",
      });
      let stop = false;
      const blocked = async () => {
        for (let count = 0; count < 100 && !stop; count++) {
          const result = await db.execute<{ blocked: boolean }>(sql`
            select exists (
              select 1 from pg_stat_activity
              where datname = current_database()
                and (query like 'update "characters"%' or query like '%"projects"%for update%')
                and cardinality(pg_blocking_pids(pid)) > 0
            ) as blocked
          `);
          if (result.rows[0]?.blocked) return;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        if (!stop)
          throw new Error("Character edit did not reach admission lock");
      };
      try {
        // Old code commits the edit here, then overwrites it in maintenance.
        // Guarded code blocks the edit until this admission transaction commits.
        await Promise.race([editing, blocked()]);
      } finally {
        stop = true;
      }
      await apply(...args);
    });
    mockCommit();

    const result = await exportToGitlab(
      projectId,
      userId,
      "main",
      undefined,
      review.reviewToken
    );
    await editing;

    expect(result.status, result.errorMessage ?? undefined).toBe("COMPLETED");
    const [character] = await db
      .select()
      .from(characters)
      .where(eq(characters.id, characterId));
    expect(character).toMatchObject({
      name: "Edited during export",
      color: "#654321",
    });
  });

  it("returns refresh-required when local inputs change between validation and attempt admission", async () => {
    const review = await reviewGitlabExport(projectId, userId, "main");
    const createOperation = syncOperations.createSyncOperation;
    vi.spyOn(syncOperations, "createSyncOperation").mockImplementationOnce(
      async (...args) => {
        const operation = await createOperation(...args);
        await db
          .update(projectFiles)
          .set({
            content: `${edited}\n# concurrent edit`,
            contentHash: calculateContentHash(`${edited}\n# concurrent edit`),
          })
          .where(eq(projectFiles.id, fileId));
        return operation;
      }
    );
    const commitSpy = mockCommit();

    await expect(
      exportToGitlab(projectId, userId, "main", undefined, review.reviewToken)
    ).rejects.toThrow(/Refresh the review/);

    expect(commitSpy).not.toHaveBeenCalled();
    expect(
      await db
        .select()
        .from(gitlabExportAttempts)
        .where(eq(gitlabExportAttempts.projectId, projectId))
    ).toEqual([]);
    expect(
      await db
        .select()
        .from(projectSettings)
        .where(eq(projectSettings.projectId, projectId))
    ).toEqual([]);
  });

  it("rolls back maintenance when attempt admission fails", async () => {
    const source = `default obsolete = True\n${original}`;
    await db
      .update(projectFiles)
      .set({
        content: source,
        contentHash: calculateContentHash(source),
        remoteContent: source,
        remoteContentHash: calculateContentHash(source),
        lastPushedContentHash: calculateContentHash(source),
      })
      .where(eq(projectFiles.id, fileId));
    remote.set("game/script.rpy", { content: source, revision });
    const review = await reviewGitlabExport(projectId, userId, "main");
    const before = await snapshot();
    const apply = preservation.applyCharacterSourceProjection;
    vi.spyOn(
      preservation,
      "applyCharacterSourceProjection"
    ).mockImplementationOnce(async (...args) => {
      await apply(...args);
      throw new Error("Attempt admission failed after maintenance");
    });
    const commitSpy = mockCommit();

    const result = await exportToGitlab(
      projectId,
      userId,
      "main",
      undefined,
      review.reviewToken
    );

    expect(result.status).toBe("FAILED");
    const after = await snapshot();
    expect({ ...after, history: [] }).toEqual({ ...before, history: [] });
    expect(commitSpy).not.toHaveBeenCalled();
  });

  it.each(["remove", "delete"])(
    "rejects a default source changed during remote reads (%s) without persisting maintenance",
    async (change) => {
      const source = `default obsolete = True\n${original}`;
      await db
        .update(projectFiles)
        .set({
          content: source,
          contentHash: calculateContentHash(source),
          characterDefinitions: {},
          remoteContent: source,
          remoteContentHash: calculateContentHash(source),
          lastPushedContentHash: calculateContentHash(source),
        })
        .where(eq(projectFiles.id, fileId));
      await db.insert(projectSettings).values({
        projectId,
        characterSourcePreservationVersion: 1,
        managedDefaultsRecovered: true,
      });
      remote.set("game/script.rpy", { content: source, revision });
      const review = await reviewGitlabExport(projectId, userId, "main");
      const commitSpy = mockCommit();
      const read = vi.mocked(repository.getFileContentWithMetadata);
      const originalRead = read.getMockImplementation()!;
      let started!: () => void;
      let release!: () => void;
      const reading = new Promise<void>((resolve) => {
        started = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      read.mockImplementationOnce(async (...args) => {
        started();
        await gate;
        return originalRead(...args);
      });
      const confirmation = exportToGitlab(
        projectId,
        userId,
        "main",
        undefined,
        review.reviewToken
      );
      await reading;
      await db
        .update(projectFiles)
        .set(
          change === "delete"
            ? { deletedAt: new Date() }
            : { content: original, contentHash: calculateContentHash(original) }
        )
        .where(eq(projectFiles.id, fileId));
      const beforeAdmission = await snapshot();
      release();

      await expect(confirmation).rejects.toThrow(/Refresh the review/);
      expect(await snapshot()).toEqual(beforeAdmission);
      expect(commitSpy).not.toHaveBeenCalled();
    }
  );

  it("rejects a repository relink after validation before dispatching the frozen plan", async () => {
    const review = await reviewGitlabExport(projectId, userId, "main");
    const link = await repository.getRepositoryLink(projectId);
    expect(link).not.toBeNull();
    vi.spyOn(repository, "getRepositoryLink").mockResolvedValue({
      ...link!,
      gitlabProjectId: 43,
    });
    const commitSpy = mockCommit();

    const result = await exportToGitlab(
      projectId,
      userId,
      "main",
      undefined,
      review.reviewToken
    );

    expect(result.status).toBe("FAILED");
    expect(commitSpy).not.toHaveBeenCalled();
  });

  it("leaves maintenance, content, pending operations and history unchanged, then dispatches exactly the reviewed batch", async () => {
    const commitSpy = mockCommit();
    const before = await snapshot();
    const review = await reviewGitlabExport(projectId, userId, "main");
    expect(await snapshot()).toEqual(before);
    expect(commitSpy).not.toHaveBeenCalled();
    expect(review.actions).toEqual([
      { action: "update", filePath: "game/script.rpy" },
    ]);
    const result = await exportToGitlab(
      projectId,
      userId,
      "main",
      "Reviewed",
      review.reviewToken
    );
    expect(result.status, result.errorMessage ?? undefined).toBe("COMPLETED");
    expect(summaries(commitSpy.mock.calls[0][4])).toEqual(review.actions);
    expect(commitSpy.mock.calls[0][4][0]).toMatchObject({
      lastCommitId: revision,
      content: edited,
    });
  });

  it("includes generated-only changes while leaving legacy default promotion read-only", async () => {
    const source = `default has_key = True\n${original}`;
    await db
      .update(projectFiles)
      .set({
        content: source,
        contentHash: calculateContentHash(source),
        remoteContent: source,
        remoteContentHash: calculateContentHash(source),
        lastPushedContentHash: calculateContentHash(source),
      })
      .where(eq(projectFiles.id, fileId));
    remote.set("game/script.rpy", { content: source, revision });
    const before = await snapshot();
    const review = await reviewGitlabExport(projectId, userId, "main");
    expect(await snapshot()).toEqual(before);
    expect(review.actions).toContainEqual({
      action: "create",
      filePath: "game/branchforge_variables.rpy",
    });
    const commitSpy = mockCommit();
    const result = await exportToGitlab(
      projectId,
      userId,
      "main",
      undefined,
      review.reviewToken
    );
    expect(result.status, result.errorMessage ?? undefined).toBe("COMPLETED");
    expect(summaries(commitSpy.mock.calls[0][4])).toEqual(review.actions);
  });

  it("includes moves in the ordered committed batch", async () => {
    await renameProjectFile(fileId, userId, "game/renamed.rpy");
    const review = await reviewGitlabExport(projectId, userId, "main");
    expect(review.actions).toContainEqual({
      action: "move",
      previousPath: "game/script.rpy",
      filePath: "game/renamed.rpy",
    });
    const commitSpy = mockCommit();
    const result = await exportToGitlab(
      projectId,
      userId,
      "main",
      undefined,
      review.reviewToken
    );
    expect(result.status, result.errorMessage ?? undefined).toBe("COMPLETED");
    expect(summaries(commitSpy.mock.calls[0][4])).toEqual(review.actions);
  });

  it("includes deletions in the exact committed batch", async () => {
    await deleteProjectFile(fileId, userId);
    const review = await reviewGitlabExport(projectId, userId, "main");
    expect(review.actions).toContainEqual({
      action: "delete",
      filePath: "game/script.rpy",
    });
    const commitSpy = mockCommit();
    const result = await exportToGitlab(
      projectId,
      userId,
      "main",
      undefined,
      review.reviewToken
    );
    expect(result.status, result.errorMessage ?? undefined).toBe("COMPLETED");
    expect(summaries(commitSpy.mock.calls[0][4])).toEqual(review.actions);
  });

  it("invalidates changed generated inputs even when the resulting generated bytes are identical", async () => {
    await db.insert(variables).values({
      projectId,
      key: "has_key",
      authoredDefault: false,
      description: null,
    });
    const review = await reviewGitlabExport(projectId, userId, "main");
    // Null and empty comments render identically; the accepted input changed.
    await db
      .update(variables)
      .set({ description: "" })
      .where(eq(variables.projectId, projectId));
    const fresh = await reviewGitlabExport(projectId, userId, "main");
    expect(fresh.actions).toEqual(review.actions);
    expect(fresh.reviewToken).not.toBe(review.reviewToken);
    const before = await snapshot();
    await expect(
      exportToGitlab(projectId, userId, "main", undefined, review.reviewToken)
    ).rejects.toThrow(/Refresh the review/);
    expect(await snapshot()).toEqual(before);
  });

  it.each(["update", "move", "delete"] as const)(
    "protects a %s against remote edits between revalidation and the commit request",
    async (action) => {
      if (action === "move")
        await renameProjectFile(fileId, userId, "game/renamed.rpy");
      if (action === "delete") await deleteProjectFile(fileId, userId);
      const review = await reviewGitlabExport(projectId, userId, "main");
      vi.spyOn(integration, "getDecryptedToken").mockResolvedValue(
        "test-token"
      );
      const request = vi
        .spyOn(apiClient, "fetchWithTimeout")
        .mockImplementation(async (_url, init) => {
          const body = JSON.parse(String(init?.body)) as {
            actions: Array<{ action: string; last_commit_id?: string }>;
          };
          expect(
            body.actions.find((item) => item.action === action)?.last_commit_id
          ).toBe(revision);
          // GitLab rejects the captured file revision after a concurrent writer.
          remote.set("game/script.rpy", {
            content: `${original}\n# concurrent`,
            revision: "d".repeat(40),
          });
          return new Response(
            JSON.stringify({ message: "File has changed since last commit" }),
            { status: 400 }
          );
        });
      const result = await exportToGitlab(
        projectId,
        userId,
        "main",
        undefined,
        review.reviewToken
      );
      expect(result.status).toBe("FAILED");
      expect(request).toHaveBeenCalledOnce();
      expect(
        await db
          .select()
          .from(gitlabExportAttempts)
          .where(eq(gitlabExportAttempts.projectId, projectId))
      ).toEqual([]);
      const [local] = await db
        .select()
        .from(projectFiles)
        .where(eq(projectFiles.id, fileId));
      expect(local.remoteRevision).toBe(revision);
      expect(local.lastPushedContentHash).toBe(calculateContentHash(original));
    }
  );

  it.each(["occupied", "uncertain", "created"])(
    "handles %s new-branch creation at confirmation without an unsafe file commit",
    async (outcome) => {
      branchExists = false;
      const review = await reviewGitlabExport(projectId, userId, "new-branch");
      vi.spyOn(integration, "getDecryptedToken").mockResolvedValue(
        "test-token"
      );
      const request = vi
        .spyOn(apiClient, "fetchWithTimeout")
        .mockImplementation(async (url, init) => {
          const body = JSON.parse(String(init?.body)) as Record<
            string,
            unknown
          >;
          if (String(url).endsWith("/repository/branches")) {
            expect(body).toEqual({ branch: "new-branch", ref: base });
            branchExists = true;
            if (outcome === "occupied")
              return new Response("already exists", { status: 400 });
            if (outcome === "uncertain")
              return new Response("unavailable", { status: 503 });
            return new Response(
              JSON.stringify({ name: "new-branch", commit: { id: base } }),
              { status: 201 }
            );
          }
          expect(outcome).toBe("created");
          expect(body).not.toHaveProperty("start_sha");
          return new Response(
            JSON.stringify({ id: commit, parent_ids: [base] }),
            { status: 201 }
          );
        });
      const result = await exportToGitlab(
        projectId,
        userId,
        "new-branch",
        undefined,
        review.reviewToken
      );
      expect(result.status).toBe(
        outcome === "created" ? "COMPLETED" : "FAILED"
      );
      expect(request).toHaveBeenCalledTimes(outcome === "created" ? 2 : 1);
      const attempts = await db
        .select()
        .from(gitlabExportAttempts)
        .where(eq(gitlabExportAttempts.projectId, projectId));
      expect(attempts).toHaveLength(outcome === "uncertain" ? 1 : 0);
    }
  );

  it("shows the new branch base without creating it", async () => {
    branchExists = false;
    const commitSpy = mockCommit();
    const review = await reviewGitlabExport(projectId, userId, "new-branch");
    expect(review).toMatchObject({
      targetBranch: "new-branch",
      branchExisted: false,
      baseBranch: "main",
    });
    expect(commitSpy).not.toHaveBeenCalled();
    const result = await exportToGitlab(
      projectId,
      userId,
      "new-branch",
      undefined,
      review.reviewToken
    );
    expect(result.status).toBe("COMPLETED");
    expect(summaries(commitSpy.mock.calls[0][4])).toEqual(review.actions);
  });

  it("reports no changes without writes", async () => {
    await db
      .update(projectFiles)
      .set({
        content: original,
        contentHash: calculateContentHash(original),
        lastPushedContentHash: calculateContentHash(original),
      })
      .where(eq(projectFiles.id, fileId));
    const before = await snapshot();
    const review = await reviewGitlabExport(projectId, userId, "main");
    expect(review.actions).toEqual([]);
    expect(await snapshot()).toEqual(before);
  });

  it.each(["local", "remote revision", "branch appearance", "generated"])(
    "rejects stale %s inputs before any writes",
    async (kind) => {
      if (kind === "branch appearance") branchExists = false;
      if (kind === "generated")
        await db
          .insert(variables)
          .values({ projectId, key: "has_key", authoredDefault: false });
      const branch = kind === "branch appearance" ? "new-branch" : "main";
      const review = await reviewGitlabExport(projectId, userId, branch);
      if (kind === "local")
        await db
          .update(projectFiles)
          .set({
            content: `${edited}\n# newer`,
            contentHash: calculateContentHash(`${edited}\n# newer`),
          })
          .where(eq(projectFiles.id, fileId));
      if (kind === "remote revision")
        remote.set("game/script.rpy", {
          content: original,
          revision: "d".repeat(40),
        });
      if (kind === "branch appearance") branchExists = true;
      if (kind === "generated")
        await db
          .update(variables)
          .set({ authoredDefault: true })
          .where(eq(variables.projectId, projectId));
      const before = await snapshot();
      const commitSpy = mockCommit();
      await expect(
        exportToGitlab(projectId, userId, branch, undefined, review.reviewToken)
      ).rejects.toThrow(/Refresh the review/);
      expect(await snapshot()).toEqual(before);
      expect(commitSpy).not.toHaveBeenCalled();
    }
  );

  it("allows unrelated branch head movement", async () => {
    const review = await reviewGitlabExport(projectId, userId, "main");
    head = "d".repeat(40);
    const commitSpy = mockCommit();
    expect(
      (
        await exportToGitlab(
          projectId,
          userId,
          "main",
          undefined,
          review.reviewToken
        )
      ).status
    ).toBe("COMPLETED");
    expect(summaries(commitSpy.mock.calls[0][4])).toEqual(review.actions);
  });

  it("blocks review without reconciling a pending attempt, then explicitly recovers its receipt after reopening", async () => {
    const commitSpy = vi
      .spyOn(files, "batchCommitFiles")
      .mockRejectedValue(new Error("Timeout"));
    const review = await reviewGitlabExport(projectId, userId, "main");
    expect(
      (
        await exportToGitlab(
          projectId,
          userId,
          "main",
          undefined,
          review.reviewToken
        )
      ).status
    ).toBe("FAILED");
    const [attempt] = await db
      .select()
      .from(gitlabExportAttempts)
      .where(eq(gitlabExportAttempts.projectId, projectId));
    expect(attempt.dispatchedAt).not.toBeNull();
    const before = await snapshot();
    await expect(reviewGitlabExport(projectId, userId, "main")).rejects.toThrow(
      /Recover the previous/
    );
    expect(await snapshot()).toEqual(before);
    expect(commitSpy).toHaveBeenCalledOnce();
    const attempts = await import("../gitlab/gitlab-export-attempt.service.js");
    vi.spyOn(attempts, "verifyExportAttempt").mockResolvedValue(commit);
    await recoverGitlabExport(projectId, userId);
    expect(
      await db
        .select()
        .from(gitlabExportAttempts)
        .where(eq(gitlabExportAttempts.projectId, projectId))
    ).toEqual([]);
    expect(commitSpy).toHaveBeenCalledOnce();
  });
});
