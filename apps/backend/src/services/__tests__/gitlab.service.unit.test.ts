/**
 * GitLab Service Unit Tests
 *
 * Unit tests for GitLab API integration service.
 *
 * NOTE: Database operation tests (getGitlabIntegration, storeGitlabIntegration,
 * deleteGitlabIntegration, linkRepository, unlinkRepository) have been migrated
 * to integration tests. These unit tests now focus on HTTP operations (using Nock)
 * and validation logic.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import nock from "nock";
import {
  validateGitlabPAT,
  listGitlabRepositories,
  listBranches,
  listRpyFiles,
  getFileContent,
  createOrUpdateFile,
} from "../gitlab.service.js";
import * as encryptionService from "../encryption.service.js";

// Test token must be defined before vi.mock since vi.mock is hoisted
// Use the same value as encryption.service.unit.test.ts for consistency
const testToken = "glpat-123456789abcdefghijklmn";

// Mock encryption service
vi.mock("../encryption.service.js", () => ({
  validateAndGetUsername: vi.fn(),
  validateGitLabUrl: vi.fn((url?: string) => url || testGitlabUrl),
  encryptPAT: vi.fn((token: string) => `encrypted_${token}`),
  decryptPAT: vi.fn((encrypted: string) => {
    // Return the original token for tests that store encrypted tokens
    // For integration mock that returns encrypted_token, return testToken
    if (encrypted === "encrypted_token") return testToken;
    return encrypted.replace("encrypted_", "");
  }),
  isValidPATFormat: vi.fn((token: string) => token.startsWith("glpat-")),
}));

// Mock the database for HTTP operations that need integration lookup
const mockLimit = vi.fn();
const mockWhere = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();

const mockDb = {
  select: mockSelect,
};

// Setup mock chains
mockSelect.mockReturnValue({ from: mockFrom });
mockFrom.mockReturnValue({ where: mockWhere });
mockWhere.mockReturnValue({ limit: mockLimit });
mockLimit.mockResolvedValue([]);

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(() => mockDb),
}));

// Test fixtures
const testUserId = "user-123";
const testProjectId = "project-123";
const testGitlabUrl = "https://gitlab.test";
const testGitlabProjectId = 12345;
const testRepositoryName = "test-repo";
const testBranch = "main";

describe("GitLabService (HTTP Operations)", () => {
  beforeEach(() => {
    // Set environment variables
    process.env.ENCRYPTION_KEY = "test-encryption-key-32-chars-long!";

    vi.clearAllMocks();
    nock.cleanAll();
    nock.disableNetConnect();

    // Reset and re-setup mock chain for each test
    mockLimit.mockReset();
    mockWhere.mockReset();
    mockFrom.mockReset();
    mockSelect.mockReset();

    // Re-setup mock chains
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockLimit.mockResolvedValue([]);
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  describe("validateGitlabPAT", () => {
    it("should return username for valid PAT", async () => {
      vi.mocked(encryptionService.validateAndGetUsername).mockResolvedValue(
        "testuser"
      );

      const result = await validateGitlabPAT(testToken);

      expect(result).toBe("testuser");
      expect(encryptionService.validateAndGetUsername).toHaveBeenCalledWith(
        testToken,
        "https://gitlab.com"
      );
    });

    it("should work with custom GitLab URL", async () => {
      vi.mocked(encryptionService.validateAndGetUsername).mockResolvedValue(
        "customuser"
      );

      const result = await validateGitlabPAT(testToken, testGitlabUrl);

      expect(result).toBe("customuser");
      expect(encryptionService.validateAndGetUsername).toHaveBeenCalledWith(
        testToken,
        testGitlabUrl
      );
    });

    it("should return null for invalid PAT", async () => {
      vi.mocked(encryptionService.validateAndGetUsername).mockResolvedValue(
        null
      );

      const result = await validateGitlabPAT("invalid-token");

      expect(result).toBeNull();
    });

    it("should return null for empty token", async () => {
      vi.mocked(encryptionService.isValidPATFormat).mockReturnValue(false);

      const result = await validateGitlabPAT("");

      expect(result).toBeNull();
    });

    it("should return null on network error", async () => {
      vi.mocked(encryptionService.validateAndGetUsername).mockResolvedValue(
        null
      );

      const result = await validateGitlabPAT(testToken);

      expect(result).toBeNull();
    });

    it("should return null for invalid PAT format", async () => {
      vi.mocked(encryptionService.isValidPATFormat).mockReturnValue(false);

      const result = await validateGitlabPAT("not-a-gitlab-pat");

      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // Database operations migrated to integration tests
  // - getGitlabIntegration
  // - storeGitlabIntegration
  // - deleteGitlabIntegration
  // - linkRepository
  // - unlinkRepository
  // ============================================================================

  describe("listGitlabRepositories", () => {
    it("should list user repositories", async () => {
      // Mock integration lookup
      mockLimit.mockResolvedValueOnce([
        {
          id: "integration-123",
          userId: testUserId,
          encryptedToken: "encrypted_token",
          gitlabUrl: testGitlabUrl,
          username: "testuser",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const mockProjects = [
        {
          id: testGitlabProjectId,
          name: testRepositoryName,
          path_with_namespace: "user/test-repo",
          default_branch: testBranch,
        },
      ];

      const expectedProjects = [
        {
          id: testGitlabProjectId,
          name: testRepositoryName,
          path_with_namespace: "user/test-repo",
        },
      ];

      nock(testGitlabUrl)
        .get("/api/v4/projects")
        .matchHeader("private-token", testToken)
        .query({ membership: "true", per_page: "100", page: "1" })
        .reply(200, mockProjects, { "x-total-pages": "1" });

      const result = await listGitlabRepositories(testUserId, testGitlabUrl);

      expect(result).toEqual(expectedProjects);
    });

    it("should handle pagination", async () => {
      // Mock integration lookup
      mockLimit.mockResolvedValueOnce([
        {
          id: "integration-123",
          userId: testUserId,
          encryptedToken: "encrypted_token",
          gitlabUrl: testGitlabUrl,
          username: "testuser",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const page1Projects = [
        {
          id: 1,
          name: "project1",
          path_with_namespace: "user/project1",
          default_branch: "main",
        },
      ];
      const page2Projects = [
        {
          id: 2,
          name: "project2",
          path_with_namespace: "user/project2",
          default_branch: "main",
        },
      ];

      const expectedProjects = [
        { id: 1, name: "project1", path_with_namespace: "user/project1" },
        { id: 2, name: "project2", path_with_namespace: "user/project2" },
      ];

      // Create separate interceptors for each page
      nock(testGitlabUrl)
        .get("/api/v4/projects")
        .matchHeader("private-token", testToken)
        .query({ membership: "true", per_page: "100", page: "1" })
        .reply(200, page1Projects, {
          "x-total-pages": "2",
          "x-next-page": "2",
        });

      nock(testGitlabUrl)
        .get("/api/v4/projects")
        .matchHeader("private-token", testToken)
        .query({ membership: "true", per_page: "100", page: "2" })
        .reply(200, page2Projects, { "x-total-pages": "2" });

      const result = await listGitlabRepositories(testUserId, testGitlabUrl);

      expect(result).toEqual(expectedProjects);
    });

    it("should throw when integration not found", async () => {
      // Reset to return empty array (integration not found)
      mockLimit.mockResolvedValueOnce([]);

      await expect(
        listGitlabRepositories(testUserId, testGitlabUrl)
      ).rejects.toThrow("GitLab integration not found");
    });
  });

  describe("listBranches", () => {
    it("should list repository branches", async () => {
      // Mock project ownership check (now runs before getRepositoryLink)
      mockLimit.mockResolvedValueOnce([{ userId: testUserId }]);

      // Mock repository link
      mockLimit.mockResolvedValueOnce([
        {
          id: "repo-123",
          projectId: testProjectId,
          gitlabProjectId: testGitlabProjectId,
          repositoryName: testRepositoryName,
          gitlabUrl: testGitlabUrl,
          defaultBranch: testBranch,
          createdAt: new Date(),
        },
      ]);

      // Mock integration lookup
      mockLimit.mockResolvedValueOnce([
        {
          id: "integration-123",
          userId: testUserId,
          encryptedToken: "encrypted_token",
          gitlabUrl: testGitlabUrl,
          username: "testuser",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const mockBranches = [
        { name: "main", commit: { id: "abc123" } },
        { name: "develop", commit: { id: "def456" } },
      ];

      nock(testGitlabUrl)
        .get(`/api/v4/projects/${testGitlabProjectId}/repository/branches`)
        .matchHeader("private-token", testToken)
        .reply(200, mockBranches);

      const result = await listBranches(
        testProjectId,
        testUserId,
        testGitlabUrl
      );

      expect(result).toEqual(["main", "develop"]);
    });

    it("should throw when repository not linked", async () => {
      // Project ownership passes
      mockLimit.mockResolvedValueOnce([{ userId: testUserId }]);
      // Repository link returns empty
      mockLimit.mockResolvedValueOnce([]);

      await expect(
        listBranches(testProjectId, testUserId, testGitlabUrl)
      ).rejects.toThrow("GitLab repository not linked");
    });
  });

  describe("listRpyFiles", () => {
    it("should list .rpy files in repository", async () => {
      // Mock project ownership check (now runs before getRepositoryLink)
      mockLimit.mockResolvedValueOnce([{ userId: testUserId }]);

      // Mock repository link
      mockLimit.mockResolvedValueOnce([
        {
          id: "repo-123",
          projectId: testProjectId,
          gitlabProjectId: testGitlabProjectId,
          repositoryName: testRepositoryName,
          gitlabUrl: testGitlabUrl,
          defaultBranch: testBranch,
          createdAt: new Date(),
        },
      ]);

      // Mock integration lookup
      mockLimit.mockResolvedValueOnce([
        {
          id: "integration-123",
          userId: testUserId,
          encryptedToken: "encrypted_token",
          gitlabUrl: testGitlabUrl,
          username: "testuser",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const mockTree = [
        { name: "script.rpy", path: "game/script.rpy", type: "blob" },
        { name: "chapter1.rpy", path: "game/chapter1.rpy", type: "blob" },
        { name: "README.md", path: "README.md", type: "blob" },
        { name: "game", path: "game", type: "tree" },
      ];

      nock(testGitlabUrl)
        .get(`/api/v4/projects/${testGitlabProjectId}/repository/tree`)
        .matchHeader("private-token", testToken)
        .query((actualQuery) => {
          return (
            actualQuery.ref === testBranch &&
            actualQuery.recursive === "true" &&
            actualQuery.per_page === "100"
          );
        })
        .reply(200, mockTree, { "x-total-pages": "1" });

      const result = await listRpyFiles(
        testProjectId,
        testBranch,
        testUserId,
        testGitlabUrl
      );

      expect(result).toEqual([
        { name: "script.rpy", path: "game/script.rpy" },
        { name: "chapter1.rpy", path: "game/chapter1.rpy" },
      ]);
    });

    it("should handle pagination for file listings", async () => {
      // Mock project ownership check (now runs before getRepositoryLink)
      mockLimit.mockResolvedValueOnce([{ userId: testUserId }]);

      // Mock repository link
      mockLimit.mockResolvedValueOnce([
        {
          id: "repo-123",
          projectId: testProjectId,
          gitlabProjectId: testGitlabProjectId,
          repositoryName: testRepositoryName,
          gitlabUrl: testGitlabUrl,
          defaultBranch: testBranch,
          createdAt: new Date(),
        },
      ]);

      // Mock integration lookup (will be called twice for pagination)
      mockLimit
        .mockResolvedValueOnce([
          {
            id: "integration-123",
            userId: testUserId,
            encryptedToken: "encrypted_token",
            gitlabUrl: testGitlabUrl,
            username: "testuser",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ])
        .mockResolvedValueOnce([
          {
            id: "integration-123",
            userId: testUserId,
            encryptedToken: "encrypted_token",
            gitlabUrl: testGitlabUrl,
            username: "testuser",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]);

      const page1Files = [
        { name: "script.rpy", path: "game/script.rpy", type: "blob" },
      ];
      const page2Files = [
        { name: "chapter1.rpy", path: "game/chapter1.rpy", type: "blob" },
      ];

      // Create separate interceptors for each page
      nock(testGitlabUrl)
        .get(`/api/v4/projects/${testGitlabProjectId}/repository/tree`)
        .matchHeader("private-token", testToken)
        .query((actualQuery) => {
          return (
            actualQuery.ref === testBranch &&
            actualQuery.recursive === "true" &&
            actualQuery.per_page === "100" &&
            actualQuery.page === "1"
          );
        })
        .reply(200, page1Files, { "x-total-pages": "2", "x-next-page": "2" });

      nock(testGitlabUrl)
        .get(`/api/v4/projects/${testGitlabProjectId}/repository/tree`)
        .matchHeader("private-token", testToken)
        .query((actualQuery) => {
          return (
            actualQuery.ref === testBranch &&
            actualQuery.recursive === "true" &&
            actualQuery.per_page === "100" &&
            actualQuery.page === "2"
          );
        })
        .reply(200, page2Files, { "x-total-pages": "2" });

      const result = await listRpyFiles(
        testProjectId,
        testBranch,
        testUserId,
        testGitlabUrl
      );

      expect(result).toEqual([
        { name: "script.rpy", path: "game/script.rpy" },
        { name: "chapter1.rpy", path: "game/chapter1.rpy" },
      ]);
    });
  });

  describe("getFileContent", () => {
    it("should get file content from repository", async () => {
      // Mock repository link
      mockLimit.mockResolvedValueOnce([
        {
          id: "repo-123",
          projectId: testProjectId,
          gitlabProjectId: testGitlabProjectId,
          repositoryName: testRepositoryName,
          gitlabUrl: testGitlabUrl,
          defaultBranch: testBranch,
          createdAt: new Date(),
        },
      ]);

      // Mock project lookup
      mockLimit.mockResolvedValueOnce([{ userId: testUserId }]);

      // Mock integration lookup
      mockLimit.mockResolvedValueOnce([
        {
          id: "integration-123",
          userId: testUserId,
          encryptedToken: "encrypted_token",
          gitlabUrl: testGitlabUrl,
          username: "testuser",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const content = 'label start:\n    "Hello, world!"';
      const base64Content = Buffer.from(content).toString("base64");

      nock(testGitlabUrl)
        .get(
          `/api/v4/projects/${testGitlabProjectId}/repository/files/game%2Fscript.rpy`
        )
        .matchHeader("private-token", testToken)
        .query({ ref: testBranch })
        .reply(200, {
          file_name: "script.rpy",
          file_path: "game/script.rpy",
          content: base64Content,
          encoding: "base64",
        });

      const result = await getFileContent(
        testProjectId,
        "game/script.rpy",
        testBranch,
        testGitlabUrl
      );

      expect(result).toBe(content);
    });

    it("should return null for non-existent file", async () => {
      // Mock repository link
      mockLimit.mockResolvedValueOnce([
        {
          id: "repo-123",
          projectId: testProjectId,
          gitlabProjectId: testGitlabProjectId,
          repositoryName: testRepositoryName,
          gitlabUrl: testGitlabUrl,
          defaultBranch: testBranch,
          createdAt: new Date(),
        },
      ]);

      // Mock project lookup
      mockLimit.mockResolvedValueOnce([{ userId: testUserId }]);

      // Mock integration lookup
      mockLimit.mockResolvedValueOnce([
        {
          id: "integration-123",
          userId: testUserId,
          encryptedToken: "encrypted_token",
          gitlabUrl: testGitlabUrl,
          username: "testuser",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      nock(testGitlabUrl)
        .get(
          `/api/v4/projects/${testGitlabProjectId}/repository/files/game%2Fmissing.rpy`
        )
        .matchHeader("private-token", testToken)
        .query({ ref: testBranch })
        .reply(404);

      const result = await getFileContent(
        testProjectId,
        "game/missing.rpy",
        testBranch,
        testGitlabUrl
      );

      expect(result).toBeNull();
    });
  });

  describe("createOrUpdateFile", () => {
    it("should create new file in repository", async () => {
      // Mock repository link
      mockLimit.mockResolvedValueOnce([
        {
          id: "repo-123",
          projectId: testProjectId,
          gitlabProjectId: testGitlabProjectId,
          repositoryName: testRepositoryName,
          gitlabUrl: testGitlabUrl,
          defaultBranch: testBranch,
          createdAt: new Date(),
        },
      ]);

      // Mock project lookup
      mockLimit.mockResolvedValueOnce([{ userId: testUserId }]);

      // Mock integration lookup
      mockLimit.mockResolvedValueOnce([
        {
          id: "integration-123",
          userId: testUserId,
          encryptedToken: "encrypted_token",
          gitlabUrl: testGitlabUrl,
          username: "testuser",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const content = 'label start:\n    "New file!"';
      const commitMessage = "Add new file";

      nock(testGitlabUrl)
        .put(
          `/api/v4/projects/${testGitlabProjectId}/repository/files/game%2Fnew.rpy`
        )
        .matchHeader("private-token", testToken)
        .reply(200, {
          file_path: "game/new.rpy",
          branch: testBranch,
        });

      const result = await createOrUpdateFile(
        testProjectId,
        testBranch,
        "game/new.rpy",
        content,
        commitMessage,
        testGitlabUrl
      );

      expect(result).toEqual({
        file_path: "game/new.rpy",
        branch: testBranch,
      });
    });

    it("should update existing file in repository", async () => {
      // Mock repository link
      mockLimit.mockResolvedValueOnce([
        {
          id: "repo-123",
          projectId: testProjectId,
          gitlabProjectId: testGitlabProjectId,
          repositoryName: testRepositoryName,
          gitlabUrl: testGitlabUrl,
          defaultBranch: testBranch,
          createdAt: new Date(),
        },
      ]);

      // Mock project lookup
      mockLimit.mockResolvedValueOnce([{ userId: testUserId }]);

      // Mock integration lookup
      mockLimit.mockResolvedValueOnce([
        {
          id: "integration-123",
          userId: testUserId,
          encryptedToken: "encrypted_token",
          gitlabUrl: testGitlabUrl,
          username: "testuser",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const content = 'label start:\n    "Updated file!"';
      const commitMessage = "Update file";

      nock(testGitlabUrl)
        .put(
          `/api/v4/projects/${testGitlabProjectId}/repository/files/game%2Fscript.rpy`
        )
        .matchHeader("private-token", testToken)
        .reply(200, {
          file_path: "game/script.rpy",
          branch: testBranch,
        });

      const result = await createOrUpdateFile(
        testProjectId,
        testBranch,
        "game/script.rpy",
        content,
        commitMessage,
        testGitlabUrl
      );

      expect(result).toEqual({
        file_path: "game/script.rpy",
        branch: testBranch,
      });
    });

    it("should throw on API error", async () => {
      // Mock repository link
      mockLimit.mockResolvedValueOnce([
        {
          id: "repo-123",
          projectId: testProjectId,
          gitlabProjectId: testGitlabProjectId,
          repositoryName: testRepositoryName,
          gitlabUrl: testGitlabUrl,
          defaultBranch: testBranch,
          createdAt: new Date(),
        },
      ]);

      // Mock project lookup
      mockLimit.mockResolvedValueOnce([{ userId: testUserId }]);

      // Mock integration lookup
      mockLimit.mockResolvedValueOnce([
        {
          id: "integration-123",
          userId: testUserId,
          encryptedToken: "encrypted_token",
          gitlabUrl: testGitlabUrl,
          username: "testuser",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      nock(testGitlabUrl)
        .put(
          `/api/v4/projects/${testGitlabProjectId}/repository/files/game%2Fscript.rpy`
        )
        .matchHeader("private-token", testToken)
        .reply(500);

      await expect(
        createOrUpdateFile(
          testProjectId,
          testBranch,
          "game/script.rpy",
          "content",
          "message",
          testGitlabUrl
        )
      ).rejects.toThrow();
    });
  });
});
