/**
 * User Settings Routes Integration Tests
 *
 * Route-level integration tests verifying that GET/PUT/RESET routes are
 * correctly wired to the service layer with proper auth, validation,
 * and response shapes.
 *
 * What is mocked:
 * - User settings service functions (getUserSettings, updateUserSettings, resetWritingStats)
 * - Auth middleware (simulates authenticated user)
 *
 * What is real:
 * - Fastify request/response lifecycle (inject)
 * - Validation middleware (validateBody with updateWritingGoalSchema)
 * - Global error handler
 * - Route wiring
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import { userSettingsRoutes } from "../user-settings.routes.js";
import * as userSettingsService from "../../services/user-settings.service.js";
import type { PublicUserSettings } from "../../services/user-settings.service.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { globalErrorHandler } from "../../middleware/error-handler.middleware.js";

// ============================================================================
// Test Fixtures
// ============================================================================

const testUserId = "123e4567-e89b-12d3-a456-426614174000";

const testUser = {
  id: testUserId,
  email: "test@example.com",
  role: "OWNER" as const,
};

const defaultSettings: PublicUserSettings = {
  dailyWritingGoal: null,
  dailyWordResetHour: 0,
  dailyWordCounts: [],
  timezone: "UTC",
};

// ============================================================================
// Mocks
// ============================================================================

vi.mock("../../services/user-settings.service.js", () => ({
  getUserSettings: vi.fn(),
  updateUserSettings: vi.fn(),
  resetWritingStats: vi.fn(),
}));

vi.mock("../../middleware/auth.middleware.js", () => ({
  authenticate: vi.fn(async (request: any) => {
    request.session = { user: testUser };
    request.user = testUser;
    request.userId = testUser.id;
  }),
}));

// ============================================================================
// Helper
// ============================================================================

/** Override auth mock to return 401 for a single request */
function mockUnauthenticated() {
  vi.mocked(authenticate).mockImplementationOnce(
    async (_request: any, reply: any) => {
      reply
        .status(401)
        .send({ error: "Unauthorized", message: "Authentication required" });
    }
  );
}

// ============================================================================
// Tests
// ============================================================================

