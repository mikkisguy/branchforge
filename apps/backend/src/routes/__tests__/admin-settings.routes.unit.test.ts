import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import { adminSettingsRoutes } from "../admin-settings.routes.js";
import * as adminSettingsService from "../../services/admin-settings.service.js";

// Shared auth state for controlling mock behavior across tests
const { authState } = vi.hoisted(() => ({
  authState: { authenticated: false, user: null as any },
}));

const testOwnerUser = {
  id: "123e4567-e89b-12d3-a456-426614174000",
  email: "admin@test.com",
  role: "OWNER" as const,
};

const testReaderUser = {
  id: "123e4567-e89b-12d3-a456-426614174001",
  email: "reader@test.com",
  role: "READER" as const,
};

// Mock the admin settings service
vi.mock("../../services/admin-settings.service.js", () => ({
  getAdminSetting: vi.fn(),
  setAdminSetting: vi.fn(),
  getAllAdminSettings: vi.fn(),
}));

// Mock auth middleware with shared state control
vi.mock("../../middleware/auth.middleware.js", () => ({
  authenticate: vi.fn(async (request: any, reply: any) => {
    if (authState.authenticated) {
      request.user = authState.user;
    } else {
      reply
        .status(401)
        .send({ error: "Unauthorized", message: "Authentication required" });
    }
  }),
  requireRole: vi.fn((role: string) => async (request: any, reply: any) => {
    if (!authState.authenticated) {
      reply
        .status(401)
        .send({ error: "Unauthorized", message: "Authentication required" });
      return;
    }
    request.user = authState.user;
    if (authState.user?.role !== role) {
      reply.status(403).send({
        error: "Forbidden",
        message: `Requires ${role} role`,
      });
    }
  }),
}));

// Mock console.error to avoid noise in tests
const originalConsoleError = console.error;
beforeEach(() => {
  console.error = vi.fn();
});

afterEach(() => {
  console.error = originalConsoleError;
  vi.clearAllMocks();
  authState.authenticated = false;
  authState.user = null;
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

    it("should return all settings when authenticated as OWNER", async () => {
      authState.authenticated = true;
      authState.user = testOwnerUser;

      vi.mocked(adminSettingsService.getAllAdminSettings).mockResolvedValueOnce(
        {
          sign_ups_enabled: true,
          max_projects: 10,
        }
      );

      const response = await fastify.inject({
        method: "GET",
        url: "/admin/settings",
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({
        settings: { sign_ups_enabled: true, max_projects: 10 },
      });
      expect(adminSettingsService.getAllAdminSettings).toHaveBeenCalledOnce();
    });

    it("should return 403 when authenticated as non-OWNER", async () => {
      authState.authenticated = true;
      authState.user = testReaderUser;

      const response = await fastify.inject({
        method: "GET",
        url: "/admin/settings",
      });

      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.payload)).toEqual({
        error: "Forbidden",
        message: "Requires OWNER role",
      });
      // Authorization short-circuits — service must not be invoked
      expect(adminSettingsService.getAllAdminSettings).not.toHaveBeenCalled();
    });

    it("should return empty settings object when no settings exist", async () => {
      authState.authenticated = true;
      authState.user = testOwnerUser;

      vi.mocked(adminSettingsService.getAllAdminSettings).mockResolvedValueOnce(
        {}
      );

      const response = await fastify.inject({
        method: "GET",
        url: "/admin/settings",
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({ settings: {} });
    });
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
