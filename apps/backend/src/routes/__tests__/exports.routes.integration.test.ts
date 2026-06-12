/**
 * Export Routes Integration Tests
 *
 * Route-level integration tests for project export API routes.
 *
 * This test suite exercises the export routes with a real Fastify instance,
 * registered auth/session plugins, and mocked downstream services.
 *
 * Why this is an integration test:
 * - Tests route wiring, middleware chains, validation, and auth flow together
 * - Verifies HTTP responses, error handling, and status codes end-to-end
 * - Uses real Fastify request/response lifecycle (inject() method)
 *
 * What is mocked:
 * - Export service operations (generate, list, download)
 * - Authenticate middleware (simulates authenticated user)
 *
 * This provides confidence that routes are wired correctly while keeping
 * tests fast by avoiding full DB fixture setup.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import { exportsRoutes } from "../exports.routes.js";
import * as exportService from "../../services/export.service.js";
import {
  NotFoundError,
  RateLimitError,
} from "../../middleware/error-handler.middleware.js";

// Mock the services
vi.mock("../../services/export.service.js", () => ({
  generateExport: vi.fn(),
  listExports: vi.fn(),
  getExportForDownload: vi.fn(),
}));

// Mock authz
vi.mock("../../services/authz.service.js", () => ({
  requireProjectAccess: vi.fn(async () => {}),
}));

// Mock the authenticate middleware
vi.mock("../../middleware/auth.middleware.js", () => ({
  authenticate: vi.fn(async (request: any, _reply) => {
    // Simulate authenticated user
    request.session = {
      user: {
        id: "123e4567-e89b-12d3-a456-426614174000",
        email: "test@example.com",
        role: "OWNER" as const,
      },
    };
    request.user = request.session.user;
    request.userId = request.session.user.id;
  }),
}));

// Test fixtures
const testUserId = "123e4567-e89b-12d3-a456-426614174000";
const testProjectId = "123e4567-e89b-12d3-a456-426614174001";
const testExportId = "123e4567-e89b-12d3-a456-426614174002";

const mockExportResult = {
  id: testExportId,
  fileName: "my_project_2026-06-13T00-00-00-000Z.zip",
  fileSize: 1024,
  format: "RENPY",
  createdAt: "2026-06-13T00:00:00.000Z",
};

const mockExportContent = JSON.stringify({
  "game/script.rpy": 'label start:\n    "Hello World"',
  "game/gui.rpy": "# GUI config",
});

const mockExportListResult = [
  {
    id: testExportId,
    projectId: testProjectId,
    format: "RENPY",
    fileName: "my_project_2026-06-13T00-00-00-000Z.zip",
    fileSize: 1024,
    createdAt: "2026-06-13T00:00:00.000Z",
  },
];

describe("Export Routes (Integration)", () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    fastify = Fastify();

    // Register cookie plugin
    await fastify.register(cookie);

    // Register session plugin
    await fastify.register(session, {
      secret: "a".repeat(32),
      cookie: { secure: false },
    });

    // Register export routes
    await fastify.register(exportsRoutes);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
    vi.clearAllMocks();
  });

  // ===========================================================================
  // POST /projects/:projectId/export
  // ===========================================================================

  describe("POST /projects/:projectId/export", () => {
    it("should generate export and return 201 with export metadata", async () => {
      vi.spyOn(exportService, "generateExport").mockResolvedValue(
        mockExportResult as any
      );

      const response = await fastify.inject({
        method: "POST",
        url: `/projects/${testProjectId}/export`,
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual(mockExportResult);
      expect(exportService.generateExport).toHaveBeenCalledWith(
        testProjectId,
        testUserId
      );
    });

    it("should return 404 when project not found", async () => {
      vi.spyOn(exportService, "generateExport").mockRejectedValue(
        new NotFoundError("Project")
      );

      const response = await fastify.inject({
        method: "POST",
        url: `/projects/${testProjectId}/export`,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: "Project not found",
      });
    });

    it("should return 429 when rate limited", async () => {
      vi.spyOn(exportService, "generateExport").mockRejectedValue(
        new RateLimitError(
          30,
          "Too many export requests. Please try again later."
        )
      );

      const response = await fastify.inject({
        method: "POST",
        url: `/projects/${testProjectId}/export`,
      });

      expect(response.statusCode).toBe(429);
      expect(response.json()).toEqual({
        error: "Too many requests, please try again later",
        retryAfter: 30,
      });
    });

    it("should return 500 on unexpected error", async () => {
      vi.spyOn(exportService, "generateExport").mockRejectedValue(
        new Error("Unexpected database failure")
      );

      const response = await fastify.inject({
        method: "POST",
        url: `/projects/${testProjectId}/export`,
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        error: "Internal server error",
      });
    });
  });

  // ===========================================================================
  // GET /projects/:projectId/exports
  // ===========================================================================

  describe("GET /projects/:projectId/exports", () => {
    it("should list exports and return 200", async () => {
      vi.spyOn(exportService, "listExports").mockResolvedValue(
        mockExportListResult as any
      );

      const response = await fastify.inject({
        method: "GET",
        url: `/projects/${testProjectId}/exports`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ exports: mockExportListResult });
      expect(exportService.listExports).toHaveBeenCalledWith(
        testProjectId,
        testUserId
      );
    });

    it("should return empty array when no exports", async () => {
      vi.spyOn(exportService, "listExports").mockResolvedValue([]);

      const response = await fastify.inject({
        method: "GET",
        url: `/projects/${testProjectId}/exports`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ exports: [] });
    });

    it("should return 500 on unexpected error", async () => {
      vi.spyOn(exportService, "listExports").mockRejectedValue(
        new Error("Unexpected database failure")
      );

      const response = await fastify.inject({
        method: "GET",
        url: `/projects/${testProjectId}/exports`,
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        error: "Internal server error",
      });
    });
  });

  // ===========================================================================
  // GET /projects/:projectId/exports/:exportId/download
  // ===========================================================================

  describe("GET /projects/:projectId/exports/:exportId/download", () => {
    it("should return zip file with correct headers", async () => {
      vi.spyOn(exportService, "getExportForDownload").mockResolvedValue({
        fileName: mockExportResult.fileName,
        content: mockExportContent,
      });

      const response = await fastify.inject({
        method: "GET",
        url: `/projects/${testProjectId}/exports/${testExportId}/download`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe("application/zip");
      expect(response.headers["content-disposition"]).toBe(
        `attachment; filename="${mockExportResult.fileName}"`
      );
      expect(Number(response.headers["content-length"])).toBeGreaterThan(0);
      expect(response.rawPayload).toBeInstanceOf(Buffer);
      expect(response.rawPayload.length).toBeGreaterThan(0);
      expect(exportService.getExportForDownload).toHaveBeenCalledWith(
        testExportId,
        testProjectId,
        testUserId
      );
    });

    it("should return 404 when export not found", async () => {
      vi.spyOn(exportService, "getExportForDownload").mockRejectedValue(
        new NotFoundError("Export")
      );

      const response = await fastify.inject({
        method: "GET",
        url: `/projects/${testProjectId}/exports/${testExportId}/download`,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: "Export not found",
      });
    });

    it("should return 500 on unexpected error", async () => {
      vi.spyOn(exportService, "getExportForDownload").mockRejectedValue(
        new Error("Unexpected database failure")
      );

      const response = await fastify.inject({
        method: "GET",
        url: `/projects/${testProjectId}/exports/${testExportId}/download`,
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        error: "Internal server error",
      });
    });
  });
});
