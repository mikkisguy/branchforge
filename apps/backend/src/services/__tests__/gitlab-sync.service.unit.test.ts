/**
 * GitLab Sync Service Unit Tests
 *
 * Unit tests for simple query operations.
 * Complex operations (exportToGitlab, importFromGitlab, detectConflicts) are covered by integration tests.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getSyncOperation,
  listSyncOperations,
} from "../gitlab-sync.service.js";

// Mock the database at module level
vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "../../db/index.js";

// Test fixtures
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

      const result = await getSyncOperation(testOperationId);

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

      const result = await getSyncOperation("non-existent-id");

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

      const result = await listSyncOperations(testProjectId);

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

      const result = await listSyncOperations(testProjectId);

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

      const result = await listSyncOperations(testProjectId, 10);

      expect(result).toEqual(mockOperations);
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
