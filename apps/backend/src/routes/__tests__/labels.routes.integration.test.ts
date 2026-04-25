/**
 * Labels Routes Integration Tests
 *
 * Regression coverage for dialogue updates that reconstruct project file content.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import { labelsRoutes } from "../labels.routes.js";
import { getDb } from "../../db/index.js";
import { SESSION_COOKIE_NAME } from "../../lib/session.js";
import { testEmail, testUuid } from "../../utils/test-ids.js";
import {
  users,
  projects,
  projectFiles,
  labels,
  labelLines,
  userSessions,
  characters,
  labelCharacters,
  type NewUser,
  type NewProject,
} from "../../db/schema/index.js";
import { eq, and, inArray } from "drizzle-orm";
import { calculateContentHash } from "../../lib/hash.js";

describe("LabelsRoutes (Integration)", () => {
  let db: ReturnType<typeof getDb>;
  let fastify: ReturnType<typeof Fastify>;

  const testUserId = testUuid("23000000", 1);
  const testProjectId = testUuid("23000001", 1);
  const testFileId = testUuid("23000002", 1);
  const introLabelId = testUuid("23000003", 1);
  const sideSceneLabelId = testUuid("23000003", 2);
  const testCharacterId = testUuid("23000004", 1);
  const testCharacterId2 = testUuid("23000004", 2);

  const testUser: NewUser = {
    id: testUserId,
    email: testEmail("labels-routes", "owner"),
    passwordHash: "hashed_password",
    role: "OWNER",
  };

  const testProject: NewProject = {
    id: testProjectId,
    userId: testUserId,
    name: "Labels Route Test Project",
    description: "Project used by labels route integration tests",
    maxMeterDelta: 10,
    source: "ZIP",
  };

  const initialOriginalContent = ["label intro:", '    "Intro old"'].join("\n");
  const currentFileContent = [
    "label intro:",
    '    "Intro old"',
    "",
    "label side_scene:",
    '    "Side old"',
  ].join("\n");

  async function cleanupTestData() {
    await db
      .delete(labelLines)
      .where(inArray(labelLines.labelId, [introLabelId, sideSceneLabelId]));
    await db
      .delete(labels)
      .where(inArray(labels.id, [introLabelId, sideSceneLabelId]));
    await db
      .delete(labelCharacters)
      .where(eq(labelCharacters.labelId, introLabelId));
    await db
      .delete(characters)
      .where(inArray(characters.id, [testCharacterId, testCharacterId2]));
    await db.delete(projectFiles).where(eq(projectFiles.id, testFileId));
    await db.delete(projects).where(eq(projects.id, testProjectId));
    await db.delete(userSessions).where(eq(userSessions.userId, testUserId));
    await db.delete(users).where(eq(users.id, testUserId));
  }

  async function seedTestData() {
    await db.insert(users).values(testUser);
    await db.insert(projects).values(testProject);

    await db.insert(projectFiles).values({
      id: testFileId,
      projectId: testProjectId,
      source: "ZIP",
      filePath: "story/scene.rpy",
      fileType: "STORY",
      originalContent: initialOriginalContent,
      content: currentFileContent,
      contentHash: calculateContentHash(currentFileContent),
    });

    await db.insert(labels).values([
      {
        id: introLabelId,
        projectId: testProjectId,
        projectFileId: testFileId,
        labelName: "intro",
        title: "intro",
        labelPosition: 0,
        labelNumber: 1,
        sequenceOrder: 0,
        status: "DRAFT",
        visibility: "EXCLUSIVE",
        prerequisites: {},
        effects: {},
      },
      {
        id: sideSceneLabelId,
        projectId: testProjectId,
        projectFileId: testFileId,
        labelName: "side_scene",
        title: "side_scene",
        labelPosition: 1,
        labelNumber: 2,
        sequenceOrder: 1,
        status: "DRAFT",
        visibility: "EXCLUSIVE",
        prerequisites: {},
        effects: {},
      },
    ]);

    await db.insert(labelLines).values([
      {
        labelId: introLabelId,
        sequence: 1,
        contentType: "NARRATION",
        content: "Intro old",
        projectFileId: testFileId,
      },
      {
        labelId: sideSceneLabelId,
        sequence: 1,
        contentType: "NARRATION",
        content: "Side old",
        projectFileId: testFileId,
      },
    ]);

    await db.insert(characters).values([
      {
        id: testCharacterId,
        projectId: testProjectId,
        name: "protagonist",
        displayName: "Protagonist",
        renpyTag: "p",
        color: "#FF0000",
      },
      {
        id: testCharacterId2,
        projectId: testProjectId,
        name: "antagonist",
        displayName: "Antagonist",
        renpyTag: "a",
        color: "#0000FF",
      },
    ]);
  }

  async function createAuthenticatedRequest(userId: string) {
    const loginResponse = await fastify.inject({
      method: "POST",
      url: "/test-login",
      payload: { userId },
    });

    const sessionCookie = loginResponse.cookies.find(
      (cookie: { name: string; value: string }) =>
        cookie.name === SESSION_COOKIE_NAME
    );
    const sessionId = sessionCookie?.value;

    if (!sessionId) {
      throw new Error("Failed to create session cookie");
    }

    return { sessionId };
  }

  beforeAll(async () => {
    db = getDb();
  });

  beforeEach(async () => {
    await cleanupTestData();
    await seedTestData();

    fastify = Fastify();

    await fastify.register(cookie);
    await fastify.register(session, {
      secret: "test-session-secret-for-integration-tests",
      cookieName: SESSION_COOKIE_NAME,
      cookie: {
        secure: false,
        httpOnly: true,
        sameSite: "lax",
        maxAge: 86400000,
        path: "/",
      },
      saveUninitialized: true,
      rolling: false,
    });

    await labelsRoutes(fastify);

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
          return reply
            .status(404)
            .send({ success: false, error: "User not found" });
        }

        if (user?.role) {
          request.session.user = {
            id: user.id,
            email: user.email,
            role: user.role,
          };
        }

        reply.send({ success: true });
      }
    );

    await fastify.ready();
  });

  afterEach(async () => {
    if (fastify) {
      await fastify.close();
    }
    await cleanupTestData();
  });

  it("preserves newer label blocks when updating dialogue", async () => {
    const auth = await createAuthenticatedRequest(testUserId);

    const response = await fastify.inject({
      method: "PUT",
      url: `/labels/${introLabelId}/dialogue`,
      payload: {
        dialogue: [{ speakerId: null, text: "Intro updated" }],
      },
      cookies: {
        [SESSION_COOKIE_NAME]: auth.sessionId,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true });

    const [updatedFile] = await db
      .select({ content: projectFiles.content })
      .from(projectFiles)
      .where(eq(projectFiles.id, testFileId))
      .limit(1);

    expect(updatedFile).toBeDefined();
    expect(updatedFile.content).toContain("label intro:");
    expect(updatedFile.content).toContain('"Intro updated"');
    expect(updatedFile.content).toContain("label side_scene:");
    expect(updatedFile.content).toMatch(/label side_scene:\n\s+"Side old"/);
  });

  it("returns 409 when expected version is stale", async () => {
    const auth = await createAuthenticatedRequest(testUserId);

    const response = await fastify.inject({
      method: "PUT",
      url: `/labels/${introLabelId}/dialogue`,
      payload: {
        dialogue: [{ speakerId: null, text: "Intro update rejected" }],
        expectedVersion: 999,
      },
      cookies: {
        [SESSION_COOKIE_NAME]: auth.sessionId,
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      success: false,
      conflict: {
        reason: "STALE_LABEL_VERSION",
      },
    });
  });

  // ============================================================================
  // Label-Character Association Endpoint Tests
  // ============================================================================

  describe("Label Character Associations", () => {
    async function cleanupLabelCharacters() {
      await db
        .delete(labelCharacters)
        .where(eq(labelCharacters.labelId, introLabelId));
    }

    beforeEach(async () => {
      await cleanupLabelCharacters();
    });

    afterEach(async () => {
      await cleanupLabelCharacters();
    });

    describe("GET /labels/:labelId/characters", () => {
      it("returns empty array when no characters assigned", async () => {
        const auth = await createAuthenticatedRequest(testUserId);

        const response = await fastify.inject({
          method: "GET",
          url: `/labels/${introLabelId}/characters`,
          cookies: {
            [SESSION_COOKIE_NAME]: auth.sessionId,
          },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
          characters: [],
        });
      });

      it("returns characters assigned to label", async () => {
        const auth = await createAuthenticatedRequest(testUserId);

        // Add characters to label
        await db.insert(labelCharacters).values([
          {
            labelId: introLabelId,
            characterId: testCharacterId,
            notes: "Main character",
          },
          {
            labelId: introLabelId,
            characterId: testCharacterId2,
            notes: "Villain",
          },
        ]);

        const response = await fastify.inject({
          method: "GET",
          url: `/labels/${introLabelId}/characters`,
          cookies: {
            [SESSION_COOKIE_NAME]: auth.sessionId,
          },
        });

        expect(response.statusCode).toBe(200);
        const json = response.json();
        expect(json.characters).toHaveLength(2);
        expect(json.characters[0]).toMatchObject({
          id: testCharacterId,
          notes: "Main character",
        });
      });

      it("returns 403 when user lacks access", async () => {
        // Create another user
        const otherUserId = testUuid("23999999", 1);
        await db
          .insert(users)
          .values({
            id: otherUserId,
            email: testEmail("labels-routes", "other"),
            passwordHash: "hashed_password",
            role: "OWNER",
          })
          .onConflictDoNothing();

        const auth = await createAuthenticatedRequest(otherUserId);

        const response = await fastify.inject({
          method: "GET",
          url: `/labels/${introLabelId}/characters`,
          cookies: {
            [SESSION_COOKIE_NAME]: auth.sessionId,
          },
        });

        expect(response.statusCode).toBe(403);
      });

      it("returns 401 when not authenticated", async () => {
        const response = await fastify.inject({
          method: "GET",
          url: `/labels/${introLabelId}/characters`,
        });

        expect(response.statusCode).toBe(401);
      });
    });

    describe("POST /labels/:labelId/characters", () => {
      it("adds character to label successfully", async () => {
        const auth = await createAuthenticatedRequest(testUserId);

        const response = await fastify.inject({
          method: "POST",
          url: `/labels/${introLabelId}/characters`,
          payload: {
            characterId: testCharacterId,
            notes: "Main character",
          },
          cookies: {
            [SESSION_COOKIE_NAME]: auth.sessionId,
          },
        });

        expect(response.statusCode).toBe(201);
        const json = response.json();
        expect(json.character).toMatchObject({
          id: testCharacterId,
          notes: "Main character",
        });

        // Verify in database
        const [association] = await db
          .select()
          .from(labelCharacters)
          .where(
            and(
              eq(labelCharacters.labelId, introLabelId),
              eq(labelCharacters.characterId, testCharacterId)
            )
          );
        expect(association).toBeDefined();
      });

      it("returns 404 when character not found", async () => {
        const auth = await createAuthenticatedRequest(testUserId);

        const response = await fastify.inject({
          method: "POST",
          url: `/labels/${introLabelId}/characters`,
          payload: {
            characterId: testUuid("99999999", 1),
          },
          cookies: {
            [SESSION_COOKIE_NAME]: auth.sessionId,
          },
        });

        expect(response.statusCode).toBe(404);
      });

      it("returns 409 when character already associated", async () => {
        const auth = await createAuthenticatedRequest(testUserId);

        // Add existing association
        await db.insert(labelCharacters).values({
          labelId: introLabelId,
          characterId: testCharacterId,
        });

        const response = await fastify.inject({
          method: "POST",
          url: `/labels/${introLabelId}/characters`,
          payload: {
            characterId: testCharacterId,
          },
          cookies: {
            [SESSION_COOKIE_NAME]: auth.sessionId,
          },
        });

        expect(response.statusCode).toBe(409);
      });

      it("returns 403 when user is not project owner", async () => {
        // Create another user
        const otherUserId = testUuid("23999999", 1);
        await db
          .insert(users)
          .values({
            id: otherUserId,
            email: testEmail("labels-routes", "other"),
            passwordHash: "hashed_password",
            role: "OWNER",
          })
          .onConflictDoNothing();

        const auth = await createAuthenticatedRequest(otherUserId);

        const response = await fastify.inject({
          method: "POST",
          url: `/labels/${introLabelId}/characters`,
          payload: {
            characterId: testCharacterId,
          },
          cookies: {
            [SESSION_COOKIE_NAME]: auth.sessionId,
          },
        });

        expect(response.statusCode).toBe(403);
      });
    });

    describe("PUT /labels/:labelId/characters/:characterId", () => {
      beforeEach(async () => {
        // Add initial character association
        await db.insert(labelCharacters).values({
          labelId: introLabelId,
          characterId: testCharacterId,
          notes: "Original notes",
        });
      });

      it("updates character association successfully", async () => {
        const auth = await createAuthenticatedRequest(testUserId);

        const response = await fastify.inject({
          method: "PUT",
          url: `/labels/${introLabelId}/characters/${testCharacterId}`,
          payload: {
            notes: "Updated notes",
          },
          cookies: {
            [SESSION_COOKIE_NAME]: auth.sessionId,
          },
        });

        expect(response.statusCode).toBe(200);
        const json = response.json();
        expect(json.character).toMatchObject({
          id: testCharacterId,
          notes: "Updated notes",
        });

        // Verify in database
        const [association] = await db
          .select()
          .from(labelCharacters)
          .where(
            and(
              eq(labelCharacters.labelId, introLabelId),
              eq(labelCharacters.characterId, testCharacterId)
            )
          );
        expect(association?.notes).toBe("Updated notes");
      });

      it("allows partial updates", async () => {
        const auth = await createAuthenticatedRequest(testUserId);

        const response = await fastify.inject({
          method: "PUT",
          url: `/labels/${introLabelId}/characters/${testCharacterId}`,
          payload: {
            notes: "Partial update notes",
          },
          cookies: {
            [SESSION_COOKIE_NAME]: auth.sessionId,
          },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().character.notes).toBe("Partial update notes");
      });

      it("returns 404 when association not found", async () => {
        const auth = await createAuthenticatedRequest(testUserId);

        const response = await fastify.inject({
          method: "PUT",
          url: `/labels/${introLabelId}/characters/${testUuid("99999999", 1)}`,
          payload: {
            notes: "Some notes",
          },
          cookies: {
            [SESSION_COOKIE_NAME]: auth.sessionId,
          },
        });

        expect(response.statusCode).toBe(404);
      });

      it("returns 403 when user is not project owner", async () => {
        // Create another user
        const otherUserId = testUuid("23999999", 1);
        await db
          .insert(users)
          .values({
            id: otherUserId,
            email: testEmail("labels-routes", "other"),
            passwordHash: "hashed_password",
            role: "OWNER",
          })
          .onConflictDoNothing();

        const auth = await createAuthenticatedRequest(otherUserId);

        const response = await fastify.inject({
          method: "PUT",
          url: `/labels/${introLabelId}/characters/${testCharacterId}`,
          payload: {
            notes: "Some notes",
          },
          cookies: {
            [SESSION_COOKIE_NAME]: auth.sessionId,
          },
        });

        expect(response.statusCode).toBe(403);
      });
    });

    describe("DELETE /labels/:labelId/characters/:characterId", () => {
      beforeEach(async () => {
        // Add initial character association
        await db.insert(labelCharacters).values({
          labelId: introLabelId,
          characterId: testCharacterId,
        });
      });

      it("removes character from label successfully", async () => {
        const auth = await createAuthenticatedRequest(testUserId);

        const response = await fastify.inject({
          method: "DELETE",
          url: `/labels/${introLabelId}/characters/${testCharacterId}`,
          cookies: {
            [SESSION_COOKIE_NAME]: auth.sessionId,
          },
        });

        expect(response.statusCode).toBe(204);

        // Verify removed from database
        const [association] = await db
          .select()
          .from(labelCharacters)
          .where(
            and(
              eq(labelCharacters.labelId, introLabelId),
              eq(labelCharacters.characterId, testCharacterId)
            )
          );
        expect(association).toBeUndefined();
      });

      it("returns 404 when association not found", async () => {
        const auth = await createAuthenticatedRequest(testUserId);

        const response = await fastify.inject({
          method: "DELETE",
          url: `/labels/${introLabelId}/characters/${testUuid("99999999", 1)}`,
          cookies: {
            [SESSION_COOKIE_NAME]: auth.sessionId,
          },
        });

        expect(response.statusCode).toBe(404);
      });

      it("returns 403 when user is not project owner", async () => {
        // Create another user
        const otherUserId = testUuid("23999999", 1);
        await db
          .insert(users)
          .values({
            id: otherUserId,
            email: testEmail("labels-routes", "other"),
            passwordHash: "hashed_password",
            role: "OWNER",
          })
          .onConflictDoNothing();

        const auth = await createAuthenticatedRequest(otherUserId);

        const response = await fastify.inject({
          method: "DELETE",
          url: `/labels/${introLabelId}/characters/${testCharacterId}`,
          cookies: {
            [SESSION_COOKIE_NAME]: auth.sessionId,
          },
        });

        expect(response.statusCode).toBe(403);
      });
    });
  });
});
