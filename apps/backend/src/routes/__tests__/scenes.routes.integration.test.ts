/**
 * Scenes Routes Integration Tests
 *
 * Tests for the scenes API routes against a real database.
 * These tests verify:
 * - Full HTTP request/response cycles
 * - Real authentication middleware
 * - Real service layer integration
 * - Actual database constraints
 *
 * Prerequisites:
 * - DATABASE_URL_TEST environment variable must be set
 * - Test database must exist and have proper schema
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import { scenesRoutes } from "../scenes.routes.js";
import { getDb } from "../../db/index.js";
import { testUuid } from "../../utils/test-ids.js";
import {
  users,
  projects,
  scenes as scenesTable,
  characters,
  sceneLines,
  sceneCharacters,
  projectUsers,
  userSessions,
  gitlabFiles,
  type NewUser,
  type NewProject,
  type NewScene,
  type NewCharacter,
} from "../../db/schema/index.js";
import { eq, inArray } from "drizzle-orm";
import { testEmail } from "../../utils/test-ids.js";

describe("ScenesRoutes (Integration)", () => {
  let db: ReturnType<typeof getDb>;
  let fastify: ReturnType<typeof Fastify>;

  // Test fixtures with hardcoded UUIDs
  const testUserId = testUuid("04000000", 1);
  const otherUserId = testUuid("04000000", 2);
  const thirdUserId = testUuid("04000000", 3);

  const testUser: NewUser = {
    id: testUserId,
    email: testEmail("scenes-routes", "owner"),
    passwordHash: "hashed_password",
    role: "OWNER",
  };

  const otherUser: NewUser = {
    id: otherUserId,
    email: testEmail("scenes-routes", "other"),
    passwordHash: "hashed_password",
    role: "OWNER",
  };

  const thirdUser: NewUser = {
    id: thirdUserId,
    email: testEmail("scenes-routes", "third"),
    passwordHash: "hashed_password",
    role: "READER",
  };

  const ownedProject: NewProject = {
    id: testUuid("14000000", 1),
    userId: testUserId,
    name: "Owned Project",
    type: "ACT_BASED",
    description: "A project owned by the user",
    maxMeterDelta: 10,
  };

  const sharedProject: NewProject = {
    id: testUuid("14000000", 2),
    userId: otherUserId,
    name: "Shared Project",
    type: "CHAPTER_BASED",
    description: "A project shared with the user",
    maxMeterDelta: 15,
  };

  const ownedScene: NewScene = {
    id: testUuid("24000000", 1),
    projectId: ownedProject.id!,
    title: "chapter1_scene1",
    act: "I",
    chapter: 1,
    sceneNumber: 1,
    sequenceOrder: 0,
    route: "EILEEN",
    status: "DRAFT",
    prerequisites: {},
    effects: {},
  };

  const sharedScene: NewScene = {
    id: testUuid("24000000", 2),
    projectId: sharedProject.id!,
    title: "chapter1_scene2",
    act: "I",
    chapter: 1,
    sceneNumber: 2,
    sequenceOrder: 1,
    route: "LUCAS",
    status: "DRAFT",
    prerequisites: {},
    effects: {},
  };

  const testCharacter: NewCharacter = {
    id: testUuid("34000000", 1),
    projectId: ownedProject.id!,
    name: "Eileen",
    displayName: "Eileen",
    renpyTag: "a",
    routeAffiliation: "EILEEN",
    isLoveInterest: true,
    color: "#FF5733",
  };

  // Helper to clean up all test data
  async function cleanupTestData() {
    const testUserIds = [testUserId, otherUserId, thirdUserId];
    const sceneIds = [ownedScene.id!, sharedScene.id!];
    const projectIds = [ownedProject.id!, sharedProject.id!];

    await db.transaction(async (tx) => {
      // Delete scene-related data for both scenes in parallel
      await Promise.all([
        tx.delete(sceneCharacters).where(inArray(sceneCharacters.sceneId, sceneIds)),
        tx.delete(sceneLines).where(inArray(sceneLines.sceneId, sceneIds)),
      ]);

      // Delete scenes and characters in parallel
      await Promise.all([
        tx.delete(scenesTable).where(inArray(scenesTable.id, sceneIds)),
        tx.delete(characters).where(eq(characters.id, testCharacter.id!)),
      ]);

      // Delete project users and user sessions in parallel
      await Promise.all([
        tx.delete(projectUsers).where(inArray(projectUsers.userId, testUserIds)),
        tx.delete(userSessions).where(inArray(userSessions.userId, testUserIds)),
      ]);

      // Delete projects
      await tx.delete(projects).where(inArray(projects.id, projectIds));

      // Delete users last (due to foreign key constraints)
      await tx.delete(users).where(inArray(users.id, testUserIds));
    });
  }

  // Helper to set up test data
  async function setupTestData() {
    // Insert users
    await db.insert(users).values([testUser, otherUser, thirdUser]);

    // Insert projects
    await db.insert(projects).values([ownedProject, sharedProject]);

    // Insert scenes
    await db.insert(scenesTable).values([ownedScene, sharedScene]);
  }

  // Helper to create an authenticated request
  async function createAuthenticatedRequest(userId: string) {
    // Call the test-login route to set up the session
    const loginResponse = await fastify.inject({
      method: "POST",
      url: "/test-login",
      payload: { userId },
    });

    const sessionId = loginResponse.cookies[0]?.value;
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
    await setupTestData();

    // Create a fresh Fastify instance for each test
    fastify = Fastify();

    // Register required plugins with memory store for testing
    await fastify.register(cookie);
    await fastify.register(session, {
      secret: "test-session-secret-for-integration-tests",
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

    // Register the routes
    await scenesRoutes(fastify);

    // Add a test-only route to set the session user
    fastify.post(
      "/test-login",
      async (
        request: FastifyRequest<{ Body: { userId: string } }>,
        reply: FastifyReply,
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
            .send({ success: false, error: "user not found" });
        }
        if (!user.role) {
          return reply
            .status(500)
            .send({ success: false, error: "user role missing" });
        }

        request.session.user = {
          id: user.id,
          email: user.email,
          role: user.role,
        };

        reply.send({ success: true });
      },
    );

    await fastify.ready();
  });

  afterEach(async () => {
    if (fastify) {
      await fastify.close();
    }
    await cleanupTestData();
  });

  describe("GET /scenes", () => {
    it("should return 401 when not authenticated", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: `/scenes?projectId=${ownedProject.id}`,
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        error: "Unauthorized",
        message: "Authentication required",
      });
    });

    it("should return 400 when projectId is missing", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "GET",
        url: "/scenes",
        cookies: {
          sessionId: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        message: "Invalid query parameters",
      });
    });

    it("should return empty array when project has no scenes", async () => {
      // Create a project with no scenes
      const emptyProject = await db
        .insert(projects)
        .values({
          id: testUuid("14000000", 3),
          userId: testUserId,
          name: "Empty Project",
          type: "ACT_BASED",
          maxMeterDelta: 10,
        })
        .returning();

      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "GET",
        url: `/scenes?projectId=${emptyProject[0].id}`,
        cookies: {
          sessionId: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ scenes: [] });

      // Cleanup
      await db.delete(projects).where(eq(projects.id, emptyProject[0].id));
    });

    it("should return list of scenes for owned project", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "GET",
        url: `/scenes?projectId=${ownedProject.id}`,
        cookies: {
          sessionId: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.scenes).toHaveLength(1);
      expect(json.scenes[0]).toMatchObject({
        id: ownedScene.id,
        projectId: ownedProject.id,
        title: "chapter1_scene1",
        act: "I",
        chapter: 1,
        sceneNumber: 1,
        sequenceOrder: 0,
        routeKey: "EILEEN",
        status: "DRAFT",
        visibility: "EXCLUSIVE",
      });
      expect(typeof json.scenes[0].createdAt).toBe("string");
      expect(typeof json.scenes[0].updatedAt).toBe("string");
    });

    it("should filter by routeKey when provided", async () => {
      // Add a second scene with different route
      const secondScene = await db
        .insert(scenesTable)
        .values({
          id: testUuid("24000000", 3),
          projectId: ownedProject.id!,
          title: "chapter1_scene2",
          act: "I",
          chapter: 1,
          sceneNumber: 2,
          sequenceOrder: 1,
          route: "LUCAS",
          status: "DRAFT",
          prerequisites: {},
          effects: {},
        })
        .returning();

      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "GET",
        url: `/scenes?projectId=${ownedProject.id}&routeKey=EILEEN`,
        cookies: {
          sessionId: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.scenes).toHaveLength(1);
      expect(json.scenes[0].id).toBe(ownedScene.id);
      expect(json.scenes[0].routeKey).toBe("EILEEN");

      // Cleanup
      await db.delete(scenesTable).where(eq(scenesTable.id, secondScene[0].id));
    });

    it("should filter by status when provided", async () => {
      // Add a scene with different status
      const reviewScene = await db
        .insert(scenesTable)
        .values({
          id: testUuid("24000000", 4),
          projectId: ownedProject.id!,
          title: "chapter1_scene3",
          act: "I",
          chapter: 1,
          sceneNumber: 3,
          sequenceOrder: 2,
          route: "EILEEN",
          status: "REVIEW",
          prerequisites: {},
          effects: {},
        })
        .returning();

      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "GET",
        url: `/scenes?projectId=${ownedProject.id}&status=DRAFT`,
        cookies: {
          sessionId: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.scenes).toHaveLength(1);
      expect(json.scenes[0].id).toBe(ownedScene.id);
      expect(json.scenes[0].status).toBe("DRAFT");

      // Cleanup
      await db.delete(scenesTable).where(eq(scenesTable.id, reviewScene[0].id));
    });

    it("should return list of scenes for shared project", async () => {
      // Share the other user's project with test user
      await db.insert(projectUsers).values({
        projectId: sharedProject.id!,
        userId: testUserId,
        role: "READER",
      });

      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "GET",
        url: `/scenes?projectId=${sharedProject.id}`,
        cookies: {
          sessionId: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.scenes).toHaveLength(1);
      expect(json.scenes[0]).toMatchObject({
        id: sharedScene.id,
        projectId: sharedProject.id,
        title: "chapter1_scene2",
        routeKey: "LUCAS",
      });
    });

    it("should return empty array when user has no access to project", async () => {
      const auth = await createAuthenticatedRequest(thirdUserId);

      const response = await fastify.inject({
        method: "GET",
        url: `/scenes?projectId=${ownedProject.id}`,
        cookies: {
          sessionId: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ scenes: [] });
    });
  });

  describe("GET /scenes/:sceneId", () => {
    it("should return 401 when not authenticated", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: `/scenes/${ownedScene.id}`,
      });

      expect(response.statusCode).toBe(401);
    });

    it("should return 400 when sceneId is invalid UUID", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "GET",
        url: "/scenes/invalid-uuid",
        cookies: {
          sessionId: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        message: "Invalid URL parameters",
      });
    });

    it("should return scene with empty arrays when no lines or characters exist", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "GET",
        url: `/scenes/${ownedScene.id}`,
        cookies: {
          sessionId: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.scene).toMatchObject({
        id: ownedScene.id,
        title: "chapter1_scene1",
        lines: [],
        characters: [],
      });
    });

    it("should return scene with lines and characters", async () => {
      // Add a character
      await db.insert(characters).values(testCharacter);

      // Add scene lines
      await db.insert(sceneLines).values({
        id: testUuid("44000000", 1),
        sceneId: ownedScene.id!,
        sequence: 1,
        contentType: "DIALOGUE",
        content: "Hello world!",
        speakerId: testCharacter.id!,
        visualType: "GENERATED",
      });

      // Add scene character
      await db.insert(sceneCharacters).values({
        sceneId: ownedScene.id!,
        characterId: testCharacter.id!,
        role: "PRIMARY",
      });

      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "GET",
        url: `/scenes/${ownedScene.id}`,
        cookies: {
          sessionId: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.scene.lines).toHaveLength(1);
      expect(json.scene.lines[0]).toMatchObject({
        content: "Hello world!",
        contentType: "DIALOGUE",
        speakerId: testCharacter.id,
        speakerName: "Eileen",
        speakerTag: "a",
      });
      expect(json.scene.characters).toHaveLength(1);
      expect(json.scene.characters[0]).toMatchObject({
        id: testCharacter.id,
        name: "Eileen",
        displayName: "Eileen",
        role: "PRIMARY",
      });
    });

    it("should return 404 when scene not found", async () => {
      const auth = await createAuthenticatedRequest(testUserId);
      const nonExistentSceneId = testUuid("24000000", 999999999999);

      const response = await fastify.inject({
        method: "GET",
        url: `/scenes/${nonExistentSceneId}`,
        cookies: {
          sessionId: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "Scene not found" });
    });

    it("should return 404 when user has no access to scene", async () => {
      const auth = await createAuthenticatedRequest(thirdUserId);

      const response = await fastify.inject({
        method: "GET",
        url: `/scenes/${ownedScene.id}`,
        cookies: {
          sessionId: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "Scene not found" });
    });

    it("should return scene for user with shared access", async () => {
      // Share the other user's project with test user
      await db.insert(projectUsers).values({
        projectId: sharedProject.id!,
        userId: testUserId,
        role: "READER",
      });

      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "GET",
        url: `/scenes/${sharedScene.id}`,
        cookies: {
          sessionId: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.scene).toMatchObject({
        id: sharedScene.id,
        title: "chapter1_scene2",
      });
    });
  });

  describe("PUT /scenes/:sceneId/dialogue", () => {
    it("should return 401 when not authenticated", async () => {
      const response = await fastify.inject({
        method: "PUT",
        url: `/scenes/${ownedScene.id}/dialogue`,
        payload: {
          dialogue: [
            { speaker: "a", text: "Hello world!" },
            { speaker: null, text: "Narration here." },
          ],
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it("should return 404 when scene has no gitlab file association", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "PUT",
        url: `/scenes/${ownedScene.id}/dialogue`,
        payload: {
          dialogue: [{ speaker: "a", text: "Hello world!" }],
        },
        cookies: {
          sessionId: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "Scene or file not found" });
    });

    it("should return 400 when dialogue is missing", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "PUT",
        url: `/scenes/${ownedScene.id}/dialogue`,
        payload: {},
        cookies: {
          sessionId: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "Dialogue is required" });
    });

    it("should return 403 when user does not own the project", async () => {
      // Create a gitlab file for the shared project
      const gitlabFile = await db
        .insert(gitlabFiles)
        .values({
          id: testUuid("54000000", 1),
          projectId: sharedProject.id!,
          filePath: "script.rpy",
          fileType: "STORY",
          content: "test content",
        })
        .returning();

      // Associate scene with gitlab file
      await db
        .update(scenesTable)
        .set({ gitlabFileId: gitlabFile[0].id })
        .where(eq(scenesTable.id, sharedScene.id!));

      // Test user doesn't own this project
      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "PUT",
        url: `/scenes/${sharedScene.id}/dialogue`,
        payload: {
          dialogue: [{ speaker: "a", text: "Hello world!" }],
        },
        cookies: {
          sessionId: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: "Forbidden" });

      // Cleanup
      await db.delete(gitlabFiles).where(eq(gitlabFiles.id, gitlabFile[0].id));
    });

    it("should successfully update dialogue when user owns project", async () => {
      // Create a gitlab file for the owned project
      const gitlabFile = await db
        .insert(gitlabFiles)
        .values({
          id: testUuid("54000000", 2),
          projectId: ownedProject.id!,
          filePath: "script.rpy",
          fileType: "STORY",
          content: `label chapter1_scene1:
    "Old content"`,
        })
        .returning();

      // Associate scene with gitlab file
      await db
        .update(scenesTable)
        .set({
          gitlabFileId: gitlabFile[0].id,
          labelName: "chapter1_scene1",
          labelPosition: 0,
        })
        .where(eq(scenesTable.id, ownedScene.id!));

      const auth = await createAuthenticatedRequest(testUserId);

      const dialogue = [
        { speaker: "a", text: "Hello world!" },
        { speaker: null, text: "Narration here." },
      ];

      const response = await fastify.inject({
        method: "PUT",
        url: `/scenes/${ownedScene.id}/dialogue`,
        payload: { dialogue },
        cookies: {
          sessionId: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });

      // Verify scene lines were updated
      const lines = await db
        .select()
        .from(sceneLines)
        .where(eq(sceneLines.sceneId, ownedScene.id!))
        .orderBy(sceneLines.sequence);

      expect(lines).toHaveLength(2);
      expect(lines[0]).toMatchObject({
        sceneId: ownedScene.id,
        sequence: 1,
        contentType: "DIALOGUE",
        content: "Hello world!",
        demoNotes: "a",
      });
      expect(lines[1]).toMatchObject({
        sceneId: ownedScene.id,
        sequence: 2,
        contentType: "NARRATION",
        content: "Narration here.",
        demoNotes: null,
      });

      // Verify file content was updated
      const [updatedFile] = await db
        .select()
        .from(gitlabFiles)
        .where(eq(gitlabFiles.id, gitlabFile[0].id))
        .limit(1);

      expect(updatedFile.content).toContain("Hello world!");
      expect(updatedFile.content).toContain("Narration here.");

      // Cleanup
      await db.delete(sceneLines).where(eq(sceneLines.sceneId, ownedScene.id!));
      await db.delete(gitlabFiles).where(eq(gitlabFiles.id, gitlabFile[0].id));
    });
  });
});

