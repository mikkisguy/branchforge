/**
 * GitLab Routes Tests
 *
 * Integration tests for GitLab integration API routes.
 * Tests are written before implementation (TDD approach).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import nock from "nock";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import { gitlabRoutes } from "../gitlab.routes.js";
import * as gitlabService from "../../services/gitlab.service.js";
import * as gitlabSyncService from "../../services/gitlab-sync.service.js";
import * as rateLimiter from "../../services/rate-limiter.service.js";
import * as db from "../../db/index.js";

// Mock drizzle-orm's eq function
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

// Mock the database
vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

// Mock the database schema - only mock what's used by authorization helpers
vi.mock("../../db/schema/index.js", () => ({
  projects: {
    userId: "userId",
    id: "id",
  },
  gitlabSyncOperations: {
    projectId: "projectId",
    id: "id",
  },
}));

// Mock the services
vi.mock("../../services/gitlab.service.js", () => ({
  validateGitlabPAT: vi.fn(),
  storeGitlabIntegration: vi.fn(),
  deleteGitlabIntegration: vi.fn(),
  listGitlabRepositories: vi.fn(),
  getGitlabProject: vi.fn(),
  linkRepository: vi.fn(),
  unlinkRepository: vi.fn(),
  listBranches: vi.fn(),
  listRpyFiles: vi.fn(),
}));

vi.mock("../../services/gitlab-sync.service.js", () => ({
  exportToGitlab: vi.fn(),
  importFromGitlab: vi.fn(),
  getSyncOperation: vi.fn(),
  listSyncOperations: vi.fn(),
  detectConflicts: vi.fn(),
}));

// Mock the rate limiter service
vi.mock("../../services/rate-limiter.service.js", () => ({
  checkRateLimit: vi.fn(),
}));

// Mock the authenticate middleware
vi.mock("../../middleware/auth.middleware.js", () => ({
  authenticate: vi.fn(async (request: any, _reply) => {
    // Simulate authenticated user
    request.session = {
      user: {
        id: "user-123",
        email: "test@example.com",
        role: "OWNER" as const,
      },
    };
    request.user = request.session.user;
    request.userId = request.session.user.id;
  }),
  requireRole: vi.fn(() =>
    vi.fn(async (request: any, _reply) => {
      request.user = {
        id: "user-123",
        email: "test@example.com",
        role: "OWNER" as const,
      };
      request.userId = request.user.id;
    })
  ),
}));

// Test fixtures
const testUserId = "user-123";
const testProjectId = "project-123";
const testGitlabProjectId = 12345;
const testBranch = "main";
const testOperationId = "operation-123";

describe("GitLab Routes", () => {
  let fastify: Fastify.FastifyInstance;

  beforeEach(async () => {
    fastify = Fastify();

    // Register cookie plugin
    await fastify.register(cookie);

    // Register session plugin
    await fastify.register(session, {
      secret: "a".repeat(32),
      cookie: { secure: false },
    });

    // Set up database mock for authorization helpers
    // We need to track which table is being queried to return the correct shape
    let currentTable: string | null = null;
    const mockSelect = vi.fn(() => ({ from: mockFrom }));
    const mockFrom = vi.fn((table: any) => {
      // Track which table we're querying based on the table object
      if (table && typeof table === "object" && "userId" in table) {
        currentTable = "projects";
      } else if (table && typeof table === "object" && "projectId" in table) {
        currentTable = "gitlabSyncOperations";
      }
      return { where: mockWhere };
    });
    const mockWhere = vi.fn(() => ({ limit: mockLimit }));
    const mockLimit = vi.fn(() => {
      // Return different shapes based on which table is being queried
      if (currentTable === "gitlabSyncOperations") {
        return Promise.resolve([{ projectId: testProjectId }]);
      }
      // Default: projects table, project belongs to user
      return Promise.resolve([{ userId: testUserId }]);
    });
    const mockDb = {
      select: mockSelect,
    };
    vi.mocked(db.getDb).mockReturnValue(mockDb as any);

    // Store mock references for test customization
    (fastify as any).mockDb = {
      mockSelect,
      mockFrom,
      mockWhere,
      mockLimit,
      currentTable: () => currentTable,
    };

    // Register GitLab routes
    await fastify.register(gitlabRoutes, { prefix: "/api" });
    await fastify.ready();

    nock.cleanAll();
    nock.disableNetConnect();
  });

  afterEach(async () => {
    await fastify.close();
    nock.cleanAll();
    nock.enableNetConnect();
    vi.clearAllMocks();
  });

  describe("POST /api/gitlab/validate", () => {
    beforeEach(() => {
      // Reset rate limiter to allow requests by default
      vi.mocked(rateLimiter.checkRateLimit).mockReturnValue({
        allowed: true,
        remainingAttempts: 4,
      });
    });

    it("should validate a GitLab PAT", async () => {
      vi.spyOn(gitlabService, "validateGitlabPAT").mockResolvedValue(
        "testuser"
      );

      const response = await fastify.inject({
        method: "POST",
        url: "/api/gitlab/validate",
        payload: {
          token: "glpat-test123",
          gitlabUrl: "https://gitlab.test",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        valid: true,
        username: "testuser",
      });
    });

    it("should return 400 if token is missing", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/gitlab/validate",
        payload: {
          gitlabUrl: "https://gitlab.test",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should return 400 if token is invalid", async () => {
      vi.spyOn(gitlabService, "validateGitlabPAT").mockResolvedValue(null);

      const response = await fastify.inject({
        method: "POST",
        url: "/api/gitlab/validate",
        payload: {
          token: "invalid-token",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: "Invalid GitLab token",
      });
    });

    it("should return 429 when rate limited", async () => {
      vi.mocked(rateLimiter.checkRateLimit).mockReturnValue({
        allowed: false,
        remainingAttempts: 0,
        retryAfter: 900,
      });

      const response = await fastify.inject({
        method: "POST",
        url: "/api/gitlab/validate",
        payload: {
          token: "glpat-test123",
        },
      });

      expect(response.statusCode).toBe(429);
      expect(response.json()).toMatchObject({
        error: "Too many validation attempts. Please try again later.",
        retryAfter: 900,
      });
    });
  });

  describe("POST /api/gitlab/integration", () => {
    it("should store GitLab integration", async () => {
      vi.spyOn(gitlabService, "validateGitlabPAT").mockResolvedValue(
        "testuser"
      );
      vi.spyOn(gitlabService, "storeGitlabIntegration").mockResolvedValue(
        undefined
      );

      const response = await fastify.inject({
        method: "POST",
        url: "/api/gitlab/integration",
        payload: {
          token: "glpat-test123",
          gitlabUrl: "https://gitlab.test",
        },
      });

      expect(response.statusCode).toBe(201);
    });

    it("should return 400 if token is missing", async () => {
      const validateSpy = vi.spyOn(gitlabService, "validateGitlabPAT");
      const storeSpy = vi.spyOn(gitlabService, "storeGitlabIntegration");

      const response = await fastify.inject({
        method: "POST",
        url: "/api/gitlab/integration",
        payload: {
          gitlabUrl: "https://gitlab.test",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(validateSpy).not.toHaveBeenCalled();
      expect(storeSpy).not.toHaveBeenCalled();
    });

    it("should return 400 if validation fails", async () => {
      vi.spyOn(gitlabService, "validateGitlabPAT").mockResolvedValue(null);

      const response = await fastify.inject({
        method: "POST",
        url: "/api/gitlab/integration",
        payload: {
          token: "invalid-token",
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("DELETE /api/gitlab/integration", () => {
    it("should remove GitLab integration", async () => {
      vi.spyOn(gitlabService, "deleteGitlabIntegration").mockResolvedValue(
        undefined
      );

      const response = await fastify.inject({
        method: "DELETE",
        url: "/api/gitlab/integration",
      });

      expect(response.statusCode).toBe(204);
    });
  });

  describe("GET /api/gitlab/repositories", () => {
    it("should list GitLab repositories available to link", async () => {
      vi.spyOn(gitlabService, "listGitlabRepositories").mockResolvedValue([
        { id: 123, name: "test-repo", path_with_namespace: "user/test-repo" },
        {
          id: 456,
          name: "another-repo",
          path_with_namespace: "user/another-repo",
        },
      ] as any);

      const response = await fastify.inject({
        method: "GET",
        url: "/api/gitlab/repositories",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([
        { id: 123, name: "test-repo", path_with_namespace: "user/test-repo" },
        {
          id: 456,
          name: "another-repo",
          path_with_namespace: "user/another-repo",
        },
      ]);
    });
  });

  describe("POST /api/gitlab/link", () => {
    it("should link project to GitLab repository", async () => {
      vi.spyOn(gitlabService, "getGitlabProject").mockResolvedValue({
        id: testGitlabProjectId,
        name: "test-repo",
        path_with_namespace: "user/test-repo",
      } as any);
      vi.spyOn(gitlabService, "linkRepository").mockResolvedValue(undefined);

      const response = await fastify.inject({
        method: "POST",
        url: "/api/gitlab/link",
        payload: {
          projectId: testProjectId,
          gitlabProjectId: testGitlabProjectId,
          branch: testBranch,
        },
      });

      expect(response.statusCode).toBe(201);
    });

    it("should return 400 if projectId is missing", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/gitlab/link",
        payload: {
          gitlabProjectId: testGitlabProjectId,
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("DELETE /api/gitlab/unlink/:projectId", () => {
    it("should unlink repository from project", async () => {
      vi.spyOn(gitlabService, "unlinkRepository").mockResolvedValue(undefined);

      const response = await fastify.inject({
        method: "DELETE",
        url: `/api/gitlab/unlink/${testProjectId}`,
      });

      expect(response.statusCode).toBe(204);
    });
  });

  describe("GET /api/gitlab/branches/:projectId", () => {
    it("should list branches for a project", async () => {
      vi.spyOn(gitlabService, "listBranches").mockResolvedValue([
        "main",
        "develop",
        "feature/test",
      ]);

      const response = await fastify.inject({
        method: "GET",
        url: `/api/gitlab/branches/${testProjectId}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(["main", "develop", "feature/test"]);
    });
  });

  describe("GET /api/gitlab/files/:projectId", () => {
    it("should list RPY files in repository", async () => {
      vi.spyOn(gitlabService, "listRpyFiles").mockResolvedValue([
        { name: "script.rpy", path: "game/script.rpy" },
        { name: "chapter1.rpy", path: "game/chapter1.rpy" },
      ] as any);

      const response = await fastify.inject({
        method: "GET",
        url: `/api/gitlab/files/${testProjectId}?branch=${testBranch}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([
        { name: "script.rpy", path: "game/script.rpy" },
        { name: "chapter1.rpy", path: "game/chapter1.rpy" },
      ]);
    });

    it("should return 400 if branch is missing", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: `/api/gitlab/files/${testProjectId}`,
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("POST /api/gitlab/export", () => {
    it("should export scenes to GitLab", async () => {
      vi.spyOn(gitlabSyncService, "exportToGitlab").mockResolvedValue({
        id: testOperationId,
        projectId: testProjectId,
        operation: "EXPORT",
        status: "PENDING",
        branch: testBranch,
        conflictCount: 0,
        startedAt: new Date(),
      } as any);

      const response = await fastify.inject({
        method: "POST",
        url: "/api/gitlab/export",
        payload: {
          projectId: testProjectId,
          branch: testBranch,
          commitMessage: "Export from BranchForge",
        },
      });

      expect(response.statusCode).toBe(202);
      expect(response.json()).toMatchObject({
        id: testOperationId,
        operation: "EXPORT",
        status: "PENDING",
      });
    });

    it("should return 400 if projectId is missing", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/gitlab/export",
        payload: {
          branch: testBranch,
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("POST /api/gitlab/import", () => {
    it("should import RPY files from GitLab", async () => {
      vi.spyOn(gitlabSyncService, "importFromGitlab").mockResolvedValue({
        id: testOperationId,
        projectId: testProjectId,
        operation: "IMPORT",
        status: "PENDING",
        branch: testBranch,
        conflictCount: 0,
        startedAt: new Date(),
      } as any);

      const response = await fastify.inject({
        method: "POST",
        url: "/api/gitlab/import",
        payload: {
          projectId: testProjectId,
          branch: testBranch,
          conflictResolution: "branchforge_wins",
        },
      });

      expect(response.statusCode).toBe(202);
      expect(response.json()).toMatchObject({
        id: testOperationId,
        operation: "IMPORT",
        status: "PENDING",
      });
    });

    it("should return 400 if conflictResolution is invalid", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/gitlab/import",
        payload: {
          projectId: testProjectId,
          branch: testBranch,
          conflictResolution: "invalid",
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("GET /api/gitlab/operations/:operationId", () => {
    it("should get sync operation status", async () => {
      vi.spyOn(gitlabSyncService, "getSyncOperation").mockResolvedValue({
        id: testOperationId,
        projectId: testProjectId,
        operation: "EXPORT",
        status: "COMPLETED",
        branch: testBranch,
        conflictCount: 0,
        startedAt: new Date(),
      } as any);

      const response = await fastify.inject({
        method: "GET",
        url: `/api/gitlab/operations/${testOperationId}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: testOperationId,
        operation: "EXPORT",
        status: "COMPLETED",
      });
    });

    it("should return 404 if operation not found (handler-level getSyncOperation)", async () => {
      // Note: DB mock ensures authorizeSyncOperationAccess passes, so this tests
      // the handler-level 404 when getSyncOperation returns null
      vi.spyOn(gitlabSyncService, "getSyncOperation").mockResolvedValue(null);

      const response = await fastify.inject({
        method: "GET",
        url: `/api/gitlab/operations/non-existent`,
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("GET /api/gitlab/operations/:projectId", () => {
    it("should list sync operations for a project", async () => {
      vi.spyOn(gitlabSyncService, "listSyncOperations").mockResolvedValue([
        {
          id: "op-1",
          projectId: testProjectId,
          operation: "EXPORT",
          status: "COMPLETED",
          branch: testBranch,
          conflictCount: 0,
          startedAt: new Date(),
        },
        {
          id: "op-2",
          projectId: testProjectId,
          operation: "IMPORT",
          status: "COMPLETED",
          branch: "develop",
          conflictCount: 0,
          startedAt: new Date(),
        },
      ] as any);

      const response = await fastify.inject({
        method: "GET",
        url: `/api/gitlab/projects/${testProjectId}/operations`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveLength(2);
    });
  });

  describe("POST /api/gitlab/detect-conflicts", () => {
    it("should detect conflicts between local and remote", async () => {
      vi.spyOn(gitlabSyncService, "detectConflicts").mockResolvedValue({
        hasConflicts: true,
        conflicts: [
          {
            label: "start",
            type: "dialogue_mismatch",
            localContent: [{ speaker: null, text: "Local content" }],
            remoteContent: [{ speaker: null, text: "Remote content" }],
          },
        ],
      });

      const response = await fastify.inject({
        method: "POST",
        url: "/api/gitlab/detect-conflicts",
        payload: {
          projectId: testProjectId,
          branch: testBranch,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        hasConflicts: true,
        conflicts: [
          {
            label: "start",
            type: "dialogue_mismatch",
          },
        ],
      });
    });
  });

  describe("Authorization - Project Access", () => {
    it("should return 404 when project not found (link repository)", async () => {
      const mockLimit = (fastify as any).mockDb.mockLimit;

      // Override to return empty array (project not found)
      mockLimit.mockResolvedValueOnce([]);

      const response = await fastify.inject({
        method: "POST",
        url: "/api/gitlab/link",
        payload: {
          projectId: testProjectId,
          gitlabProjectId: testGitlabProjectId,
          branch: testBranch,
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({
        error: "Not Found",
        message: "Project not found",
      });
    });

    it("should return 403 when user does not own project (unlink repository)", async () => {
      const mockLimit = (fastify as any).mockDb.mockLimit;

      // Override to return different userId (user does not own project)
      mockLimit.mockResolvedValueOnce([{ userId: "other-user-id" }]);

      const response = await fastify.inject({
        method: "DELETE",
        url: `/api/gitlab/unlink/${testProjectId}`,
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        error: "Forbidden",
        message: "You do not have access to this project",
      });
    });

    it("should return 404 when project not found (list operations)", async () => {
      const mockLimit = (fastify as any).mockDb.mockLimit;

      // Override to return empty array (project not found)
      mockLimit.mockResolvedValueOnce([]);

      const response = await fastify.inject({
        method: "GET",
        url: `/api/gitlab/projects/${testProjectId}/operations`,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({
        error: "Not Found",
        message: "Project not found",
      });
    });
  });

  describe("Authorization - Sync Operation Access", () => {
    it("should return 404 when sync operation not found", async () => {
      const mockLimit = (fastify as any).mockDb.mockLimit;

      // First call: gitlabSyncOperations query returns empty (operation not found)
      mockLimit.mockResolvedValueOnce([]);

      const response = await fastify.inject({
        method: "GET",
        url: `/api/gitlab/operations/${testOperationId}`,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({
        error: "Not Found",
        message: "Sync operation not found",
      });
    });

    it("should return 404 when operation exists but project not found", async () => {
      const mockLimit = (fastify as any).mockDb.mockLimit;

      // First call: gitlabSyncOperations query - return operation with projectId
      mockLimit.mockResolvedValueOnce([{ projectId: testProjectId }]);
      // Second call: projects query - return empty (project not found)
      mockLimit.mockResolvedValueOnce([]);

      const response = await fastify.inject({
        method: "GET",
        url: `/api/gitlab/operations/${testOperationId}`,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({
        error: "Not Found",
        message: "Project not found",
      });
    });

    it("should return 403 when operation exists but user does not own project", async () => {
      const mockLimit = (fastify as any).mockDb.mockLimit;

      // First call: gitlabSyncOperations query - return operation with projectId
      mockLimit.mockResolvedValueOnce([{ projectId: testProjectId }]);
      // Second call: projects query - return different userId (user does not own project)
      mockLimit.mockResolvedValueOnce([{ userId: "other-user-id" }]);

      const response = await fastify.inject({
        method: "GET",
        url: `/api/gitlab/operations/${testOperationId}`,
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        error: "Forbidden",
        message: "You do not have access to this project",
      });
    });
  });
});
