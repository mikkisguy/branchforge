/**
 * User Settings Profile Routes Integration Tests
 *
 * Tests for the user profile settings functionality against a real database.
 * These tests verify:
 * - Authentication requirements
 * - Input validation (username, language, theme)
 * - Partial updates
 * - Database persistence
 * - Strict schema validation (rejects unknown fields)
 * - Avatar URL handling in GET endpoint
 *
 * Prerequisites:
 * - DATABASE_URL_TEST environment variable must be set
 * - Test database must exist and have proper schema
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import { userSettingsRoutes } from "../user-settings.routes.js";
import { getDb, closeDb } from "../../db/index.js";
import { SESSION_COOKIE_NAME } from "../../lib/session.js";
import { testEmail, testUuid } from "../../utils/test-ids.js";
import { globalErrorHandler } from "../../middleware/error-handler.middleware.js";
import {
  users,
  userSessions,
  userSettings,
  type NewUser,
  type NewUserSetting,
} from "../../db/schema/index.js";
import { eq } from "drizzle-orm";

// Test data fixtures
const testUserId = testUuid("02000000", 3);

const testUser: NewUser = {
  id: testUserId,
  email: testEmail("user-settings-profile", "owner"),
  passwordHash: "hashed_password",
  role: "OWNER",
};

const testUserSettings: NewUserSetting = {
  userId: testUserId,
  avatarUrl: "some-file.webp",
  username: null,
  language: "en",
  theme: "periwinkle",
  dailyWritingGoal: null,
  dailyWordResetHour: 0,
  dailyWordCounts: [],
  timezone: "UTC",
};

describe("User Settings Profile Routes (Integration)", () => {
  let db: ReturnType<typeof getDb>;
  let fastify: ReturnType<typeof Fastify>;
  let originalBasePath: string | undefined;

  // Helper to clean up all test data
  async function cleanupTestData() {
    await db.delete(userSettings).where(eq(userSettings.userId, testUserId));
    await db.delete(userSessions).where(eq(userSessions.userId, testUserId));
    await db.delete(users).where(eq(users.id, testUserId));
  }

  // Helper to set up test data
  async function setupTestData() {
    // Insert user with hashed password
    await db.insert(users).values(testUser);

    // Insert user settings
    await db.insert(userSettings).values(testUserSettings);
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
    originalBasePath = process.env.BASE_PATH;
    process.env.BASE_PATH = "/api/";
    db = getDb();
  });

  afterAll(async () => {
    // Clean up any test data that may remain if tests were interrupted
    await cleanupTestData();
    // Ensure fastify instance is closed
    if (fastify) {
      await fastify.close();
    }
    // Close database connection
    await closeDb();

    if (originalBasePath === undefined) {
      delete process.env.BASE_PATH;
    } else {
      process.env.BASE_PATH = originalBasePath;
    }
  });

  beforeEach(async () => {
    await cleanupTestData();
    await setupTestData();

    // Create a fresh Fastify instance for each test
    fastify = Fastify();

    // Register required plugins with memory store for testing
    await fastify.register(cookie);
    await fastify.register(session, {
      secret: "test-session-secret-for-user-settings-profile-tests",
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
    await fastify.register(userSettingsRoutes, { prefix: "/api" });

    // Register global error handler
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
          reply.status(404).send({ error: "User not found" });
          return;
        }

        request.session.user = {
          id: user.id,
          email: user.email,
          role: user.role!,
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
  });

  describe("PUT /user/settings/profile", () => {
    it("should return 401 for unauthenticated request", async () => {
      const response = await fastify.inject({
        method: "PUT",
        url: "/api/user/settings/profile",
        headers: {
          "Content-Type": "application/json",
        },
        payload: { username: "newuser" },
      });

      expect(response.statusCode).toBe(401);
    });

    it("should return 400 for invalid username (too short)", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "PUT",
        url: "/api/user/settings/profile",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${SESSION_COOKIE_NAME}=${auth.sessionId}`,
        },
        payload: { username: "a" },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      // Validation error with error and message fields
      expect(body.error).toBeDefined();
      expect(body.message).toBeDefined();
    });

    it("should return 400 for invalid theme", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "PUT",
        url: "/api/user/settings/profile",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${SESSION_COOKIE_NAME}=${auth.sessionId}`,
        },
        payload: { theme: "light" },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      // Validation error with error and message fields
      expect(body.error).toBeDefined();
      expect(body.message).toBeDefined();
    });

    it("should return 200 for successful username update", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "PUT",
        url: "/api/user/settings/profile",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${SESSION_COOKIE_NAME}=${auth.sessionId}`,
        },
        payload: { username: "newuser" },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.username).toBe("newuser");

      // Verify database persistence
      const [updatedSettings] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, testUserId))
        .limit(1);

      expect(updatedSettings.username).toBe("newuser");
    });

    it("should return 200 for successful theme update", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "PUT",
        url: "/api/user/settings/profile",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${SESSION_COOKIE_NAME}=${auth.sessionId}`,
        },
        payload: { theme: "forest" },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.theme).toBe("forest");

      // Verify database persistence
      const [updatedSettings] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, testUserId))
        .limit(1);

      expect(updatedSettings.theme).toBe("forest");
    });

    it("should return 200 for partial update (language only)", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "PUT",
        url: "/api/user/settings/profile",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${SESSION_COOKIE_NAME}=${auth.sessionId}`,
        },
        payload: { language: "fr" },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.language).toBe("fr");

      // Verify only language changed in database
      const [updatedSettings] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, testUserId))
        .limit(1);

      expect(updatedSettings.language).toBe("fr");
      expect(updatedSettings.theme).toBe("periwinkle"); // Unchanged
      expect(updatedSettings.username).toBeNull(); // Unchanged
    });

    it("should return 400 for unknown fields (strict schema)", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "PUT",
        url: "/api/user/settings/profile",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${SESSION_COOKIE_NAME}=${auth.sessionId}`,
        },
        payload: { username: "x", evil: true },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      // Validation error with error and message fields
      expect(body.error).toBeDefined();
      expect(body.message).toBeDefined();
    });

    it("should return 200 with empty body (no changes)", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "PUT",
        url: "/api/user/settings/profile",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${SESSION_COOKIE_NAME}=${auth.sessionId}`,
        },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      // All fields should be unchanged
      expect(body.language).toBe("en");
      expect(body.theme).toBe("periwinkle");
      expect(body.username).toBeNull();

      // Verify database unchanged
      const [settings] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, testUserId))
        .limit(1);

      expect(settings.language).toBe("en");
      expect(settings.theme).toBe("periwinkle");
      expect(settings.username).toBeNull();
    });

    it("GET returns avatarUrl as full URL path", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      // Update profile first
      await fastify.inject({
        method: "PUT",
        url: "/api/user/settings/profile",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${SESSION_COOKIE_NAME}=${auth.sessionId}`,
        },
        payload: { username: "testuser" },
      });

      // Then GET settings
      const getResponse = await fastify.inject({
        method: "GET",
        url: "/api/user/settings",
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${auth.sessionId}`,
        },
      });

      expect(getResponse.statusCode).toBe(200);
      const body = getResponse.json();
      // Avatar URL includes BASE_PATH prefix (/api/)
      expect(body.avatarUrl).toMatch(
        /^\/api\/uploads\/avatars\/some-file\.webp$/
      );
    });
  });
});
