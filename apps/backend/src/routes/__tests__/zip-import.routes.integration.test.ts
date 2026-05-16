/**
 * ZIP Import Routes Integration Tests
 *
 * Route-level integration tests for ZIP import API routes.
 *
 * This test suite exercises the ZIP import routes with a real Fastify instance,
 * registered auth/session plugins, mocked downstream services, and mocked
 * authorization DB lookups.
 *
 * Why this is an integration test:
 * - Tests route wiring, middleware chains, validation, and auth flow together
 * - Verifies HTTP responses, error handling, and status codes end-to-end
 * - Uses real Fastify request/response lifecycle (inject() method)
 *
 * What is mocked:
 * - Authorization service (requireProjectAccess)
 * - ZIP import service operations (file parsing, label creation)
 * - Project service operations (create, delete)
 *
 * This provides confidence that routes are wired correctly while keeping
 * tests fast by avoiding full DB fixture setup.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import multipart from "@fastify/multipart";
import { zipImportRoutes } from "../zip-import.routes.js";
import * as zipImportService from "../../services/zip-import.service.js";
import * as authzService from "../../services/authz.service.js";
import {
  ForbiddenError,
  NotFoundError,
} from "../../middleware/error-handler.middleware.js";

// Mock the services
vi.mock("../../services/zip-import.service.js", () => ({
  importZipFile: vi.fn(),
  importProjectFromZip: vi.fn(),
}));

vi.mock("../../services/projects.service.js", () => ({
  createProject: vi.fn(),
  deleteProject: vi.fn(),
}));

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

describe("ZIP Import Routes (Integration)", () => {
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

    // Register multipart plugin (required for ZIP import routes)
    await fastify.register(multipart, {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
      },
    });

    // Register ZIP import routes with real multipart plugin
    await fastify.register(zipImportRoutes);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
    vi.clearAllMocks();
  });

  describe("POST /projects/import/zip", () => {
    it("should create project with ZIP source when importing", async () => {
      const mockProject = {
        id: "new-project-id",
        userId: testUserId,
        name: "ZIP Project",
        description: "Imported from ZIP",
        source: "ZIP",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockImportResult = {
        success: true,
        project: mockProject,
        filesImported: 5,
        filesUpdated: 0,
        filesSkipped: 0,
        labelsCreated: 3,
      };

      vi.spyOn(zipImportService, "importProjectFromZip").mockResolvedValue(
        mockImportResult as any
      );

      const mockZipBuffer = Buffer.from("PK\x03\x04...mock zip content");
      const boundary = "----formdata-test-boundary";

      // Build multipart body properly with binary data
      const header1 = `--${boundary}\r\nContent-Disposition: form-data; name="projectName"\r\n\r\nZIP Project\r\n`;
      const header2 = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.zip"\r\nContent-Type: application/zip\r\n\r\n`;
      const footer = `\r\n--${boundary}--\r\n`;
      const multipartBody = Buffer.concat([
        Buffer.from(header1),
        Buffer.from(header2),
        mockZipBuffer,
        Buffer.from(footer),
      ]);

      const response = await fastify.inject({
        method: "POST",
        url: "/projects/import/zip",
        payload: multipartBody,
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
      });

      expect(response.statusCode).toBe(201);
      expect(zipImportService.importProjectFromZip).toHaveBeenCalled();
    });

    it("should handle ZIP parsing errors", async () => {
      vi.spyOn(zipImportService, "importProjectFromZip").mockResolvedValue({
        success: false,
        error: "Invalid ZIP file",
      } as any);

      const mockZipBuffer = Buffer.from("PK\x03\x04...mock zip content");
      const boundary = "----formdata-test-boundary";

      // Build multipart body properly with binary data
      const header1 = `--${boundary}\r\nContent-Disposition: form-data; name="projectName"\r\n\r\nZIP Project\r\n`;
      const header2 = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.zip"\r\nContent-Type: application/zip\r\n\r\n`;
      const footer = `\r\n--${boundary}--\r\n`;
      const multipartBody = Buffer.concat([
        Buffer.from(header1),
        Buffer.from(header2),
        mockZipBuffer,
        Buffer.from(footer),
      ]);

      const response = await fastify.inject({
        method: "POST",
        url: "/projects/import/zip",
        payload: multipartBody,
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
      });

      expect(response.statusCode).toBe(400);
      expect(zipImportService.importProjectFromZip).toHaveBeenCalled();
    });

    it("should import RPY files correctly", async () => {
      const mockImportResult = {
        success: true,
        project: {
          id: "new-project-id",
          userId: testUserId,
          name: "ZIP Project",
          description: "Imported from ZIP",
          source: "ZIP",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        filesImported: 10,
        filesUpdated: 2,
        filesSkipped: 1,
        labelsCreated: 5,
      };

      vi.spyOn(zipImportService, "importProjectFromZip").mockResolvedValue(
        mockImportResult as any
      );

      // Create a mock ZIP file buffer
      const mockZipBuffer = Buffer.from("PK\x03\x04...mock zip content");

      // Construct multipart/form-data boundary
      const boundary = "----formdata-test-boundary";
      const multipartBody = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="projectName"',
        "",
        "ZIP Project",
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="test.zip"',
        "Content-Type: application/zip",
        "",
        mockZipBuffer.toString("binary"),
        `--${boundary}--`,
        "",
      ].join("\r\n");

      const response = await fastify.inject({
        method: "POST",
        url: "/projects/import/zip",
        payload: Buffer.from(multipartBody, "binary"),
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
      });

      expect(response.statusCode).toBe(201);
      // Verify the import service was called
      expect(zipImportService.importProjectFromZip).toHaveBeenCalled();
    });
  });

  describe("POST /projects/:projectId/import/zip", () => {
    it("should import ZIP into existing project", async () => {
      const mockImportResult = {
        success: true,
        filesImported: 3,
        filesUpdated: 1,
        filesSkipped: 0,
        labelsCreated: 2,
      };

      vi.spyOn(zipImportService, "importZipFile").mockResolvedValue(
        mockImportResult as any
      );

      // Create a mock ZIP file buffer
      const mockZipBuffer = Buffer.from("PK\x03\x04...mock zip content");

      // Construct multipart/form-data boundary
      const boundary = "----formdata-test-boundary";
      const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.zip"\r\nContent-Type: application/zip\r\n\r\n`;
      const footer = `\r\n--${boundary}--\r\n`;
      const multipartBody = Buffer.concat([
        Buffer.from(header),
        mockZipBuffer,
        Buffer.from(footer),
      ]);

      const response = await fastify.inject({
        method: "POST",
        url: `/projects/${testProjectId}/import/zip`,
        payload: multipartBody,
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
      });

      expect(response.statusCode).toBe(200);
      // Verify the import service was called with the correct project ID
      expect(zipImportService.importZipFile).toHaveBeenCalledWith(
        testProjectId,
        expect.any(Buffer)
      );
    });

    it("should verify user owns project", async () => {
      vi.spyOn(authzService, "requireProjectAccess").mockRejectedValue(
        new ForbiddenError("You do not have access to this project")
      );

      // Create a mock ZIP file buffer
      const mockZipBuffer = Buffer.from("PK\x03\x04...mock zip content");

      // Construct multipart/form-data boundary
      const boundary = "----formdata-test-boundary";
      const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.zip"\r\nContent-Type: application/zip\r\n\r\n`;
      const footer = `\r\n--${boundary}--\r\n`;
      const multipartBody = Buffer.concat([
        Buffer.from(header),
        mockZipBuffer,
        Buffer.from(footer),
      ]);

      const response = await fastify.inject({
        method: "POST",
        url: `/projects/${testProjectId}/import/zip`,
        payload: multipartBody,
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        error: "Forbidden",
      });
    });

    it("should return 404 when project not found", async () => {
      vi.spyOn(authzService, "requireProjectAccess").mockRejectedValue(
        new NotFoundError("Project")
      );

      // Create a mock ZIP file buffer
      const mockZipBuffer = Buffer.from("PK\x03\x04...mock zip content");

      // Construct multipart/form-data boundary
      const boundary = "----formdata-test-boundary";
      const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.zip"\r\nContent-Type: application/zip\r\n\r\n`;
      const footer = `\r\n--${boundary}--\r\n`;
      const multipartBody = Buffer.concat([
        Buffer.from(header),
        mockZipBuffer,
        Buffer.from(footer),
      ]);

      const response = await fastify.inject({
        method: "POST",
        url: `/projects/${testProjectId}/import/zip`,
        payload: multipartBody,
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({
        error: "Not Found",
      });
    });

    it("should return 500 when service throws a non-HttpError", async () => {
      // Ensure requireProjectAccess resolves (previous tests may have left it rejecting)
      vi.spyOn(authzService, "requireProjectAccess").mockResolvedValue(
        undefined
      );

      // Simulate an unexpected internal error (not HttpError)
      // This exercises the catch block's structured-log + reply.status(500) path
      vi.spyOn(zipImportService, "importZipFile").mockRejectedValueOnce(
        new Error("Unexpected database failure")
      );

      const mockZipBuffer = Buffer.from("PK\x03\x04...mock zip content");
      const boundary = "----formdata-test-boundary";
      const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.zip"\r\nContent-Type: application/zip\r\n\r\n`;
      const footer = `\r\n--${boundary}--\r\n`;
      const multipartBody = Buffer.concat([
        Buffer.from(header),
        mockZipBuffer,
        Buffer.from(footer),
      ]);

      const response = await fastify.inject({
        method: "POST",
        url: `/projects/${testProjectId}/import/zip`,
        payload: multipartBody,
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        error: "Internal server error",
      });
    });
  });
});
