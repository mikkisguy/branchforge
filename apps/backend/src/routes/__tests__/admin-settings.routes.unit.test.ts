import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import { adminSettingsRoutes } from "../admin-settings.routes.js";
import * as adminSettingsService from "../../services/admin-settings.service.js";

// Mock the admin settings service
vi.mock("../../services/admin-settings.service.js", () => ({
  getAdminSetting: vi.fn(),
  setAdminSetting: vi.fn(),
}));

// Mock console.error to avoid noise in tests
const originalConsoleError = console.error;
beforeEach(() => {
  console.error = vi.fn();
});

afterEach(() => {
  console.error = originalConsoleError;
  vi.clearAllMocks();
});

describe("Admin Settings Routes (Unit)", () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    fastify = Fastify();
    await fastify.register(cookie);
    await fastify.register(session, {
      secret: "a".repeat(32),
    });

    // Register admin settings routes
    await fastify.register(adminSettingsRoutes);
    await fastify.ready();
  });

  describe("GET /public/settings/signups", () => {
    it("should return signups enabled status when setting is true", async () => {
      vi.mocked(adminSettingsService.getAdminSetting).mockResolvedValueOnce(
        true
      );

      const response = await fastify.inject({
        method: "GET",
        url: "/public/settings/signups",
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({ enabled: true });
      expect(adminSettingsService.getAdminSetting).toHaveBeenCalledWith(
        "sign_ups_enabled"
      );
    });

    it("should return signups enabled status when setting is false", async () => {
      vi.mocked(adminSettingsService.getAdminSetting).mockResolvedValueOnce(
        false
      );

      const response = await fastify.inject({
        method: "GET",
        url: "/public/settings/signups",
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({ enabled: false });
    });

    it("should return signups enabled status when setting does not exist (null)", async () => {
      vi.mocked(adminSettingsService.getAdminSetting).mockResolvedValueOnce(
        null
      );

      const response = await fastify.inject({
        method: "GET",
        url: "/public/settings/signups",
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({ enabled: true });
    });

    it("should return signups enabled status for truthy values", async () => {
      vi.mocked(adminSettingsService.getAdminSetting).mockResolvedValueOnce(
        "yes"
      );

      const response = await fastify.inject({
        method: "GET",
        url: "/public/settings/signups",
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({ enabled: true });
    });

    it("should be accessible without authentication", async () => {
      vi.mocked(adminSettingsService.getAdminSetting).mockResolvedValueOnce(
        true
      );

      const response = await fastify.inject({
        method: "GET",
        url: "/public/settings/signups",
      });

      expect(response.statusCode).toBe(200);
    });

    it("should handle service errors gracefully", async () => {
      vi.mocked(adminSettingsService.getAdminSetting).mockRejectedValueOnce(
        new Error("Database error")
      );

      const response = await fastify.inject({
        method: "GET",
        url: "/public/settings/signups",
      });

      // Should return 500 on error
      expect(response.statusCode).toBe(500);
    });
  });

  describe("GET /admin/settings", () => {
    it("should return 401 when not authenticated", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/admin/settings",
      });

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.payload)).toEqual({
        error: "Unauthorized",
        message: "Authentication required",
      });
    });

    // Note: Testing authenticated endpoints requires integration-level setup
    // These tests are better suited for integration tests with real auth
  });

  describe("PUT /admin/settings/:key", () => {
    it("should return 401 when not authenticated", async () => {
      const response = await fastify.inject({
        method: "PUT",
        url: "/admin/settings/sign_ups_enabled",
        payload: { value: false },
      });

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.payload)).toEqual({
        error: "Unauthorized",
        message: "Authentication required",
      });
    });

    it("should return 401 when updating any setting without auth", async () => {
      const response = await fastify.inject({
        method: "PUT",
        url: "/admin/settings/some_key",
        payload: { value: "some_value" },
      });

      expect(response.statusCode).toBe(401);
    });

    // Note: Testing authenticated endpoints requires integration-level setup
    // These tests are better suited for integration tests with real auth
  });
});
