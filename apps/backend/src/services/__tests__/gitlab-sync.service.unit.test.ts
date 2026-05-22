/**
 * GitLab Sync Service Unit Tests
 *
 * Unit tests for simple query operations.
 * Complex operations (exportToGitlab, importFromGitlab, detectConflicts) are covered by integration tests.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  computeCommonDirectoryPrefix,
  getSyncOperation,
  listSyncOperations,
} from "../gitlab-sync.service.js";

// Mock the database at module level
vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

// Mock authz service - unit tests focus on query logic, not authorization
vi.mock("../authz.service.js", () => ({
  requireProjectOwnership: vi.fn(),
}));

import { getDb } from "../../db/index.js";

// Test fixtures
const testUserId = "user-123";
const testProjectId = "project-123";
const testOperationId = "operation-123";
const testBranch = "main";

// Helper to create default mock db
const createMockDb = () => ({
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([])),
        })),
        limit: vi.fn(() => Promise.resolve([])),
      })),
    })),
  })),
});

describe("GitLabSyncService", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Set up getDb mock with proper chaining
    vi.mocked(getDb).mockReturnValue(createMockDb() as any);
  });

  describe("getSyncOperation", () => {
    it("should return sync operation by ID", async () => {
      const mockOperation = {
        id: testOperationId,
        projectId: testProjectId,
        operation: "EXPORT" as const,
        status: "COMPLETED" as const,
        branch: testBranch,
        conflictCount: 0,
        startedAt: new Date(),
        completedAt: new Date(),
      };

      const mockDb = vi.mocked(getDb)();

      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([mockOperation])),
          })),
        })),
      })) as any;

      const result = await getSyncOperation(testOperationId, testUserId);

      expect(result).toEqual(mockOperation);
    });

    it("should return null for non-existent operation", async () => {
      const mockDb = vi.mocked(getDb)();

      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([])),
          })),
        })),
      })) as any;

      const result = await getSyncOperation("non-existent-id", testUserId);

      expect(result).toBeNull();
    });
  });

  describe("listSyncOperations", () => {
    it("should list sync operations for a project", async () => {
      const mockOperations = [
        {
          id: "op-1",
          projectId: testProjectId,
          operation: "EXPORT" as const,
          status: "COMPLETED" as const,
          branch: testBranch,
          conflictCount: 0,
          startedAt: new Date(),
        },
        {
          id: "op-2",
          projectId: testProjectId,
          operation: "IMPORT" as const,
          status: "COMPLETED" as const,
          branch: "develop",
          conflictCount: 0,
          startedAt: new Date(),
        },
      ];

      const mockDb = vi.mocked(getDb)();
      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve(mockOperations)),
            })),
          })),
        })),
      })) as any;

      const result = await listSyncOperations(testProjectId, testUserId);
      expect(result).toEqual(mockOperations);
    });

    it("should return empty array when no operations exist", async () => {
      const mockDb = vi.mocked(getDb)();
      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve([])),
            })),
          })),
        })),
      })) as any;

      const result = await listSyncOperations(testProjectId, testUserId);
      expect(result).toEqual([]);
    });

    it("should limit results when specified", async () => {
      const mockOperations = [
        {
          id: "op-1",
          projectId: testProjectId,
          operation: "EXPORT" as const,
          status: "COMPLETED" as const,
          branch: testBranch,
          conflictCount: 0,
          startedAt: new Date(),
        },
      ];

      const mockDb = vi.mocked(getDb)();

      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn((n?: number) => {
                expect(n).toBe(10);
                return Promise.resolve(mockOperations);
              }),
            })),
          })),
        })),
      })) as any;

      const result = await listSyncOperations(testProjectId, testUserId, 10);

      expect(result).toEqual(mockOperations);
    });
  });

  describe("computeCommonDirectoryPrefix", () => {
    it("returns shared top-level directory for files in same parent with different subdirectories", () => {
      const result = computeCommonDirectoryPrefix([
        "game/ch1/script.rpy",
        "game/ch2/scene.rpy",
        "game/ui/menu.rpy",
      ]);
      expect(result).toBe("game/");
    });

    it("returns top-level directory for deeply nested files sharing it", () => {
      const result = computeCommonDirectoryPrefix([
        "game/deep/nested/script.rpy",
        "game/ch2/scene.rpy",
      ]);
      expect(result).toBe("game/");
    });

    it("returns empty string when files have different top-level directories", () => {
      const result = computeCommonDirectoryPrefix([
        "src/app.ts",
        "tests/app.test.ts",
        "docs/readme.md",
      ]);
      expect(result).toBe("");
    });

    it("returns empty string when no files have a directory component", () => {
      const result = computeCommonDirectoryPrefix([
        "README.md",
        "LICENSE",
        "CHANGELOG.md",
      ]);
      expect(result).toBe("");
    });

    it("returns empty string for empty input", () => {
      const result = computeCommonDirectoryPrefix([]);
      expect(result).toBe("");
    });

    it("returns top-level dir even when some files are root-level", () => {
      const result = computeCommonDirectoryPrefix([
        "game/script.rpy",
        "game/data.rpy",
        "README.md",
      ]);
      expect(result).toBe("game/");
    });

    it("returns empty when directed files disagree on top-level dir", () => {
      const result = computeCommonDirectoryPrefix([
        "src/app.ts",
        "tests/app.test.ts",
        "README.md",
      ]);
      expect(result).toBe("");
    });

    it("handles deeply nested single file", () => {
      const result = computeCommonDirectoryPrefix([
        "deeply/nested/path/file.rpy",
      ]);
      expect(result).toBe("deeply/");
    });

    it("only considers first segment, not full common ancestry", () => {
      const result = computeCommonDirectoryPrefix([
        "a/b/c/d/e/file1.rpy",
        "a/b/c/d/f/file2.rpy",
      ]);
      expect(result).toBe("a/");
    });
  });

  /*
   * Complex operations are covered by integration tests:
   *
   * - exportToGitlab: Tests reading from project_files table and pushing to GitLab API
   * - importFromGitlab: Tests creating project_files records and linked scenes
   * - detectConflicts: Tests querying project_files and comparing with remote content
   *
   * These operations involve complex database queries and external service calls,
   * making unit tests with mocks more fragile than valuable. Integration tests
   * with real database and external service mocking provide better confidence.
   */
});
