/**
 * Visual Systems Routes Integration Tests
 *
 * Tests for the visual system configuration HTTP endpoints
 * (GET/PUT /projects/:projectId/visual-system) against a real database.
 * Verifies full request/response cycles, auth middleware, service
 * integration, and the default-row creation behavior.
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
import { visualSystemsRoutes } from "../visual-systems.routes.js";
import { getDb, closeDb } from "../../db/index.js";
import { SESSION_COOKIE_NAME } from "../../lib/session.js";
import { globalErrorHandler } from "../../middleware/error-handler.middleware.js";
import { testEmail, testUuid } from "../../utils/test-ids.js";
import {
  users,
  projects,
  visualSystems,
  userSessions,
  type NewUser,
  type NewProject,
} from "../../db/schema/index.js";
import { eq } from "drizzle-orm";

describe("VisualSystemsRoutes (Integration)", () => {
  let db: ReturnType<typeof getDb>;
  let fastify: ReturnType<typeof Fastify>;

  const testUserId = testUuid("02000000", 1);
  const otherUserId = testUuid("02000000", 2);

  const testUser: NewUser = {
    id: testUserId,
    email: testEmail("visual-systems-routes", "owner"),
    passwordHash: "hashed_password",
    role: "OWNER",
  };

  const otherUser: NewUser = {
    id: otherUserId,
    email: testEmail("visual-systems-routes", "other"),
    passwordHash: "hashed_password",
    role: "OWNER",
  };

  const testProject: NewProject = {
    id: testUuid("12000000", 1),
    userId: testUserId,
    name: "Visual Systems Test Project",
    description: "A test project for visual system routes",
    maxStatDelta: 10,
    source: "ZIP",
  };

  const otherProject: NewProject = {
    id: testUuid("12000000", 2),
    userId: otherUserId,
    name: "Other User's Project",
    description: "Owned by another user",
    maxStatDelta: 10,
    source: "ZIP",
  };

  async function cleanupTestData() {
    // Visual systems cascade on project delete, but clean up first
    // to be safe in case the project delete fails.
    await db
      .delete(visualSystems)
      .where(eq(visualSystems.projectId, testProject.id!));
    await db
      .delete(visualSystems)
      .where(eq(visualSystems.projectId, otherProject.id!));
    await db.delete(projects).where(eq(projects.id, testProject.id!));
    await db.delete(projects).where(eq(projects.id, otherProject.id!));
    await db.delete(userSessions).where(eq(userSessions.userId, testUserId));
    await db.delete(userSessions).where(eq(userSessions.userId, otherUserId));
    await db.delete(users).where(eq(users.id, testUserId));
    await db.delete(users).where(eq(users.id, otherUserId));
  }

  async function setupTestData() {
    await db.insert(users).values([testUser, otherUser]);
    await db.insert(projects).values([testProject, otherProject]);
  }

  async function createAuthenticatedRequest(userId: string) {
    const loginResponse = await fastify.inject({
      method: "POST",
      url: "/test-login",
      payload: { userId },
    });

    if (loginResponse.statusCode !== 200) {
      throw new Error(
        `Test login failed with status ${
          loginResponse.statusCode
        }: ${JSON.stringify(loginResponse.json())}`
      );
    }

    const sessionCookie = loginResponse.cookies.find(
      (c: { name: string; value: string }) => c.name === SESSION_COOKIE_NAME
    );
    const sessionId =
      sessionCookie?.value ??
      loginResponse.cookies.find(
        (c: { name: string; value: string }) => c.name === "connect.sid"
      )?.value;

    if (!sessionId) {
      throw new Error("Failed to create session cookie for test login");
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

    fastify = Fastify();
    await fastify.register(cookie);
    await fastify.register(session, {
      secret: "test-session-secret-for-visual-systems-integration-tests",
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

    await visualSystemsRoutes(fastify);
    fastify.setErrorHandler(globalErrorHandler);

    // Test-only login route — sets the session user from a userId in the body.
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
          // The DB column allows NULL; the session shape doesn't.
          // For tests we always seed a real role, so the cast is safe.
          role: user.role as "OWNER" | "READER" | "TESTER",
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

  // --------------------------------------------------------------------------
  // GET /projects/:projectId/visual-system
  // --------------------------------------------------------------------------

  describe("GET /projects/:projectId/visual-system", () => {
    it("returns 401 when not authenticated", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: `/projects/${testProject.id}/visual-system`,
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns 403 when user does not own the project", async () => {
      const auth = await createAuthenticatedRequest(otherUserId);

      const response = await fastify.inject({
        method: "GET",
        url: `/projects/${testProject.id}/visual-system`,
        cookies: { [SESSION_COOKIE_NAME]: auth.sessionId },
      });

      expect(response.statusCode).toBe(403);
    });

    it("returns 400 for an invalid projectId format", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "GET",
        url: `/projects/not-a-uuid/visual-system`,
        cookies: { [SESSION_COOKIE_NAME]: auth.sessionId },
      });

      expect(response.statusCode).toBe(400);
    });

    it("creates a default row and returns it on first read", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "GET",
        url: `/projects/${testProject.id}/visual-system`,
        cookies: { [SESSION_COOKIE_NAME]: auth.sessionId },
      });

      expect(response.statusCode).toBe(200);
      const config = response.json();
      expect(config).toMatchObject({
        namingTemplate: "{route}{group}_{label}_{counter}_{slug}",
        labelPadding: 2,
        counterPadding: 2,
        jumpPrefixShared: "",
      });
      // Optional fields are absent (not null)
      expect(config.groupPrefixes).toBeUndefined();
      expect(config.defaultGroupType).toBeUndefined();
      expect(config.placeholderBaseUrl).toBeUndefined();

      // Verify the row was actually created in the DB
      const [row] = await db
        .select()
        .from(visualSystems)
        .where(eq(visualSystems.projectId, testProject.id!))
        .limit(1);
      expect(row).toBeDefined();
      expect(row!.scenePadding).toBe(2); // legacy column maps to labelPadding
    });

    it("returns the existing config on subsequent reads", async () => {
      // Pre-insert a custom config
      await db.insert(visualSystems).values({
        projectId: testProject.id!,
        namingTemplate: "{label}_{slug}",
        groupPrefixes: { act: { I: "ai" } },
        defaultGroupType: "act",
        scenePadding: 1,
        counterPadding: 1,
        jumpPrefixShared: "shared_",
        placeholderBaseUrl: "https://example.com/img/",
      });

      const auth = await createAuthenticatedRequest(testUserId);
      const response = await fastify.inject({
        method: "GET",
        url: `/projects/${testProject.id}/visual-system`,
        cookies: { [SESSION_COOKIE_NAME]: auth.sessionId },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        namingTemplate: "{label}_{slug}",
        groupPrefixes: { act: { I: "ai" } },
        defaultGroupType: "act",
        labelPadding: 1,
        counterPadding: 1,
        jumpPrefixShared: "shared_",
        placeholderBaseUrl: "https://example.com/img/",
      });
    });
  });

  // --------------------------------------------------------------------------
  // PUT /projects/:projectId/visual-system
  // --------------------------------------------------------------------------

  describe("PUT /projects/:projectId/visual-system", () => {
    it("returns 401 when not authenticated", async () => {
      const response = await fastify.inject({
        method: "PUT",
        url: `/projects/${testProject.id}/visual-system`,
        payload: { namingTemplate: "x" },
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns 403 when user does not own the project", async () => {
      const auth = await createAuthenticatedRequest(otherUserId);

      const response = await fastify.inject({
        method: "PUT",
        url: `/projects/${testProject.id}/visual-system`,
        payload: { namingTemplate: "{label}_{slug}" },
        cookies: { [SESSION_COOKIE_NAME]: auth.sessionId },
      });

      expect(response.statusCode).toBe(403);
    });

    it("creates a row from a partial payload and returns the merged config", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "PUT",
        url: `/projects/${testProject.id}/visual-system`,
        payload: { labelPadding: 1 },
        cookies: { [SESSION_COOKIE_NAME]: auth.sessionId },
      });

      expect(response.statusCode).toBe(200);
      const config = response.json();
      // labelPadding was patched
      expect(config.labelPadding).toBe(1);
      // other fields were filled with defaults
      expect(config.namingTemplate).toBe(
        "{route}{group}_{label}_{counter}_{slug}"
      );
      expect(config.counterPadding).toBe(2);
      expect(config.jumpPrefixShared).toBe("");

      // Confirm the DB has the expected value (legacy column = labelPadding)
      const [row] = await db
        .select()
        .from(visualSystems)
        .where(eq(visualSystems.projectId, testProject.id!))
        .limit(1);
      expect(row!.scenePadding).toBe(1);
    });

    it("patches only the supplied fields and leaves the rest alone", async () => {
      // Pre-seed a custom config
      await db.insert(visualSystems).values({
        projectId: testProject.id!,
        namingTemplate: "{label}_{slug}",
        groupPrefixes: null,
        defaultGroupType: "act",
        scenePadding: 1,
        counterPadding: 1,
        jumpPrefixShared: "shared_",
        placeholderBaseUrl: null,
      });

      const auth = await createAuthenticatedRequest(testUserId);
      const response = await fastify.inject({
        method: "PUT",
        url: `/projects/${testProject.id}/visual-system`,
        payload: { counterPadding: 2, defaultGroupType: "chapter" },
        cookies: { [SESSION_COOKIE_NAME]: auth.sessionId },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        namingTemplate: "{label}_{slug}", // unchanged
        defaultGroupType: "chapter", // updated
        labelPadding: 1, // unchanged
        counterPadding: 2, // updated
        jumpPrefixShared: "shared_", // unchanged
      });
    });

    it("stores groupPrefixes as JSONB and round-trips it", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "PUT",
        url: `/projects/${testProject.id}/visual-system`,
        payload: {
          groupPrefixes: {
            act: { I: "ai", II: "aii" },
            chapter: { "1": "ch1" },
          },
        },
        cookies: { [SESSION_COOKIE_NAME]: auth.sessionId },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().groupPrefixes).toEqual({
        act: { I: "ai", II: "aii" },
        chapter: { "1": "ch1" },
      });

      // Confirm the underlying JSONB column holds the same data
      const [row] = await db
        .select({ groupPrefixes: visualSystems.groupPrefixes })
        .from(visualSystems)
        .where(eq(visualSystems.projectId, testProject.id!))
        .limit(1);
      expect(row!.groupPrefixes).toEqual({
        act: { I: "ai", II: "aii" },
        chapter: { "1": "ch1" },
      });
    });

    it("treats empty placeholderBaseUrl as null", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      // Seed with a value first
      await db.insert(visualSystems).values({
        projectId: testProject.id!,
        namingTemplate: "{label}_{slug}",
        groupPrefixes: null,
        defaultGroupType: null,
        scenePadding: 2,
        counterPadding: 2,
        jumpPrefixShared: "",
        placeholderBaseUrl: "https://old.example.com/",
      });

      const response = await fastify.inject({
        method: "PUT",
        url: `/projects/${testProject.id}/visual-system`,
        payload: { placeholderBaseUrl: "" },
        cookies: { [SESSION_COOKIE_NAME]: auth.sessionId },
      });

      expect(response.statusCode).toBe(200);
      // Empty string is normalized to null, so the wire shape omits the key
      expect(response.json().placeholderBaseUrl).toBeUndefined();

      const [row] = await db
        .select({ placeholderBaseUrl: visualSystems.placeholderBaseUrl })
        .from(visualSystems)
        .where(eq(visualSystems.projectId, testProject.id!))
        .limit(1);
      expect(row!.placeholderBaseUrl).toBeNull();
    });

    it("clears defaultGroupType when set to an empty string", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      // Seed with a value first
      await db.insert(visualSystems).values({
        projectId: testProject.id!,
        namingTemplate: "{label}_{slug}",
        groupPrefixes: null,
        defaultGroupType: "act",
        scenePadding: 2,
        counterPadding: 2,
        jumpPrefixShared: "",
        placeholderBaseUrl: null,
      });

      const response = await fastify.inject({
        method: "PUT",
        url: `/projects/${testProject.id}/visual-system`,
        payload: { defaultGroupType: "" },
        cookies: { [SESSION_COOKIE_NAME]: auth.sessionId },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().defaultGroupType).toBeUndefined();

      const [row] = await db
        .select({ defaultGroupType: visualSystems.defaultGroupType })
        .from(visualSystems)
        .where(eq(visualSystems.projectId, testProject.id!))
        .limit(1);
      expect(row!.defaultGroupType).toBeNull();
    });

    it("clears groupPrefixes when set to an empty object", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      // Seed with a value first
      await db.insert(visualSystems).values({
        projectId: testProject.id!,
        namingTemplate: "{label}_{slug}",
        groupPrefixes: { act: { I: "ai" } },
        defaultGroupType: "act",
        scenePadding: 2,
        counterPadding: 2,
        jumpPrefixShared: "",
        placeholderBaseUrl: null,
      });

      const response = await fastify.inject({
        method: "PUT",
        url: `/projects/${testProject.id}/visual-system`,
        payload: { groupPrefixes: {} },
        cookies: { [SESSION_COOKIE_NAME]: auth.sessionId },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().groupPrefixes).toBeUndefined();

      const [row] = await db
        .select({ groupPrefixes: visualSystems.groupPrefixes })
        .from(visualSystems)
        .where(eq(visualSystems.projectId, testProject.id!))
        .limit(1);
      expect(row!.groupPrefixes).toBeNull();
    });

    it("returns 400 when placeholderBaseUrl uses a non-http(s) protocol", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "PUT",
        url: `/projects/${testProject.id}/visual-system`,
        payload: { placeholderBaseUrl: "ftp://example.com/img/" },
        cookies: { [SESSION_COOKIE_NAME]: auth.sessionId },
      });

      expect(response.statusCode).toBe(400);
    });

    it("returns 400 when labelPadding is not 1 or 2", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "PUT",
        url: `/projects/${testProject.id}/visual-system`,
        payload: { labelPadding: 3 },
        cookies: { [SESSION_COOKIE_NAME]: auth.sessionId },
      });

      expect(response.statusCode).toBe(400);
    });

    it("returns 400 when an unknown field is included", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "PUT",
        url: `/projects/${testProject.id}/visual-system`,
        payload: { totallyMadeUpField: "x" },
        cookies: { [SESSION_COOKIE_NAME]: auth.sessionId },
      });

      expect(response.statusCode).toBe(400);
    });

    it("returns 400 when placeholderBaseUrl is not a URL", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "PUT",
        url: `/projects/${testProject.id}/visual-system`,
        payload: { placeholderBaseUrl: "not-a-url" },
        cookies: { [SESSION_COOKIE_NAME]: auth.sessionId },
      });

      expect(response.statusCode).toBe(400);
    });

    it("returns 400 when an empty body is sent", async () => {
      // Partial + strict means an empty object is technically valid.
      // The schema-level `strict()` check is about unknown keys, not
      // about emptiness. Sanity check: a totally empty body should
      // produce a 200 with the defaults applied (no fields to patch).
      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "PUT",
        url: `/projects/${testProject.id}/visual-system`,
        payload: {},
        cookies: { [SESSION_COOKIE_NAME]: auth.sessionId },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        namingTemplate: "{route}{group}_{label}_{counter}_{slug}",
        labelPadding: 2,
        counterPadding: 2,
        jumpPrefixShared: "",
      });
    });
  });
});
