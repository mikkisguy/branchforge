/**
 * Projects Routes Integration Tests
 *
 * Tests for the projects API routes against a real database.
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
import { projectsRoutes } from "../projects.routes.js";
import { getDb } from "../../db/index.js";
import { SESSION_COOKIE_NAME } from "../../lib/session.js";
import { testEmail, testUuid } from "../../utils/test-ids.js";
import {
  users,
  projects,
  projectUsers,
  userSessions,
  type NewUser,
  type NewProject,
} from "../../db/schema/index.js";
import { eq } from "drizzle-orm";

describe("ProjectsRoutes (Integration)", () => {
  let db: ReturnType<typeof getDb>;
  let fastify: ReturnType<typeof Fastify>;

  // Test fixtures with hardcoded UUIDs
  const testUserId = testUuid("01000000", 1);
  const otherUserId = testUuid("01000000", 2);
  const thirdUserId = testUuid("01000000", 3);

  const testUser: NewUser = {
    id: testUserId,
    email: testEmail("projects-routes", "owner"),
    passwordHash: "hashed_password",
    role: "OWNER",
  };

  const otherUser: NewUser = {
    id: otherUserId,
    email: testEmail("projects-routes", "other"),
    passwordHash: "hashed_password",
    role: "OWNER",
  };

  const thirdUser: NewUser = {
    id: thirdUserId,
    email: testEmail("projects-routes", "third"),
    passwordHash: "hashed_password",
    role: "READER",
  };

  const ownedProject: NewProject = {
    id: testUuid("11000000", 1),
    userId: testUserId,
    name: "Owned Project",
    description: "A project owned by the user",
    maxMeterDelta: 10,
  };

  const sharedProject: NewProject = {
    id: testUuid("11000000", 2),
    userId: otherUserId,
    name: "Shared Project",
    description: "A project shared with the user",
    maxMeterDelta: 15,
  };

  // Helper to clean up all test data
  async function cleanupTestData() {
    await db.delete(projectUsers).where(eq(projectUsers.userId, testUserId));
    await db.delete(projectUsers).where(eq(projectUsers.userId, otherUserId));
    await db.delete(projectUsers).where(eq(projectUsers.userId, thirdUserId));
    await db.delete(projects).where(eq(projects.id, ownedProject.id!));
    await db.delete(projects).where(eq(projects.id, sharedProject.id!));
    await db.delete(userSessions).where(eq(userSessions.userId, testUserId));
    await db.delete(userSessions).where(eq(userSessions.userId, otherUserId));
    await db.delete(userSessions).where(eq(userSessions.userId, thirdUserId));
    await db.delete(users).where(eq(users.id, testUserId));
    await db.delete(users).where(eq(users.id, otherUserId));
    await db.delete(users).where(eq(users.id, thirdUserId));
  }

  // Helper to set up test data
  async function setupTestData() {
    // Insert users with hashed passwords
    await db.insert(users).values([testUser, otherUser, thirdUser]);

    // Insert projects
    await db.insert(projects).values([ownedProject, sharedProject]);
  }

  // Helper to create an authenticated request
  async function createAuthenticatedRequest(userId: string) {
    // Call the test-login route to set up the session
    const loginResponse = await fastify.inject({
      method: "POST",
      url: "/test-login",
      payload: { userId },
    });

    // First try to find the canonical session cookie, then fall back to legacy name
    const sessionCookie = loginResponse.cookies.find(
      (cookie: { name: string; value: string }) => cookie.name === SESSION_COOKIE_NAME,
    );
    const sessionId = sessionCookie?.value ?? loginResponse.cookies.find(
      (cookie: { name: string; value: string }) => cookie.name === "connect.sid",
    )?.value;
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
    await projectsRoutes(fastify);

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
        if (user?.role) {
          request.session.user = {
            id: user.id,
            email: user.email,
            role: user.role,
          };
        }
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

  describe("GET /projects", () => {
    it("should return 401 when not authenticated", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/projects",
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        error: "Unauthorized",
        message: "Authentication required",
      });
    });

    it("should return empty array when user has no projects", async () => {
      const auth = await createAuthenticatedRequest(thirdUserId);

      const response = await fastify.inject({
        method: "GET",
        url: "/projects",
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ projects: [] });
    });

    it("should return list of user-owned projects", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "GET",
        url: "/projects",
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.projects).toHaveLength(1);
      expect(json.projects[0]).toMatchObject({
        id: ownedProject.id,
        name: "Owned Project",
        description: "A project owned by the user",
        maxMeterDelta: 10,
        visibility: "OWNER",
      });
      expect(json.projects[0].createdAt).toBeDefined();
      expect(json.projects[0].updatedAt).toBeDefined();
    });

    it("should return both owned and shared projects", async () => {
      // Share the other user's project with test user
      await db.insert(projectUsers).values({
        projectId: sharedProject.id!,
        userId: testUserId,
        role: "READER",
      });

      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "GET",
        url: "/projects",
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.projects).toHaveLength(2);

      const projectNames = json.projects.map((p: any) => p.name);
      expect(projectNames).toContain("Owned Project");
      expect(projectNames).toContain("Shared Project");

      const owned = json.projects.find((p: any) => p.id === ownedProject.id);
      const shared = json.projects.find((p: any) => p.id === sharedProject.id);

      expect(owned?.visibility).toBe("OWNER");
      expect(shared?.visibility).toBe("READER");
    });
  });

  describe("GET /projects/:id", () => {
    it("should return 401 when not authenticated", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: `/projects/${ownedProject.id}`,
      });

      expect(response.statusCode).toBe(401);
    });

    it("should return 400 when projectId is invalid UUID", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "GET",
        url: "/projects/invalid-uuid",
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        message: "Invalid URL parameters",
      });
    });

    it("should return project when found and accessible", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "GET",
        url: `/projects/${ownedProject.id}`,
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.project).toMatchObject({
        id: ownedProject.id,
        name: "Owned Project",
        description: "A project owned by the user",
        maxMeterDelta: 10,
        visibility: "OWNER",
      });
    });

    it("should return 404 when project not found", async () => {
      const auth = await createAuthenticatedRequest(testUserId);
      const nonExistentProjectId = testUuid("11000000", 999999999999);

      const response = await fastify.inject({
        method: "GET",
        url: `/projects/${nonExistentProjectId}`,
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "Project not found" });
    });

    it("should return 404 when user does not have access to project", async () => {
      const auth = await createAuthenticatedRequest(thirdUserId);

      const response = await fastify.inject({
        method: "GET",
        url: `/projects/${ownedProject.id}`,
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "Project not found" });
    });
  });

  describe("POST /projects", () => {
    it("should return 401 when not authenticated", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/projects",
        payload: {
          name: "New Project",
          description: "A new project",
          maxMeterDelta: 15,
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it("should create project with valid data", async () => {
      const auth = await createAuthenticatedRequest(testUserId);
      let createdProjectId: string | undefined;

      const requestBody = {
        name: "New Project",
        description: "A new project",
        maxMeterDelta: 15,
      };

      try {
        const response = await fastify.inject({
          method: "POST",
          url: "/projects",
          payload: requestBody,
          cookies: {
            [SESSION_COOKIE_NAME]: auth.sessionId,
          },
        });

        expect(response.statusCode).toBe(201);
        const json = response.json();
        createdProjectId = json.project.id;

        expect(json.project).toMatchObject({
          name: "New Project",
          description: "A new project",
          maxMeterDelta: 15,
          visibility: "OWNER",
        });
        expect(json.project.id).toBeDefined();
        expect(json.project.createdAt).toBeDefined();
        expect(json.project.updatedAt).toBeDefined();

        // Verify project was actually created in database
        const [dbProject] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, json.project.id))
          .limit(1);
        expect(dbProject).toBeDefined();
        expect(dbProject.name).toBe("New Project");
      } finally {
        if (createdProjectId) {
          await db.delete(projects).where(eq(projects.id, createdProjectId));
        }
      }
    });

    it("should return 400 when name is missing", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const requestBody = {
        name: "",
      };

      const response = await fastify.inject({
        method: "POST",
        url: "/projects",
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

    it("should allow negative maxMeterDelta", async () => {
      const auth = await createAuthenticatedRequest(testUserId);
      let createdProjectId: string | undefined;

      const requestBody = {
        name: "New Project",
        maxMeterDelta: -5,
      };

      try {
        const response = await fastify.inject({
          method: "POST",
          url: "/projects",
          payload: requestBody,
          cookies: {
            [SESSION_COOKIE_NAME]: auth.sessionId,
          },
        });

        expect(response.statusCode).toBe(201);
        const json = response.json();
        createdProjectId = json.project.id;

        expect(json.project).toMatchObject({
          name: "New Project",
          maxMeterDelta: -5,
          visibility: "OWNER",
        });
      } finally {
        if (createdProjectId) {
          await db.delete(projects).where(eq(projects.id, createdProjectId));
        }
      }
    });
  });
});

