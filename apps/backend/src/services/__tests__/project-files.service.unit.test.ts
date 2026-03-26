/**
 * Project Files Service Tests
 *
 * Unit tests for project file management functionality.
 * Tests are written before implementation (TDD approach).
 *
 * The service handles:
 * - Querying files by project and optional source filter
 * - Getting specific files by path
 * - Updating file content with hash recalculation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getProjectFiles,
  getFileByPath,
  updateFileContent,
} from "../project-files.service.js";
import { getDb } from "../../db/index.js";
import { projectFiles } from "../../db/schema/index.js";
import { eq, and } from "drizzle-orm";

// Mock database
vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

// Mock drizzle-orm SQL operators
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn(),
    and: vi.fn(),
    ne: vi.fn(),
  };
});

describe("ProjectFilesService", () => {
  const mockProjectId = "test-project-id";
  const mockWhereCondition = Symbol("where-condition");

  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue([]),
    limit: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDb).mockReturnValue(mockDb as any);
    // Mock drizzle operators to return a condition object
    vi.mocked(eq).mockReturnValue(mockWhereCondition as any);
    vi.mocked(and).mockReturnValue(mockWhereCondition as any);
    mockDb.select.mockReturnThis();
    mockDb.from.mockReturnThis();
    mockDb.where.mockReturnThis();
    mockDb.orderBy.mockResolvedValue([]);
    mockDb.limit.mockResolvedValue([]);
    mockDb.update.mockReturnThis();
    mockDb.set.mockReturnThis();
    mockDb.returning.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("getProjectFiles", () => {
    it("should get all files for a project", async () => {
      const mockFiles = [
        { id: "1", filePath: "game/script.rpy", source: "ZIP" },
        { id: "2", filePath: "game/gui.rpy", source: "ZIP" },
      ];
      mockDb.orderBy.mockResolvedValueOnce(mockFiles);

      const result = await getProjectFiles(mockProjectId);

      expect(result).toEqual(mockFiles);
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.from).toHaveBeenCalledWith(projectFiles);
      expect(mockDb.where).toHaveBeenCalled();
      expect(mockDb.orderBy).toHaveBeenCalled();
    });

    it("should filter files by source when specified", async () => {
      const mockFiles = [
        { id: "1", filePath: "game/script.rpy", source: "ZIP" },
      ];
      mockDb.orderBy.mockResolvedValueOnce(mockFiles);

      await getProjectFiles(mockProjectId, { source: "ZIP" });

      // Verify where was called with both projectId and source filters
      expect(mockDb.where).toHaveBeenCalledWith(mockWhereCondition);
      // Verify the and() operator was called (combining projectId and source filters)
      expect(and).toHaveBeenCalled();
      // Verify eq was called with projectId
      expect(eq).toHaveBeenCalledWith(projectFiles.projectId, mockProjectId);
      // Verify eq was called with source filter
      expect(eq).toHaveBeenCalledWith(projectFiles.source, "ZIP");
      expect(mockDb.orderBy).toHaveBeenCalled();
    });

    it("should return empty array when no files found", async () => {
      mockDb.orderBy.mockResolvedValueOnce([]);

      const result = await getProjectFiles(mockProjectId);

      expect(result).toEqual([]);
    });
  });

  describe("getFileByPath", () => {
    it("should get a specific file by path", async () => {
      const mockFile = {
        id: "1",
        filePath: "game/script.rpy",
        source: "ZIP",
        content: "label start:",
      };
      mockDb.limit.mockResolvedValueOnce([mockFile]);

      const result = await getFileByPath(
        mockProjectId,
        "game/script.rpy",
        "ZIP"
      );

      expect(result).toEqual(mockFile);
    });

    it("should return null when file not found", async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const result = await getFileByPath(
        mockProjectId,
        "game/missing.rpy",
        "ZIP"
      );

      expect(result).toBeNull();
    });

    it("should query by project, source, and file path", async () => {
      await getFileByPath(mockProjectId, "game/script.rpy", "ZIP");

      expect(mockDb.where).toHaveBeenCalled();
    });
  });

  describe("updateFileContent", () => {
    beforeEach(() => {
      // Setup the update chain: update().set().where().returning()
      mockDb.update.mockReturnThis();
      mockDb.set.mockReturnThis();
      mockDb.where.mockReturnThis();
      // Reset returning to a fresh mock that returns empty array by default
      mockDb.returning = vi.fn().mockResolvedValue([]);
    });

    it("should update file content and recalculate hash", async () => {
      const mockUpdated = {
        id: "1",
        filePath: "game/script.rpy",
        content: "label start:\n    'Updated'",
        contentHash: "new-hash",
      };
      mockDb.returning.mockResolvedValueOnce([mockUpdated]);

      const result = await updateFileContent("1", "new content");

      expect(result).toEqual(mockUpdated);
      expect(mockDb.update).toHaveBeenCalledWith(projectFiles);
      expect(mockDb.set).toHaveBeenCalled();
    });

    it("should return null when file not found", async () => {
      mockDb.returning.mockResolvedValueOnce([]);

      const result = await updateFileContent("non-existent", "content");

      expect(result).toBeNull();
    });

    it("should update updatedAt timestamp", async () => {
      const mockUpdated = {
        id: "1",
        filePath: "game/script.rpy",
        content: "new content",
        contentHash: "hash",
        updatedAt: new Date(),
      };
      mockDb.returning.mockResolvedValueOnce([mockUpdated]);

      await updateFileContent("1", "new content");

      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          updatedAt: expect.any(Date),
        })
      );
    });
  });
});