describe("User Settings Routes (Integration)", () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    fastify = Fastify();

    await fastify.register(cookie);
    await fastify.register(session, {
      secret: "a".repeat(32),
      cookie: { secure: false },
    });

    // Register global error handler BEFORE routes so child contexts inherit it
    fastify.setErrorHandler(globalErrorHandler);

    await fastify.register(userSettingsRoutes);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // GET /user/settings
  // --------------------------------------------------------------------------

  describe("GET /user/settings", () => {
    it("should return user settings when authenticated", async () => {
      const mockSettings = {
        dailyWritingGoal: 1000,
        dailyWordResetHour: 5,
        dailyWordCounts: [{ date: "2024-01-15", count: 500 }],
        timezone: "America/New_York",
      };

      vi.mocked(userSettingsService.getUserSettings).mockResolvedValueOnce(
        mockSettings satisfies PublicUserSettings
      );

      const response = await fastify.inject({
        method: "GET",
        url: "/user/settings",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(mockSettings);
      expect(userSettingsService.getUserSettings).toHaveBeenCalledWith(
        testUserId
      );
    });

    it("should return default settings shape", async () => {
      vi.mocked(userSettingsService.getUserSettings).mockResolvedValueOnce(
        defaultSettings
      );

      const response = await fastify.inject({
        method: "GET",
        url: "/user/settings",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty("dailyWritingGoal");
      expect(body).toHaveProperty("dailyWordResetHour");
      expect(body).toHaveProperty("dailyWordCounts");
      expect(body).toHaveProperty("timezone");
    });

    it("should return 401 when not authenticated", async () => {
      mockUnauthenticated();

      const response = await fastify.inject({
        method: "GET",
        url: "/user/settings",
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: "Unauthorized",
        message: "Authentication required",
      });
    });

    it("should handle service errors with 500", async () => {
      vi.mocked(userSettingsService.getUserSettings).mockRejectedValueOnce(
        new Error("Database connection failed")
      );

      const response = await fastify.inject({
        method: "GET",
        url: "/user/settings",
      });

      expect(response.statusCode).toBe(500);
    });
  });

  // --------------------------------------------------------------------------
  // PUT /user/settings
  // --------------------------------------------------------------------------

  describe("PUT /user/settings", () => {
    it("should update settings and return updated values", async () => {
      const updatedSettings = {
        dailyWritingGoal: 2000,
        dailyWordResetHour: 5,
        dailyWordCounts: [],
        timezone: "UTC",
      };

      vi.mocked(userSettingsService.updateUserSettings).mockResolvedValueOnce(
        updatedSettings satisfies PublicUserSettings
      );

      const response = await fastify.inject({
        method: "PUT",
        url: "/user/settings",
        payload: {
          dailyWritingGoal: 2000,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(updatedSettings);
      expect(userSettingsService.updateUserSettings).toHaveBeenCalledWith(
        testUserId,
        expect.objectContaining({ dailyWritingGoal: 2000 })
      );
    });

    it("should pass partial update fields to service", async () => {
      vi.mocked(userSettingsService.updateUserSettings).mockResolvedValueOnce(
        defaultSettings
      );

      await fastify.inject({
        method: "PUT",
        url: "/user/settings",
        payload: { timezone: "Asia/Tokyo" },
      });

      expect(userSettingsService.updateUserSettings).toHaveBeenCalledWith(
        testUserId,
        expect.objectContaining({ timezone: "Asia/Tokyo" })
      );
    });

    it("should reject invalid dailyWordResetHour (out of 0-23 range)", async () => {
      const response = await fastify.inject({
        method: "PUT",
        url: "/user/settings",
        payload: {
          dailyWordResetHour: 25,
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: "ValidationError" });
    });

    it("should reject invalid timezone", async () => {
      const response = await fastify.inject({
        method: "PUT",
        url: "/user/settings",
        payload: {
          timezone: "Invalid/Timezone",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: "ValidationError" });
    });

    it("should reject unknown fields (strict schema)", async () => {
      const response = await fastify.inject({
        method: "PUT",
        url: "/user/settings",
        payload: {
          unknownField: "value",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should reject negative dailyWritingGoal", async () => {
      const response = await fastify.inject({
        method: "PUT",
        url: "/user/settings",
        payload: {
          dailyWritingGoal: -100,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should allow setting dailyWritingGoal to null", async () => {
      vi.mocked(userSettingsService.updateUserSettings).mockResolvedValueOnce(
        defaultSettings
      );

      const response = await fastify.inject({
        method: "PUT",
        url: "/user/settings",
        payload: {
          dailyWritingGoal: null,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(userSettingsService.updateUserSettings).toHaveBeenCalledWith(
        testUserId,
        expect.objectContaining({ dailyWritingGoal: null })
      );
    });

    it("should return 401 when not authenticated", async () => {
      mockUnauthenticated();

      const response = await fastify.inject({
        method: "PUT",
        url: "/user/settings",
        payload: { dailyWritingGoal: 1000 },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // --------------------------------------------------------------------------
  // POST /user/settings/reset-stats
  // --------------------------------------------------------------------------

  describe("POST /user/settings/reset-stats", () => {
    it("should reset writing stats and return success", async () => {
      vi.mocked(userSettingsService.resetWritingStats).mockResolvedValueOnce(
        undefined
      );

      const response = await fastify.inject({
        method: "POST",
        url: "/user/settings/reset-stats",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });
      expect(userSettingsService.resetWritingStats).toHaveBeenCalledWith(
        testUserId
      );
    });

    it("should return 401 when not authenticated", async () => {
      mockUnauthenticated();

      const response = await fastify.inject({
        method: "POST",
        url: "/user/settings/reset-stats",
      });

      expect(response.statusCode).toBe(401);
    });

    it("should handle service errors with 500", async () => {
      vi.mocked(userSettingsService.resetWritingStats).mockRejectedValueOnce(
        new Error("Database error")
      );

      const response = await fastify.inject({
        method: "POST",
        url: "/user/settings/reset-stats",
      });

      expect(response.statusCode).toBe(500);
    });
  });
});
