/**
 * Characters Routes Integration Tests
 *
 * Tests for the characters API routes against a real database.
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

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from "vitest";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import { charactersRoutes } from "../characters.routes.js";
import { getDb, closeDb } from "../../db/index.js";
import { SESSION_COOKIE_NAME } from "../../lib/session.js";
import { globalErrorHandler } from "../../middleware/error-handler.middleware.js";
import { testEmail, testUuid } from "../../utils/test-ids.js";
import {
  users,
  projects,
  characters,
  userSessions,
  type NewUser,
  type NewProject,
  type NewCharacter,
} from "../../db/schema/index.js";
import { eq } from "drizzle-orm";

describe("CharactersRoutes (Integration)", () => {
  let db: ReturnType<typeof getDb>;
  let fastify: ReturnType<typeof Fastify>;

  // Test fixtures with hardcoded UUIDs
  const testUserId = testUuid("02000000", 1);
  const otherUserId = testUuid("02000000", 2);

  const testUser: NewUser = {
    id: testUserId,
    email: testEmail("characters-routes", "owner"),
    passwordHash: "hashed_password",
    role: "OWNER",
  };

  const otherUser: NewUser = {
    id: otherUserId,
    email: testEmail("characters-routes", "other"),
    passwordHash: "hashed_password",
    role: "OWNER",
  };

  const testProject: NewProject = {
    id: testUuid("12000000", 1),
    userId: testUserId,
    name: "Test Project",
    description: "A test project for character routes",
    maxStatDelta: 10,
    source: "ZIP",
  };

  const otherProject: NewProject = {
    id: testUuid("12000000", 2),
    userId: otherUserId,
    name: "Other User's Project",
    description: "A project owned by another user",
    maxStatDelta: 15,
    source: "ZIP",
  };

  // Test characters
  const testCharacter1: NewCharacter = {
    projectId: testProject.id!,
    name: "Eileen",
    displayName: "Eileen",
    renpyTag: "a",
    color: "#FF6B6B",
    routeAffiliation: "EILEEN",
    isLoveInterest: true,
    notes: "casual notes",
    conditionalPrefix: null,
  };

  const testCharacter2: NewCharacter = {
    projectId: testProject.id!,
    name: "Lucas",
    displayName: "Lucas",
    renpyTag: "l",
    color: "#4ECDC4",
    routeAffiliation: "LUCAS",
    isLoveInterest: true,
    notes: "formal notes",
    conditionalPrefix: "lucas_",
  };

  const otherProjectCharacter: NewCharacter = {
    projectId: otherProject.id!,
    name: "Other Character",
    displayName: "Other Char",
    renpyTag: "other",
    color: "#95E1D3",
    routeAffiliation: null,
    isLoveInterest: false,
    notes: null,
    conditionalPrefix: null,
  };

  // Helper to clean up all test data
  async function cleanupTestData() {
    await db
      .delete(characters)
      .where(eq(characters.projectId, testProject.id!));
    await db
      .delete(characters)
      .where(eq(characters.projectId, otherProject.id!));
    await db.delete(projects).where(eq(projects.id, testProject.id!));
    await db.delete(projects).where(eq(projects.id, otherProject.id!));
    await db.delete(userSessions).where(eq(userSessions.userId, testUserId));
    await db.delete(userSessions).where(eq(userSessions.userId, otherUserId));
    await db.delete(users).where(eq(users.id, testUserId));
    await db.delete(users).where(eq(users.id, otherUserId));
  }

  // Helper to set up test data
  async function setupTestData() {
    // Insert users with hashed passwords
    await db.insert(users).values([testUser, otherUser]);

    // Insert projects
    await db.insert(projects).values([testProject, otherProject]);
  }

  // Helper to create an authenticated request
  async function createAuthenticatedRequest(userId: string) {
    // Call the test-login route to set up the session
    const loginResponse = await fastify.inject({
      method: "POST",
      url: "/test-login",
      payload: { userId },
    });

    // Verify the test-login request succeeded before attempting to read cookies
    if (loginResponse.statusCode !== 200) {
      throw new Error(
        `Test login request failed with status ${
          loginResponse.statusCode
        }: ${JSON.stringify(loginResponse.json())}`
      );
    }

    // First try to find the canonical session cookie, then fall back to legacy name
    const sessionCookie = loginResponse.cookies.find(
      (cookie: { name: string; value: string }) =>
        cookie.name === SESSION_COOKIE_NAME
    );
    const sessionId =
      sessionCookie?.value ??
      loginResponse.cookies.find(
        (cookie: { name: string; value: string }) =>
          cookie.name === "connect.sid"
      )?.value;
    if (!sessionId) {
      throw new Error(
        `Failed to create session cookie: no '${SESSION_COOKIE_NAME}' or 'connect.sid' cookie found in response`
      );
    }

    return { sessionId };
  }

  beforeAll(async () => {
    db = getDb();
  });

  afterAll(async () => {
    await closeDb();
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

    // Register the routes
    await charactersRoutes(fastify);

    // Register global error handler to handle errors from service layer
    fastify.setErrorHandler(globalErrorHandler);

    // Add a test-only route to set the session user
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
          return reply.code(404).send({
            success: false,
            error: "user not found",
          });
        }

        request.session.user = {
          id: user.id,
          email: user.email,
          role: user.role,
        };

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

  describe("GET /projects/:projectId/characters", () => {
    it("should return 401 when not authenticated", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: `/projects/${testProject.id}/characters`,
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        error: "Unauthorized",
        message: "Authentication required",
      });
    });

    it("should return 403 when user does not own the project", async () => {
      const auth = await createAuthenticatedRequest(otherUserId);

      const response = await fastify.inject({
        method: "GET",
        url: `/projects/${testProject.id}/characters`,
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({
        error: "ForbiddenError",
        message: "Insufficient permissions",
      });
    });

    it("should return empty array when no characters", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "GET",
        url: `/projects/${testProject.id}/characters`,
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ characters: [] });
    });

    it("should return all project characters ordered by renpyTag", async () => {
      // Insert characters in non-alphabetical order
      await db.insert(characters).values([testCharacter2, testCharacter1]);

      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "GET",
        url: `/projects/${testProject.id}/characters`,
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.characters).toHaveLength(2);
      // Should be ordered by renpyTag (a, l)
      expect(json.characters[0]).toMatchObject({
        name: "Eileen",
        displayName: "Eileen",
        renpyTag: "a",
        color: "#FF6B6B",
        routeAffiliation: "EILEEN",
        isLoveInterest: true,
      });
      expect(json.characters[1]).toMatchObject({
        name: "Lucas",
        displayName: "Lucas",
        renpyTag: "l",
        color: "#4ECDC4",
        routeAffiliation: "LUCAS",
        isLoveInterest: true,
      });
    });
  });

  describe("GET /characters/:characterId", () => {
    it("should return 401 when not authenticated", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: `/characters/${testUuid("13000000", 1)}`,
      });

      expect(response.statusCode).toBe(401);
    });

    it("should return 404 for non-existent character", async () => {
      const auth = await createAuthenticatedRequest(testUserId);
      const nonExistentCharacterId = testUuid("13000000", 999999999999);

      const response = await fastify.inject({
        method: "GET",
        url: `/characters/${nonExistentCharacterId}`,
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: "NotFoundError",
        message: "Character not found",
      });
    });

    it("should return 403 when user does not own the project", async () => {
      const [otherChar] = await db
        .insert(characters)
        .values(otherProjectCharacter)
        .returning();

      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "GET",
        url: `/characters/${otherChar.id}`,
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({
        error: "ForbiddenError",
        message: "Insufficient permissions",
      });
    });

    it("should return character data for valid ID", async () => {
      const [char] = await db
        .insert(characters)
        .values(testCharacter1)
        .returning();

      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "GET",
        url: `/characters/${char.id}`,
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.character).toMatchObject({
        id: char.id,
        name: "Eileen",
        displayName: "Eileen",
        renpyTag: "a",
        color: "#FF6B6B",
        routeAffiliation: "EILEEN",
        isLoveInterest: true,
        notes: "casual notes",
        conditionalPrefix: null,
      });
    });
  });

  describe("POST /projects/:projectId/characters", () => {
    it("should return 401 when not authenticated", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: `/projects/${testProject.id}/characters`,
        payload: testCharacter1,
      });

      expect(response.statusCode).toBe(401);
    });

    it("should return 403 when user does not own the project", async () => {
      const auth = await createAuthenticatedRequest(otherUserId);

      const requestBody = {
        projectId: testProject.id,
        name: testCharacter1.name,
        displayName: testCharacter1.displayName,
        renpyTag: testCharacter1.renpyTag,
        color: testCharacter1.color,
        routeAffiliation: testCharacter1.routeAffiliation,
        isLoveInterest: testCharacter1.isLoveInterest,
        notes: testCharacter1.notes,
        // Don't include conditionalPrefix since it's null
      };

      const response = await fastify.inject({
        method: "POST",
        url: `/projects/${testProject.id}/characters`,
        payload: requestBody,
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({
        error: "ForbiddenError",
        message: "Insufficient permissions",
      });
    });

    it("should create character with valid data", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const requestBody = {
        projectId: testProject.id,
        name: "New Character",
        displayName: "New Char",
        renpyTag: "new_char",
        color: "#123456",
        routeAffiliation: "EILEEN",
        isLoveInterest: true,
        notes: "casual notes",
        conditionalPrefix: "new_",
      };

      const response = await fastify.inject({
        method: "POST",
        url: `/projects/${testProject.id}/characters`,
        payload: requestBody,
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(201);
      const json = response.json();
      expect(json.character).toMatchObject({
        name: "New Character",
        displayName: "New Char",
        renpyTag: "new_char",
        color: "#123456",
        routeAffiliation: "EILEEN",
        isLoveInterest: true,
        notes: "casual notes",
        conditionalPrefix: "new_",
      });
      expect(json.character.id).toBeDefined();

      // Verify character was actually created in database
      const [dbCharacter] = await db
        .select()
        .from(characters)
        .where(eq(characters.id, json.character.id))
        .limit(1);
      expect(dbCharacter).toBeDefined();
      expect(dbCharacter.name).toBe("New Character");
    });

    it("should return 409 for duplicate renpyTag", async () => {
      // Insert existing character
      await db.insert(characters).values(testCharacter1);

      const auth = await createAuthenticatedRequest(testUserId);

      const requestBody = {
        projectId: testProject.id,
        name: "Different Name",
        displayName: "Different Display",
        renpyTag: "a", // Same tag as testCharacter1
        color: "#654321",
      };

      const response = await fastify.inject({
        method: "POST",
        url: `/projects/${testProject.id}/characters`,
        payload: requestBody,
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({
        error: "ConflictError",
        message: "Resource conflict",
      });
    });

    it("should validate required fields", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const requestBody = {
        name: "",
        displayName: "Test",
        renpyTag: "test",
        color: "invalid-color",
      };

      const response = await fastify.inject({
        method: "POST",
        url: `/projects/${testProject.id}/characters`,
        payload: requestBody,
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        message: "Invalid request data",
      });
    });

    it("should allow creating character with minimal required fields", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const requestBody = {
        projectId: testProject.id,
        name: "Minimal Character",
        displayName: "Minimal",
        renpyTag: "minimal",
        color: "#ABCDEF",
      };

      const response = await fastify.inject({
        method: "POST",
        url: `/projects/${testProject.id}/characters`,
        payload: requestBody,
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(201);
      const json = response.json();
      expect(json.character).toMatchObject({
        name: "Minimal Character",
        displayName: "Minimal",
        renpyTag: "minimal",
        color: "#ABCDEF",
        routeAffiliation: null,
        isLoveInterest: false,
        notes: null,
        conditionalPrefix: null,
      });
    });
  });

  describe("PUT /characters/:characterId", () => {
    it("should return 401 when not authenticated", async () => {
      const response = await fastify.inject({
        method: "PUT",
        url: `/characters/${testUuid("13000000", 1)}`,
        payload: { name: "Updated" },
      });

      expect(response.statusCode).toBe(401);
    });

    it("should return 404 for non-existent character", async () => {
      const auth = await createAuthenticatedRequest(testUserId);
      const nonExistentCharacterId = testUuid("13000000", 999999999999);

      const response = await fastify.inject({
        method: "PUT",
        url: `/characters/${nonExistentCharacterId}`,
        payload: { name: "Updated" },
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: "NotFoundError",
        message: "Character not found",
      });
    });

    it("should return 403 when user does not own the project", async () => {
      const [otherChar] = await db
        .insert(characters)
        .values(otherProjectCharacter)
        .returning();

      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "PUT",
        url: `/characters/${otherChar.id}`,
        payload: { name: "Updated" },
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({
        error: "ForbiddenError",
        message: "Insufficient permissions",
      });
    });

    it("should update character with valid data", async () => {
      const [char] = await db
        .insert(characters)
        .values(testCharacter1)
        .returning();

      const auth = await createAuthenticatedRequest(testUserId);

      const requestBody = {
        name: "Updated Eileen",
        displayName: "Updated Display",
        color: "#00FF00",
        isLoveInterest: false,
      };

      const response = await fastify.inject({
        method: "PUT",
        url: `/characters/${char.id}`,
        payload: requestBody,
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.character).toMatchObject({
        id: char.id,
        name: "Updated Eileen",
        displayName: "Updated Display",
        renpyTag: "a", // Unchanged
        color: "#00FF00",
        routeAffiliation: "EILEEN", // Unchanged
        isLoveInterest: false,
        notes: "casual notes", // Unchanged
        conditionalPrefix: null, // Unchanged
      });
    });

    it("should allow partial updates", async () => {
      const [char] = await db
        .insert(characters)
        .values(testCharacter1)
        .returning();

      const auth = await createAuthenticatedRequest(testUserId);

      const requestBody = {
        isLoveInterest: false,
      };

      const response = await fastify.inject({
        method: "PUT",
        url: `/characters/${char.id}`,
        payload: requestBody,
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.character).toMatchObject({
        name: "Eileen",
        displayName: "Eileen",
        renpyTag: "a",
        color: "#FF6B6B",
        isLoveInterest: false,
      });
    });
  });

  describe("DELETE /characters/:characterId", () => {
    it("should return 401 when not authenticated", async () => {
      const response = await fastify.inject({
        method: "DELETE",
        url: `/characters/${testUuid("13000000", 1)}`,
      });

      expect(response.statusCode).toBe(401);
    });

    it("should return 404 for non-existent character", async () => {
      const auth = await createAuthenticatedRequest(testUserId);
      const nonExistentCharacterId = testUuid("13000000", 999999999999);

      const response = await fastify.inject({
        method: "DELETE",
        url: `/characters/${nonExistentCharacterId}`,
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: "NotFoundError",
        message: "Character not found",
      });
    });

    it("should return 403 when user does not own the project", async () => {
      const [otherChar] = await db
        .insert(characters)
        .values(otherProjectCharacter)
        .returning();

      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "DELETE",
        url: `/characters/${otherChar.id}`,
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({
        error: "ForbiddenError",
        message: "Insufficient permissions",
      });
    });

    it("should delete character successfully", async () => {
      const [char] = await db
        .insert(characters)
        .values(testCharacter1)
        .returning();

      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "DELETE",
        url: `/characters/${char.id}`,
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(204);

      // Verify character was actually deleted from database
      const [dbCharacter] = await db
        .select()
        .from(characters)
        .where(eq(characters.id, char.id))
        .limit(1);
      expect(dbCharacter).toBeUndefined();
    });
  });
});
