/**
 * Avatar Routes Integration Tests
 *
 * Tests for the character avatar upload functionality against a real database.
 * These tests verify:
 * - File upload handling with multipart/form-data
 * - Image validation (size, type)
 * - Image processing (WebP conversion, resizing)
 * - Avatar URL generation and storage
 * - Avatar deletion
 * - File cleanup on character deletion
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
  vi,
} from "vitest";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { promises as fs } from "node:fs";
import {
  charactersRoutes,
  characterAvatarRoutes,
} from "../characters.routes.js";
import { getDb, closeDb } from "../../db/index.js";
import { SESSION_COOKIE_NAME } from "../../lib/session.js";
import { testEmail, testUuid } from "../../utils/test-ids.js";
import { globalErrorHandler } from "../../middleware/error-handler.middleware.js";
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
import { getAvatarFullPath } from "../../lib/storage.js";
import { AVATAR_MAX_SIZE, AVATAR_MAX_SIZE_MB } from "@branchforge/shared";

// Test data fixtures
const testUserId = testUuid("02000000", 1);
const otherUserId = testUuid("02000000", 2);

const testUser: NewUser = {
  id: testUserId,
  email: testEmail("avatar-routes", "owner"),
  passwordHash: "hashed_password",
  role: "OWNER",
};

const otherUser: NewUser = {
  id: otherUserId,
  email: testEmail("avatar-routes", "other"),
  passwordHash: "hashed_password",
  role: "OWNER",
};

const testProject: NewProject = {
  id: testUuid("12000000", 1),
  userId: testUserId,
  name: "Test Avatar Project",
  description: "A test project for avatar routes",
  maxMeterDelta: 10,
};

const testCharacter: NewCharacter = {
  projectId: testProject.id!,
  name: "Eileen",
  displayName: "Eileen",
  renpyTag: "a",
  color: "#FF6B6B",
  routeAffiliation: "EILEEN",
  isLoveInterest: true,
  dialogueStyle: "casual",
  conditionalPrefix: null,
};

// Minimal 1x1 PNG for testing
const minimalPng = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44,
  0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d,
  0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
  0x60, 0x82,
]);

describe("Character Avatar Routes (Integration)", () => {
  let db: ReturnType<typeof getDb>;
  let fastify: ReturnType<typeof Fastify>;
  let characterId: string;
  let originalBasePath: string | undefined;

  // Helper to clean up all test data
  async function cleanupTestData() {
    await db
      .delete(characters)
      .where(eq(characters.projectId, testProject.id!));
    await db.delete(projects).where(eq(projects.id, testProject.id!));
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
    await db.insert(projects).values(testProject);
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
        `Test login request failed with status ${loginResponse.statusCode}: ${JSON.stringify(loginResponse.json())}`
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
      secret: "test-session-secret-for-avatar-tests",
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

    // Register multipart plugin with file size limit
    // Set to 5MB to match production configuration
    // Application-level validation will enforce the AVATAR_MAX_SIZE (AVATAR_MAX_SIZE_MB MB) limit for avatars
    await fastify.register(multipart, {
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB (matches production)
        files: 1, // Max 1 file per request
      },
    });

    // Register static file serving
    await fastify.register(fastifyStatic, {
      root: path.join(process.cwd(), "public"),
      prefix: "/public/",
      decorateReply: false,
    });

    // Register the routes
    await fastify.register(charactersRoutes, { prefix: "/api" });
    await fastify.register(characterAvatarRoutes, { prefix: "/api" });

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

    // Create a test character
    const [newChar] = await db
      .insert(characters)
      .values(testCharacter)
      .returning();
    characterId = newChar.id;
  });

  afterEach(async () => {
    if (fastify) {
      await fastify.close();
    }
  });

  describe("POST /characters/:characterId/avatar", () => {
    it("should upload a valid PNG avatar", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const formData = new FormData();
      formData.append(
        "avatar",
        new Blob([minimalPng], { type: "image/png" }),
        "avatar.png"
      );

      const response = await fastify.inject({
        method: "POST",
        url: `/api/characters/${characterId}/avatar`,
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${auth.sessionId}`,
        },
        payload: formData as any,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.avatarUrl).toMatch(
        /^(\/[\w-]+)*\/uploads\/avatars\/[\w-]+\.webp$/
      );

      // Verify avatar was saved to database
      const [updatedChar] = await db
        .select()
        .from(characters)
        .where(eq(characters.id, characterId))
        .limit(1);

      // The database stores just the filename, while the API returns the full URL
      expect(updatedChar.avatarUrl).toBe(path.basename(body.avatarUrl));
    });

    it(`should reject file larger than ${AVATAR_MAX_SIZE_MB}MB`, async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      // Create a buffer larger than AVATAR_MAX_SIZE (but still under the 5MB multipart limit)
      const largeBuffer = Buffer.alloc(AVATAR_MAX_SIZE + 1);

      const formData = new FormData();
      formData.append(
        "avatar",
        new Blob([largeBuffer], { type: "image/png" }),
        "large.png"
      );

      const response = await fastify.inject({
        method: "POST",
        url: `/api/characters/${characterId}/avatar`,
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${auth.sessionId}`,
        },
        payload: formData as any,
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.message).toContain("smaller than");
    });

    it("should reject invalid file type", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const formData = new FormData();
      formData.append(
        "avatar",
        new Blob(["not an image"], { type: "application/pdf" }),
        "file.pdf"
      );

      const response = await fastify.inject({
        method: "POST",
        url: `/api/characters/${characterId}/avatar`,
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${auth.sessionId}`,
        },
        payload: formData as any,
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.message).toContain("Invalid image format");
    });

    it("should return 404 for non-existent character", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const formData = new FormData();
      formData.append(
        "avatar",
        new Blob([minimalPng], { type: "image/png" }),
        "avatar.png"
      );

      const response = await fastify.inject({
        method: "POST",
        url: "/api/characters/00000000-0000-0000-0000-000000000000/avatar",
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${auth.sessionId}`,
        },
        payload: formData as any,
      });

      expect(response.statusCode).toBe(404);
    });

    it("should return 401 for unauthenticated request", async () => {
      const formData = new FormData();
      formData.append(
        "avatar",
        new Blob([minimalPng], { type: "image/png" }),
        "avatar.png"
      );

      const response = await fastify.inject({
        method: "POST",
        url: `/api/characters/${characterId}/avatar`,
        payload: formData as any,
      });

      expect(response.statusCode).toBe(401);
    });

    it("should return 403 when other user attempts to upload avatar", async () => {
      const otherAuth = await createAuthenticatedRequest(otherUserId);

      const formData = new FormData();
      formData.append(
        "avatar",
        new Blob([minimalPng], { type: "image/png" }),
        "avatar.png"
      );

      const response = await fastify.inject({
        method: "POST",
        url: `/api/characters/${characterId}/avatar`,
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${otherAuth.sessionId}`,
        },
        payload: formData as any,
      });

      expect(response.statusCode).toBe(403);
    });

    it("should replace existing avatar and delete old file", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      // Upload initial avatar
      const formData1 = new FormData();
      formData1.append(
        "avatar",
        new Blob([minimalPng], { type: "image/png" }),
        "avatar1.png"
      );

      const firstResponse = await fastify.inject({
        method: "POST",
        url: `/api/characters/${characterId}/avatar`,
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${auth.sessionId}`,
        },
        payload: formData1 as any,
      });

      expect(firstResponse.statusCode).toBe(200);
      const firstBody = firstResponse.json();
      expect(firstBody.avatarUrl).toMatch(
        /^(\/[\w-]+)*\/uploads\/avatars\/[\w-]+\.webp$/
      );

      const firstAvatarUrl = firstBody.avatarUrl;
      const firstAvatarFilename = path.basename(firstAvatarUrl);
      const firstAvatarFullPath = getAvatarFullPath(firstAvatarFilename);

      // Verify the first file exists
      await expect(fs.access(firstAvatarFullPath)).resolves.not.toThrow();

      // Upload replacement avatar
      const formData2 = new FormData();
      formData2.append(
        "avatar",
        new Blob([minimalPng], { type: "image/png" }),
        "avatar2.png"
      );

      const secondResponse = await fastify.inject({
        method: "POST",
        url: `/api/characters/${characterId}/avatar`,
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${auth.sessionId}`,
        },
        payload: formData2 as any,
      });

      expect(secondResponse.statusCode).toBe(200);
      const secondBody = secondResponse.json();
      expect(secondBody.avatarUrl).toMatch(
        /^(\/[\w-]+)*\/uploads\/avatars\/[\w-]+\.webp$/
      );

      const secondAvatarUrl = secondBody.avatarUrl;

      // Assert the second response returns a different avatarUrl
      expect(secondAvatarUrl).not.toBe(firstAvatarUrl);

      // Verify the database row was updated to the new URL
      const [updatedChar] = await db
        .select()
        .from(characters)
        .where(eq(characters.id, characterId))
        .limit(1);

      // The database stores just the filename, while the API returns the full URL
      expect(updatedChar.avatarUrl).toBe(path.basename(secondAvatarUrl));

      // Verify the old file no longer exists
      await expect(fs.access(firstAvatarFullPath)).rejects.toThrow();

      // Verify the new file exists
      const secondAvatarFilename = path.basename(secondAvatarUrl);
      const secondAvatarFullPath = getAvatarFullPath(secondAvatarFilename);
      await expect(fs.access(secondAvatarFullPath)).resolves.not.toThrow();
    });

    it("should fail with 500 when backup creation fails (non-ENOENT error)", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      // Upload initial avatar
      const formData1 = new FormData();
      formData1.append(
        "avatar",
        new Blob([minimalPng], { type: "image/png" }),
        "avatar1.png"
      );

      const firstResponse = await fastify.inject({
        method: "POST",
        url: `/api/characters/${characterId}/avatar`,
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${auth.sessionId}`,
        },
        payload: formData1 as any,
      });

      expect(firstResponse.statusCode).toBe(200);
      const firstBody = firstResponse.json();
      const firstAvatarFullPath = getAvatarFullPath(
        path.basename(firstBody.avatarUrl)
      );

      // Verify the first file exists
      await expect(fs.access(firstAvatarFullPath)).resolves.not.toThrow();

      const copyFileSpy = vi
        .spyOn(fs, "copyFile")
        .mockImplementation(async () => {
          const error = new Error("Permission denied") as NodeJS.ErrnoException;
          error.code = "EACCES";
          throw error;
        });

      try {
        // Try to upload replacement avatar - should fail due to backup error
        const formData2 = new FormData();
        formData2.append(
          "avatar",
          new Blob([minimalPng], { type: "image/png" }),
          "avatar2.png"
        );

        const secondResponse = await fastify.inject({
          method: "POST",
          url: `/api/characters/${characterId}/avatar`,
          headers: {
            Cookie: `${SESSION_COOKIE_NAME}=${auth.sessionId}`,
          },
          payload: formData2 as any,
        });

        // Should return 500 due to backup failure
        expect(secondResponse.statusCode).toBe(500);
        const body = secondResponse.json();
        expect(body.error).toBe("Failed to backup existing avatar file");

        // Verify the original avatar is still in place
        const [character] = await db
          .select()
          .from(characters)
          .where(eq(characters.id, characterId))
          .limit(1);

        // The database stores just the filename, while the API returns the full URL
        expect(character.avatarUrl).toBe(path.basename(firstBody.avatarUrl));

        // Verify the original file still exists
        await expect(fs.access(firstAvatarFullPath)).resolves.not.toThrow();
      } finally {
        copyFileSpy.mockRestore();
      }
    });
  });

  describe("DELETE /characters/:characterId/avatar", () => {
    it("should delete an existing avatar", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      // First upload an avatar
      const formData = new FormData();
      formData.append(
        "avatar",
        new Blob([minimalPng], { type: "image/png" }),
        "avatar.png"
      );

      const uploadResponse = await fastify.inject({
        method: "POST",
        url: `/api/characters/${characterId}/avatar`,
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${auth.sessionId}`,
        },
        payload: formData as any,
      });

      expect(uploadResponse.statusCode).toBe(200);
      const uploadBody = uploadResponse.json();
      expect(uploadBody.avatarUrl).toMatch(
        /^(\/[\w-]+)*\/uploads\/avatars\/[\w-]+\.webp$/
      );

      // Capture the avatar file path before deletion
      const avatarFilename = path.basename(uploadBody.avatarUrl);
      const avatarFullPath = getAvatarFullPath(avatarFilename);

      // Verify the file exists before deletion
      await expect(fs.access(avatarFullPath)).resolves.not.toThrow();

      // Then delete it
      const response = await fastify.inject({
        method: "DELETE",
        url: `/api/characters/${characterId}/avatar`,
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${auth.sessionId}`,
        },
      });

      expect(response.statusCode).toBe(204);

      // Verify avatarUrl is null in database
      const [character] = await db
        .select()
        .from(characters)
        .where(eq(characters.id, characterId))
        .limit(1);

      expect(character.avatarUrl).toBeNull();

      // Verify the avatar file was deleted from filesystem
      await expect(fs.access(avatarFullPath)).rejects.toThrow();
    });

    it("should return 404 for non-existent character", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "DELETE",
        url: "/api/characters/00000000-0000-0000-0000-000000000000/avatar",
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${auth.sessionId}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it("should return 401 for unauthenticated request", async () => {
      const response = await fastify.inject({
        method: "DELETE",
        url: `/api/characters/${characterId}/avatar`,
      });

      expect(response.statusCode).toBe(401);
    });

    it("should return 403 when other user attempts to delete avatar", async () => {
      const otherAuth = await createAuthenticatedRequest(otherUserId);

      const response = await fastify.inject({
        method: "DELETE",
        url: `/api/characters/${characterId}/avatar`,
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${otherAuth.sessionId}`,
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe("Avatar cleanup on character deletion", () => {
    it("should delete avatar file when character is deleted", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      // Create a new character for this test
      const [newChar] = await db
        .insert(characters)
        .values({
          ...testCharacter,
          renpyTag: "cleanup_test",
        })
        .returning();

      // Upload an avatar
      const formData = new FormData();
      formData.append(
        "avatar",
        new Blob([minimalPng], { type: "image/png" }),
        "avatar.png"
      );

      const uploadResponse = await fastify.inject({
        method: "POST",
        url: `/api/characters/${newChar.id}/avatar`,
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${auth.sessionId}`,
        },
        payload: formData as any,
      });

      expect(uploadResponse.statusCode).toBe(200);
      const uploadBody = uploadResponse.json();
      const avatarUrl = uploadBody.avatarUrl;

      // Extract filename from avatarUrl (format: "uploads/avatars/{filename}.webp")
      const avatarFilename = path.basename(avatarUrl);
      const avatarFullPath = getAvatarFullPath(avatarFilename);

      // Verify the file exists before deletion
      await expect(fs.access(avatarFullPath)).resolves.not.toThrow();

      // Delete the character
      const deleteResponse = await fastify.inject({
        method: "DELETE",
        url: `/api/characters/${newChar.id}`,
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${auth.sessionId}`,
        },
      });

      expect(deleteResponse.statusCode).toBe(204);

      // Verify character is deleted from database
      const [deletedChar] = await db
        .select()
        .from(characters)
        .where(eq(characters.id, newChar.id))
        .limit(1);

      expect(deletedChar).toBeUndefined();

      // Verify the avatar file was deleted from filesystem
      await expect(fs.access(avatarFullPath)).rejects.toThrow();
    });
  });
});
