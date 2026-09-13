/**
 * Project File Operations Routes Integration Tests
 *
 * Covers create-file recording, rename/move (incl. collapse + guards),
 * delete (hard vs soft), tombstone-aware reads, delete impact occurrences,
 * restore/reverse, project-wide discard-all, and the pending structural
 * summary against a real database.
 */

import { describe, it, expect, afterEach, beforeAll, afterAll } from "vitest";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import { projectsRoutes } from "../projects.routes.js";
import { getDb } from "../../db/index.js";
import { SESSION_COOKIE_NAME } from "../../lib/session.js";
import { testEmail, testUuid } from "../../utils/test-ids.js";
import {
  users,
  projects,
  projectFiles,
  projectFilePendingOperations,
  labels,
  labelLines,
  userSessions,
  userSettings,
  type NewUser,
  type NewProject,
} from "../../db/schema/index.js";
import { eq, inArray } from "drizzle-orm";
import { calculateContentHash } from "../../lib/hash.js";

describe("ProjectFileOperationsRoutes (Integration)", () => {
  let db: ReturnType<typeof getDb>;
  let fastify: ReturnType<typeof Fastify>;

  const testUserId = testUuid("02000000", 1);
  const otherUserId = testUuid("02000000", 2);

  const zipProjectId = testUuid("12000000", 1);
  const gitProjectId = testUuid("12000000", 2);

  const testUser: NewUser = {
    id: testUserId,
    email: testEmail("project-file-ops", "owner"),
    passwordHash: "hashed_password",
    role: "OWNER",
  };

  const otherUser: NewUser = {
    id: otherUserId,
    email: testEmail("project-file-ops", "other"),
    passwordHash: "hashed_password",
    role: "OWNER",
  };

  const zipProject: NewProject = {
    id: zipProjectId,
    userId: testUserId,
    name: "Operation ZIP Project",
    description: "Project for file operation tests",
    maxStatDelta: 10,
    source: "ZIP",
  };

  const gitProject: NewProject = {
    id: gitProjectId,
    userId: testUserId,
    name: "Operation GitLab Project",
    description: "Project for GitLab structural operation tests",
    maxStatDelta: 10,
    source: "GITLAB",
  };

  async function cleanupTestData() {
    await db
      .delete(projectFilePendingOperations)
      .where(
        inArray(projectFilePendingOperations.projectId, [
          zipProjectId,
          gitProjectId,
        ])
      );
    await db
      .delete(projectFiles)
      .where(inArray(projectFiles.projectId, [zipProjectId, gitProjectId]));
    await db
      .delete(userSettings)
      .where(inArray(userSettings.userId, [testUserId]));
    await db
      .delete(projects)
      .where(inArray(projects.id, [zipProjectId, gitProjectId]));
    await db.delete(userSessions).where(eq(userSessions.userId, testUserId));
    await db.delete(userSessions).where(eq(userSessions.userId, otherUserId));
    await db.delete(users).where(inArray(users.id, [testUserId, otherUserId]));
  }

  beforeAll(async () => {
    db = getDb();
    await cleanupTestData();

    await db.insert(users).values([testUser, otherUser]);
    await db.insert(projects).values([zipProject, gitProject]);
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    if (fastify) {
      await fastify.close();
    }
    // Clear all project files + pending ops + settings between tests
    await db
      .delete(projectFilePendingOperations)
      .where(
        inArray(projectFilePendingOperations.projectId, [
          zipProjectId,
          gitProjectId,
        ])
      );
    await db
      .delete(projectFiles)
      .where(inArray(projectFiles.projectId, [zipProjectId, gitProjectId]));
    await db.delete(userSettings).where(eq(userSettings.userId, testUserId));
  });

  function buildApp(): void {
    fastify = Fastify();
    fastify.register(cookie);
    fastify.register(session, {
      cookieName: SESSION_COOKIE_NAME,
      secret: "test-secret-32-characters-long!!",
      cookie: { secure: false },
    });
    fastify.register(projectsRoutes);
    fastify.post(
      "/test-login",
      async (
        request: FastifyRequest<{ Body: { userId: string } }>,
        reply: FastifyReply
      ) => {
        const { userId } = request.body;
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        if (!user) {
          return reply.status(404).send({ error: "User not found" });
        }
        request.session.user = {
          id: user.id,
          email: user.email,
          role: user.role,
        };
        reply.send({ success: true });
      }
    );
  }

  async function sessionFor(userId: string): Promise<string> {
    const response = await fastify.inject({
      method: "POST",
      url: "/test-login",
      payload: { userId },
    });
    const cookieValue = response.cookies.find(
      (c) => c.name === SESSION_COOKIE_NAME
    )?.value;
    if (!cookieValue) {
      throw new Error("Failed to create session cookie");
    }
    return cookieValue;
  }

  async function createTestFile(
    projectId: string,
    filePath: string,
    options: {
      source?: "GITLAB" | "ZIP";
      content?: string;
      lastPushedContentHash?: string | null;
    } = {}
  ) {
    const source = options.source ?? "GITLAB";
    const content = options.content ?? "";
    const [file] = await db
      .insert(projectFiles)
      .values({
        projectId,
        source,
        filePath,
        fileType: "STORY",
        content,
        originalContent: source === "GITLAB" ? content || null : null,
        contentHash: calculateContentHash(content),
        ...(source === "GITLAB"
          ? {
              remoteFilePath: filePath,
              lastPushedContentHash: calculateContentHash(content),
            }
          : {}),
      })
      .returning();
    return file!;
  }

  async function getPendingOps(projectId: string) {
    return db
      .select()
      .from(projectFilePendingOperations)
      .where(eq(projectFilePendingOperations.projectId, projectId));
  }

  // ==========================================================================
  // PATCH /projects/files/:fileId (rename/move)
  // ==========================================================================

  describe("PATCH /projects/files/:fileId", () => {
    it("renames a file when the user owns the project (ZIP: no structural row)", async () => {
      buildApp();
      await fastify.ready();
      const cookie = await sessionFor(testUserId);
      const file = await createTestFile(zipProjectId, "old.rpy", {
        source: "ZIP",
        content: "label start:",
      });

      const response = await fastify.inject({
        method: "PATCH",
        url: `/projects/files/${file.id}`,
        payload: { filePath: "new.rpy" },
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.file.filePath).toBe("new.rpy");
      expect(body.operation).toBeNull();
      expect(await getPendingOps(zipProjectId)).toHaveLength(0);
    });

    it("records a collapsed RENAME operation for GitLab files", async () => {
      buildApp();
      await fastify.ready();
      const cookie = await sessionFor(testUserId);
      const file = await createTestFile(gitProjectId, "game/old.rpy");

      const response = await fastify.inject({
        method: "PATCH",
        url: `/projects/files/${file.id}`,
        payload: { filePath: "game/new.rpy" },
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.file.filePath).toBe("game/new.rpy");
      expect(body.operation.operation).toBe("RENAME");
      expect(body.operation.remoteBasePath).toBe("game/old.rpy");
      expect(body.operation.localPath).toBe("game/new.rpy");

      const ops = await getPendingOps(gitProjectId);
      expect(ops).toHaveLength(1);
      expect(ops[0]!.operation).toBe("RENAME");
      expect(ops[0]!.remoteBasePath).toBe("game/old.rpy");
    });

    it("collapses repeated renames: original remote path kept, final local path recorded", async () => {
      buildApp();
      await fastify.ready();
      const cookie = await sessionFor(testUserId);
      const file = await createTestFile(gitProjectId, "game/a.rpy");

      await fastify.inject({
        method: "PATCH",
        url: `/projects/files/${file.id}`,
        payload: { filePath: "game/b.rpy" },
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      });
      const second = await fastify.inject({
        method: "PATCH",
        url: `/projects/files/${file.id}`,
        payload: { filePath: "game/c.rpy" },
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      });

      expect(second.statusCode).toBe(200);
      const ops = await getPendingOps(gitProjectId);
      expect(ops).toHaveLength(1);
      expect(ops[0]!.operation).toBe("RENAME");
      expect(ops[0]!.remoteBasePath).toBe("game/a.rpy");
      expect(ops[0]!.localPath).toBe("game/c.rpy");
    });

    it("returns 403 when the user does not own the project", async () => {
      buildApp();
      await fastify.ready();
      const cookie = await sessionFor(otherUserId);
      const file = await createTestFile(zipProjectId, "owner.rpy", {
        source: "ZIP",
      });

      const response = await fastify.inject({
        method: "PATCH",
        url: `/projects/files/${file.id}`,
        payload: { filePath: "stolen.rpy" },
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      });

      expect(response.statusCode).toBe(403);
    });

    it("rejects invalid paths (traversal, extension, Windows-unsafe)", async () => {
      buildApp();
      await fastify.ready();
      const cookie = await sessionFor(testUserId);
      const file = await createTestFile(zipProjectId, "safe.rpy", {
        source: "ZIP",
      });

      for (const badPath of [
        "../escape.rpy",
        "labels/scene?.rpy",
        "CON.rpy",
        "labels/act.txt",
        "",
      ]) {
        const response = await fastify.inject({
          method: "PATCH",
          url: `/projects/files/${file.id}`,
          payload: { filePath: badPath },
          cookies: { [SESSION_COOKIE_NAME]: cookie },
        });
        expect(response.statusCode).toBe(400);
      }
    });

    it("rejects a case-insensitive collision across sources", async () => {
      buildApp();
      await fastify.ready();
      await sessionFor(testUserId);
      await createTestFile(gitProjectId, "game/story.rpy");

      // The cross-source partial unique index enforces active case-insensitive
      // uniqueness at the database level.
      let violated = false;
      try {
        await db.insert(projectFiles).values({
          projectId: gitProjectId,
          source: "ZIP",
          filePath: "game/Story.rpy",
          fileType: "STORY",
          content: "",
          contentHash: calculateContentHash(""),
        });
      } catch (error) {
        violated = true;
        const pgError = error as { code?: string };
        expect(
          pgError.code ?? (error as { cause?: { code?: string } }).cause?.code
        ).toBe("23505");
      }
      expect(violated).toBe(true);
    });

    it("allows a case-only rename of the same file ID", async () => {
      buildApp();
      await fastify.ready();
      const cookie = await sessionFor(testUserId);
      const file = await createTestFile(zipProjectId, "game/Scene.rpy", {
        source: "ZIP",
      });
      const originalId = file.id;

      const response = await fastify.inject({
        method: "PATCH",
        url: `/projects/files/${file.id}`,
        payload: { filePath: "game/SCENE.rpy" },
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.file.filePath).toBe("game/SCENE.rpy");
      expect(body.file.id).toBe(originalId);
    });

    it("rejects a stale expectedContentHash with 409", async () => {
      buildApp();
      await fastify.ready();
      const cookie = await sessionFor(testUserId);
      const file = await createTestFile(zipProjectId, "hash_check.rpy", {
        source: "ZIP",
        content: "label start:",
      });

      const response = await fastify.inject({
        method: "PATCH",
        url: `/projects/files/${file.id}`,
        payload: {
          filePath: "moved.rpy",
          expectedContentHash: "deadbeef",
        },
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      });

      expect(response.statusCode).toBe(409);
      const [row] = await db
        .select({ filePath: projectFiles.filePath })
        .from(projectFiles)
        .where(eq(projectFiles.id, file.id));
      expect(row?.filePath).toBe("hash_check.rpy");
    });

    it("protects the exact generated basenames as source and target", async () => {
      buildApp();
      await fastify.ready();
      const cookie = await sessionFor(testUserId);
      const generated = await createTestFile(
        gitProjectId,
        "game/branchforge_variables.rpy"
      );
      const normal = await createTestFile(gitProjectId, "game/normal.rpy");

      // Cannot rename FROM a generated file
      const fromResponse = await fastify.inject({
        method: "PATCH",
        url: `/projects/files/${generated.id}`,
        payload: { filePath: "game/renamed.rpy" },
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      });
      expect(fromResponse.statusCode).toBe(400);

      // Cannot rename TO a generated file
      const toResponse = await fastify.inject({
        method: "PATCH",
        url: `/projects/files/${normal.id}`,
        payload: { filePath: "game/branchforge_stats.rpy" },
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      });
      expect(toResponse.statusCode).toBe(400);

      // Arbitrary branchforge_*.rpy files are NOT protected
      const arbitrary = await createTestFile(
        gitProjectId,
        "game/branchforge_custom.rpy"
      );
      const arbitraryResponse = await fastify.inject({
        method: "PATCH",
        url: `/projects/files/${arbitrary.id}`,
        payload: { filePath: "game/my_custom.rpy" },
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      });
      expect(arbitraryResponse.statusCode).toBe(200);
    });

    it("blocks a rename that would reclassify a STORY file with labels as SETTINGS", async () => {
      buildApp();
      await fastify.ready();
      const cookie = await sessionFor(testUserId);
      const file = await createTestFile(gitProjectId, "game/story.rpy", {
        content: 'label start:\n    "Hello"',
      });
      const [label] = await db
        .insert(labels)
        .values({
          projectId: gitProjectId,
          projectFileId: file.id,
          title: "Start",
          labelName: "start",
          labelNumber: 1,
          sequenceOrder: 0,
        })
        .returning();

      const response = await fastify.inject({
        method: "PATCH",
        url: `/projects/files/${file.id}`,
        payload: { filePath: "screens.rpy" },
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      });

      expect(response.statusCode).toBe(400);
      // Labels are preserved
      const [remaining] = await db
        .select()
        .from(labels)
        .where(eq(labels.id, label!.id));
      expect(remaining?.deletedAt).toBeNull();
    });

    it("blocks a move that would change the established game/ directory prefix", async () => {
      buildApp();
      await fastify.ready();
      const cookie = await sessionFor(testUserId);
      const fileA = await createTestFile(gitProjectId, "game/a.rpy");
      await createTestFile(gitProjectId, "game/b.rpy");

      const response = await fastify.inject({
        method: "PATCH",
        url: `/projects/files/${fileA.id}`,
        payload: { filePath: "outside/a.rpy" },
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      });

      expect(response.statusCode).toBe(400);
    });

    it("returns 404 for a missing file", async () => {
      buildApp();
      await fastify.ready();
      const cookie = await sessionFor(testUserId);

      const response = await fastify.inject({
        method: "PATCH",
        url: `/projects/files/${testUuid("99000000", 99)}`,
        payload: { filePath: "whatever.rpy" },
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ==========================================================================
  // DELETE /projects/files/:fileId
  // ==========================================================================

  describe("DELETE /projects/files/:fileId", () => {
    it("hard-deletes a ZIP file with labels/lines and leaves no structural row", async () => {
      buildApp();
      await fastify.ready();
      const cookie = await sessionFor(testUserId);
      const file = await createTestFile(zipProjectId, "zip_del.rpy", {
        source: "ZIP",
      });
      const [label] = await db
        .insert(labels)
        .values({
          projectId: zipProjectId,
          projectFileId: file.id,
          title: "Zip label",
          labelName: "zip_label",
          labelNumber: 1,
          sequenceOrder: 0,
        })
        .returning();

      const response = await fastify.inject({
        method: "DELETE",
        url: `/projects/files/${file.id}`,
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.hardDeleted).toBe(true);

      const [gone] = await db
        .select()
        .from(projectFiles)
        .where(eq(projectFiles.id, file.id));
      expect(gone).toBeUndefined();
      const [labelGone] = await db
        .select()
        .from(labels)
        .where(eq(labels.id, label!.id));
      expect(labelGone).toBeUndefined();
      expect(await getPendingOps(zipProjectId)).toHaveLength(0);
    });

    it("soft-deletes a GitLab file, records exact label/line IDs, and scrubs word counts", async () => {
      buildApp();
      await fastify.ready();
      const cookie = await sessionFor(testUserId);
      const file = await createTestFile(gitProjectId, "game/del.rpy");
      const [labelA] = await db
        .insert(labels)
        .values({
          projectId: gitProjectId,
          projectFileId: file.id,
          title: "A",
          labelName: "label_a",
          labelNumber: 1,
          sequenceOrder: 0,
        })
        .returning();
      const [labelB] = await db
        .insert(labels)
        .values({
          projectId: gitProjectId,
          projectFileId: file.id,
          title: "B",
          labelName: "label_b",
          labelNumber: 2,
          sequenceOrder: 1,
        })
        .returning();
      await db.insert(labelLines).values({
        labelId: labelA!.id,
        sequence: 1,
        content: "Hello",
        contentType: "NARRATION",
      });

      // Pre-existing (already deleted earlier) label must NOT be restored
      await db.insert(labels).values({
        projectId: gitProjectId,
        projectFileId: file.id,
        title: "Old",
        labelName: "old_label",
        labelNumber: 3,
        sequenceOrder: 2,
        deletedAt: new Date(),
      });

      await db.insert(userSettings).values({
        userId: testUserId,
        labelWordCounts: {
          [labelA!.id]: { date: "2026-09-12", count: 5 },
          [labelB!.id]: { date: "2026-09-12", count: 7 },
        },
      });

      const response = await fastify.inject({
        method: "DELETE",
        url: `/projects/files/${file.id}`,
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.hardDeleted).toBe(false);
      expect(body.operation.operation).toBe("DELETE");

      const ops = await getPendingOps(gitProjectId);
      expect(ops).toHaveLength(1);
      expect(ops[0]!.remoteBasePath).toBe("game/del.rpy");
      expect(ops[0]!.localPath).toBe("game/del.rpy");
      expect(new Set(ops[0]!.deletedLabelIds)).toEqual(
        new Set([labelA!.id, labelB!.id])
      );

      // Tombstone excluded from active listings
      const listing = await fastify.inject({
        method: "GET",
        url: `/projects/${gitProjectId}/files`,
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      });
      const listingBody = JSON.parse(listing.payload);
      expect(
        listingBody.files.some((f: { id: string }) => f.id === file.id)
      ).toBe(false);

      // Word counts scrubbed for deleted labels
      const [settings] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, testUserId));
      expect(settings?.labelWordCounts[labelA!.id]).toBeUndefined();
      expect(settings?.labelWordCounts[labelB!.id]).toBeUndefined();
    });

    it("protects generated files from deletion", async () => {
      buildApp();
      await fastify.ready();
      const cookie = await sessionFor(testUserId);
      const generated = await createTestFile(
        gitProjectId,
        "game/branchforge_variables.rpy"
      );

      const response = await fastify.inject({
        method: "DELETE",
        url: `/projects/files/${generated.id}`,
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      });

      expect(response.statusCode).toBe(400);
    });

    it("cancels a pending CREATE with a hard delete (CREATE→delete)", async () => {
      buildApp();
      await fastify.ready();
      const cookie = await sessionFor(testUserId);

      const createResponse = await fastify.inject({
        method: "POST",
        url: `/projects/${gitProjectId}/files`,
        payload: { filePath: "game/created.rpy" },
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      });
      expect(createResponse.statusCode).toBe(201);
      const createdFileId = JSON.parse(createResponse.payload).file
        .id as string;

      // CREATE row exists
      expect(await getPendingOps(gitProjectId)).toHaveLength(1);

      const deleteResponse = await fastify.inject({
        method: "DELETE",
        url: `/projects/files/${createdFileId}`,
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      });
      expect(deleteResponse.statusCode).toBe(200);
      const body = JSON.parse(deleteResponse.payload);
      expect(body.hardDeleted).toBe(true);
      expect(await getPendingOps(gitProjectId)).toHaveLength(0);

      const [gone] = await db
        .select()
        .from(projectFiles)
        .where(eq(projectFiles.id, createdFileId));
      expect(gone).toBeUndefined();
    });
  });

  // ==========================================================================
  // POST /projects/files/:fileId/delete-impact
  // ==========================================================================

  describe("POST /projects/files/:fileId/delete-impact", () => {
    it("returns every incoming jump/call/menu-choice occurrence, excluding same-file sources", async () => {
      buildApp();
      await fastify.ready();
      const cookie = await sessionFor(testUserId);

      const target = await createTestFile(gitProjectId, "game/target.rpy");
      const source1 = await createTestFile(gitProjectId, "game/source1.rpy");
      const source2 = await createTestFile(gitProjectId, "game/source2.rpy");

      const [targetLabel] = await db
        .insert(labels)
        .values({
          projectId: gitProjectId,
          projectFileId: target.id,
          title: "Target",
          labelName: "target_label",
          labelNumber: 1,
          sequenceOrder: 0,
        })
        .returning();

      // Two labels in source1: one jumps directly (x2 via two lines), one calls
      const [src1Jumper] = await db
        .insert(labels)
        .values({
          projectId: gitProjectId,
          projectFileId: source1.id,
          title: "Jumper",
          labelName: "jumper",
          labelNumber: 1,
          sequenceOrder: 0,
        })
        .returning();
      const [src1Caller] = await db
        .insert(labels)
        .values({
          projectId: gitProjectId,
          projectFileId: source1.id,
          title: "Caller",
          labelName: "caller",
          labelNumber: 2,
          sequenceOrder: 1,
        })
        .returning();
      const [src2Chooser] = await db
        .insert(labels)
        .values({
          projectId: gitProjectId,
          projectFileId: source2.id,
          title: "Chooser",
          labelName: "chooser",
          labelNumber: 1,
          sequenceOrder: 0,
        })
        .returning();

      await db.insert(labelLines).values([
        {
          labelId: src1Jumper!.id,
          sequence: 1,
          content: "jump TARGET_LABEL",
          contentType: "JUMP",
          rpyLineNumber: 5,
        },
        {
          labelId: src1Jumper!.id,
          sequence: 2,
          content: "jump target_label",
          contentType: "JUMP",
          rpyLineNumber: 9,
        },
        {
          labelId: src1Caller!.id,
          sequence: 1,
          content: "call target_label from _call_sl",
          contentType: "NARRATION",
          rpyLineNumber: 12,
        },
        {
          labelId: src2Chooser!.id,
          sequence: 1,
          content: "",
          contentType: "MENU",
          menuOptions: [
            {
              label: "Go to target",
              targetLabelId: targetLabel!.id,
              targetLabelName: "target_label",
            },
            {
              label: "Elsewhere",
              targetLabelId: testUuid("99000000", 98),
              targetLabelName: "other_label",
            },
          ],
        },
      ]);

      const response = await fastify.inject({
        method: "POST",
        url: `/projects/files/${target.id}/delete-impact`,
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      const impact = body.impact;
      expect(impact.labelCount).toBe(1);
      expect(impact.labels).toEqual([
        expect.objectContaining({
          id: targetLabel!.id,
          labelName: "target_label",
          title: "Target",
        }),
      ]);
      // 2 jumps + 1 call + 1 menu choice = 4 occurrences
      expect(impact.occurrenceCount).toBe(4);
      const types = impact.occurrences.map(
        (o: { referenceType: string }) => o.referenceType
      );
      expect(types.filter((t: string) => t === "JUMP")).toHaveLength(2);
      expect(types).toContain("CALL");
      expect(types).toContain("MENU_CHOICE");
      for (const occurrence of impact.occurrences) {
        expect(occurrence.sourceFileId).not.toBe(target.id);
        expect(occurrence.targetLabelId).toBe(targetLabel!.id);
        expect(occurrence.targetLabelName).toBe("target_label");
      }
      expect(impact.occurrences[0]).toMatchObject({
        sourceLabelTitle: expect.any(String),
        sourceFilePath: expect.any(String),
        sourceLineNumber: expect.any(Number),
      });
    });
  });

  // ==========================================================================
  // POST /projects/files/:fileId/reverse
  // ==========================================================================

  describe("POST /projects/files/:fileId/reverse", () => {
    it("reverses a RENAME back to the remote path", async () => {
      buildApp();
      await fastify.ready();
      const cookie = await sessionFor(testUserId);
      const file = await createTestFile(gitProjectId, "game/rev.rpy");

      await fastify.inject({
        method: "PATCH",
        url: `/projects/files/${file.id}`,
        payload: { filePath: "game/renamed.rpy" },
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      });

      const response = await fastify.inject({
        method: "POST",
        url: `/projects/files/${file.id}/reverse`,
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.reversed).toBe(true);
      expect(body.operation.operation).toBe("RENAME");

      const [row] = await db
        .select({ filePath: projectFiles.filePath })
        .from(projectFiles)
        .where(eq(projectFiles.id, file.id));
      expect(row?.filePath).toBe("game/rev.rpy");
      expect(await getPendingOps(gitProjectId)).toHaveLength(0);
    });

    it("reverses a DELETE, restoring only the labels deleted with the file", async () => {
      buildApp();
      await fastify.ready();
      const cookie = await sessionFor(testUserId);
      const file = await createTestFile(gitProjectId, "game/del2.rpy");
      const [labelA] = await db
        .insert(labels)
        .values({
          projectId: gitProjectId,
          projectFileId: file.id,
          title: "A",
          labelName: "label_a",
          labelNumber: 1,
          sequenceOrder: 0,
        })
        .returning();
      // Pre-existing tombstoned label: must stay deleted after restore
      await db.insert(labels).values({
        projectId: gitProjectId,
        projectFileId: file.id,
        title: "Old",
        labelName: "old_label",
        labelNumber: 2,
        sequenceOrder: 1,
        deletedAt: new Date(),
      });

      await fastify.inject({
        method: "DELETE",
        url: `/projects/files/${file.id}`,
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      });

      const response = await fastify.inject({
        method: "POST",
        url: `/projects/files/${file.id}/reverse`,
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.reversed).toBe(true);
      expect(body.operation.operation).toBe("DELETE");

      const [restoredFile] = await db
        .select()
        .from(projectFiles)
        .where(eq(projectFiles.id, file.id));
      expect(restoredFile?.deletedAt).toBeNull();

      const [restoredLabel] = await db
        .select()
        .from(labels)
        .where(eq(labels.id, labelA!.id));
      expect(restoredLabel?.deletedAt).toBeNull();

      const [oldLabel] = await db
        .select()
        .from(labels)
        .where(eq(labels.labelName, "old_label"));
      expect(oldLabel?.deletedAt).not.toBeNull();

      expect(await getPendingOps(gitProjectId)).toHaveLength(0);
    });

    it("reversing a DELETE of a renamed file leaves a RENAME pending", async () => {
      buildApp();
      await fastify.ready();
      const cookie = await sessionFor(testUserId);
      const file = await createTestFile(gitProjectId, "game/orig.rpy");

      // rename → delete (collapses to DELETE of the original remote path)
      await fastify.inject({
        method: "PATCH",
        url: `/projects/files/${file.id}`,
        payload: { filePath: "game/moved.rpy" },
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      });
      await fastify.inject({
        method: "DELETE",
        url: `/projects/files/${file.id}`,
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      });

      let ops = await getPendingOps(gitProjectId);
      expect(ops).toHaveLength(1);
      expect(ops[0]!.operation).toBe("DELETE");
      expect(ops[0]!.remoteBasePath).toBe("game/orig.rpy");
      expect(ops[0]!.localPath).toBe("game/moved.rpy");

      const response = await fastify.inject({
        method: "POST",
        url: `/projects/files/${file.id}/reverse`,
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      });
      expect(response.statusCode).toBe(200);

      // Restore keeps the actual local state (renamed path) and leaves a
      // RENAME pending so the remote move is not lost.
      ops = await getPendingOps(gitProjectId);
      expect(ops).toHaveLength(1);
      expect(ops[0]!.operation).toBe("RENAME");
      expect(ops[0]!.remoteBasePath).toBe("game/orig.rpy");
      expect(ops[0]!.localPath).toBe("game/moved.rpy");
      const [row] = await db
        .select({
          filePath: projectFiles.filePath,
          deletedAt: projectFiles.deletedAt,
        })
        .from(projectFiles)
        .where(eq(projectFiles.id, file.id));
      expect(row?.filePath).toBe("game/moved.rpy");
      expect(row?.deletedAt).toBeNull();
    });

    it("reverses a CREATE by removing the pending row", async () => {
      buildApp();
      await fastify.ready();
      const cookie = await sessionFor(testUserId);

      const createResponse = await fastify.inject({
        method: "POST",
        url: `/projects/${gitProjectId}/files`,
        payload: { filePath: "game/newfile.rpy" },
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      });
      expect(createResponse.statusCode).toBe(201);

      const response = await fastify.inject({
        method: "POST",
        url: `/projects/files/${
          JSON.parse(createResponse.payload).file.id
        }/reverse`,
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.reversed).toBe(true);
      expect(body.operation.operation).toBe("CREATE");
      expect(await getPendingOps(gitProjectId)).toHaveLength(0);
    });
  });

  // ==========================================================================
  // POST /projects/:projectId/files/discard-all (project-wide)
  // ==========================================================================

  describe("POST /projects/:projectId/files/discard-all", () => {
    it("discards every pending operation in the project, restoring the remote paths", async () => {
      buildApp();
      await fastify.ready();
      const cookie = await sessionFor(testUserId);

      // CREATE pending
      const createResponse = await fastify.inject({
        method: "POST",
        url: `/projects/${gitProjectId}/files`,
        payload: { filePath: "game/newfile.rpy" },
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      });
      expect(createResponse.statusCode).toBe(201);

      // RENAME pending
      const renamed = await createTestFile(gitProjectId, "game/disc1.rpy");
      await fastify.inject({
        method: "PATCH",
        url: `/projects/files/${renamed.id}`,
        payload: { filePath: "game/disc1_renamed.rpy" },
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      });

      // DELETE pending (tombstone)
      const deleted = await createTestFile(gitProjectId, "game/disc2.rpy");
      const [delLabel] = await db
        .insert(labels)
        .values({
          projectId: gitProjectId,
          projectFileId: deleted.id,
          title: "Del",
          labelName: "del_label",
          labelNumber: 1,
          sequenceOrder: 0,
        })
        .returning();
      await fastify.inject({
        method: "DELETE",
        url: `/projects/files/${deleted.id}`,
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      });

      const response = await fastify.inject({
        method: "POST",
        url: `/projects/${gitProjectId}/files/discard-all`,
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.discarded).toBe(true);
      expect(body.count).toBe(3);

      expect(await getPendingOps(gitProjectId)).toHaveLength(0);

      // CREATE: discard restores the remote state, which has no such file.
      const createdFileId = JSON.parse(createResponse.payload).file
        .id as string;
      const [createdFile] = await db
        .select()
        .from(projectFiles)
        .where(eq(projectFiles.id, createdFileId));
      expect(createdFile).toBeUndefined();

      // RENAME: local path restored to remote path
      const [renamedRow] = await db
        .select({ filePath: projectFiles.filePath })
        .from(projectFiles)
        .where(eq(projectFiles.id, renamed.id));
      expect(renamedRow?.filePath).toBe("game/disc1.rpy");

      // DELETE: file restored at the REMOTE path, labels reactivated
      const [deletedRow] = await db
        .select({
          filePath: projectFiles.filePath,
          deletedAt: projectFiles.deletedAt,
        })
        .from(projectFiles)
        .where(eq(projectFiles.id, deleted.id));
      expect(deletedRow?.deletedAt).toBeNull();
      expect(deletedRow?.filePath).toBe("game/disc2.rpy");
      const [delLabelRow] = await db
        .select()
        .from(labels)
        .where(eq(labels.id, delLabel!.id));
      expect(delLabelRow?.deletedAt).toBeNull();
    });

    it("returns 403 for a non-owner", async () => {
      buildApp();
      await fastify.ready();
      const cookie = await sessionFor(otherUserId);

      const response = await fastify.inject({
        method: "POST",
        url: `/projects/${gitProjectId}/files/discard-all`,
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  // ==========================================================================
  // GET /projects/:projectId/files/pending-structural
  // ==========================================================================

  describe("GET /projects/:projectId/files/pending-structural", () => {
    it("returns structural entries and every content-modified file", async () => {
      buildApp();
      await fastify.ready();
      const cookie = await sessionFor(testUserId);

      // Existing file with modified content (hash differs from baseline)
      const modified = await createTestFile(gitProjectId, "game/modified.rpy");
      await db
        .update(projectFiles)
        .set({ contentHash: "different-hash" })
        .where(eq(projectFiles.id, modified.id));

      // Legacy GitLab imports predate the durable local baseline columns.
      // Their original imported content remains the safe comparison point.
      const legacy = await createTestFile(gitProjectId, "game/legacy.rpy", {
        content: 'label legacy:\n    "Before"',
      });
      await db
        .update(projectFiles)
        .set({
          content: 'label legacy:\n    "After"',
          contentHash: calculateContentHash('label legacy:\n    "After"'),
          lastPushedContentHash: null,
          remoteContent: null,
        })
        .where(eq(projectFiles.id, legacy.id));

      // Renamed existing file whose content also changed: counts in BOTH
      const renamed = await createTestFile(
        gitProjectId,
        "game/renamed_src.rpy"
      );
      await db
        .update(projectFiles)
        .set({ contentHash: "also-different" })
        .where(eq(projectFiles.id, renamed.id));
      await fastify.inject({
        method: "PATCH",
        url: `/projects/files/${renamed.id}`,
        payload: { filePath: "game/renamed_dst.rpy" },
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      });

      // Newly created file (CREATE pending): excluded from content count
      await fastify.inject({
        method: "POST",
        url: `/projects/${gitProjectId}/files`,
        payload: { filePath: "game/brand_new.rpy" },
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      });

      const response = await fastify.inject({
        method: "GET",
        url: `/projects/${gitProjectId}/files/pending-structural`,
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.operations).toHaveLength(2); // CREATE + RENAME
      expect(
        body.operations.map((o: { operation: string }) => o.operation).sort()
      ).toEqual(["CREATE", "RENAME"]);
      expect(body.contentModifiedCount).toBe(3);
      expect(body.contentChanges).toEqual(
        expect.arrayContaining([
          { fileId: modified.id, filePath: "game/modified.rpy" },
          { fileId: legacy.id, filePath: "game/legacy.rpy" },
          { fileId: renamed.id, filePath: "game/renamed_dst.rpy" },
        ])
      );
    });
  });

  // ==========================================================================
  // Pull guard
  // ==========================================================================

  describe("pull guard", () => {
    it("blocks pull while any structural CREATE/RENAME/DELETE exists", async () => {
      const { assertNoPendingStructuralOperations } =
        await import("../../services/project-files-operations.service.js");
      const { lockProject } =
        await import("../../services/project-files-operations.service.js");

      const file = await createTestFile(gitProjectId, "game/pull_guard.rpy");
      await fastifyReady();
      const cookie = await sessionFor(testUserId);
      await fastify.inject({
        method: "PATCH",
        url: `/projects/files/${file.id}`,
        payload: { filePath: "game/pull_guard_moved.rpy" },
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      });

      await expect(
        db.transaction(async (tx) => {
          await lockProject(tx, gitProjectId);
          await assertNoPendingStructuralOperations(tx, gitProjectId);
        })
      ).rejects.toThrow(/Push or discard/);
    });

    it("allows pull when only ordinary content edits exist (no structural rows)", async () => {
      const { assertNoPendingStructuralOperations } =
        await import("../../services/project-files-operations.service.js");
      const { lockProject } =
        await import("../../services/project-files-operations.service.js");
      await fastifyReady();

      const file = await createTestFile(gitProjectId, "game/pull_ok.rpy");
      await db
        .update(projectFiles)
        .set({ contentHash: "autosaved-content-hash" })
        .where(eq(projectFiles.id, file.id));

      await expect(
        db.transaction(async (tx) => {
          await lockProject(tx, gitProjectId);
          await assertNoPendingStructuralOperations(tx, gitProjectId);
        })
      ).resolves.toBeUndefined();
    });
  });

  async function fastifyReady(): Promise<void> {
    buildApp();
    await fastify.ready();
  }
});
