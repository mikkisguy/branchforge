/**
 * Zip Import Service Tests
 *
 * Unit tests for Ren'Py project zip import functionality.
 * Tests are written before implementation (TDD approach).
 *
 * The service handles:
 * - Extracting .rpy files from zip archives
 * - Skipping .rpyc files and game/saves directories
 * - Calculating content hashes for idempotency
 * - Importing files into the database
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import JSZip from "jszip";
import {
  extractRpyFiles,
  calculateContentHash as hashContent,
  importZipFile,
} from "../zip-import.service.js";
import { getDb } from "../../db/index.js";

// Mock JSZip
vi.mock("jszip");

// Mock database
vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

// Mock rpy-parser.service
vi.mock("../rpy-parser.service.js", () => ({
  parseRPYFileWithLabels: vi.fn((content: string, filename: string) => ({
    labels: content.includes("label")
      ? [
          {
            label: "start",
            lineNumber: 1,
            dialogue: [],
            choices: [],
            jumps: [],
          },
        ]
      : [],
    characters: [],
    fileType: filename?.includes("screen") ? "SETTINGS" : "STORY",
  })),
}));

// Mock label-sync.service
import { syncLabelsFromFile } from "../label-sync.service.js";

vi.mock("../label-sync.service.js", () => ({
  syncLabelsFromFile: vi.fn().mockResolvedValue({
    success: true,
    labelsCreated: 1,
    labelsUpdated: 0,
    labelsDeleted: 0,
    linesProcessed: 0,
    errors: [],
    skipped: false,
    affectedLabelIds: [],
  }),
}));

describe("ZipImportService", () => {
  const mockProjectId = "test-project-id";

  // Helper to create a mock JSZip file object
  function createMockFile(name: string, content: string, isDir = false) {
    return {
      name,
      dir: isDir,
      async: vi.fn().mockResolvedValue(content),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("extractRpyFiles", () => {
    it("should extract .rpy files from zip", async () => {
      const mockZip = {
        files: {
          "game/script.rpy": createMockFile("game/script.rpy", "content 1"),
          "game/gui.rpy": createMockFile("game/gui.rpy", "content 2"),
        },
      } as unknown as JSZip;

      const result = await extractRpyFiles(mockZip);

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("filePath", "game/script.rpy");
      expect(result[0]).toHaveProperty("content", "content 1");
      expect(result[1]).toHaveProperty("filePath", "game/gui.rpy");
    });

    it("should skip .rpyc files", async () => {
      const mockZip = {
        files: {
          "game/script.rpy": createMockFile("game/script.rpy", "content 1"),
          "game/script.rpyc": createMockFile("game/script.rpyc", "compiled"),
          "game/gui.rpy": createMockFile("game/gui.rpy", "content 2"),
        },
      } as unknown as JSZip;

      const result = await extractRpyFiles(mockZip);

      expect(result).toHaveLength(2);
      expect(result.every((f) => !f.filePath.endsWith(".rpyc"))).toBe(true);
    });

    it("should skip save files in game/ and saves/ directories", async () => {
      const mockZip = {
        files: {
          "game/save-1.save": createMockFile("game/save-1.save", "save data"),
          "game/persistent.save": createMockFile(
            "game/persistent.save",
            "persistent"
          ),
          "saves/auto-save-1.save": createMockFile(
            "saves/auto-save-1.save",
            "auto"
          ),
          "game/script.rpy": createMockFile("game/script.rpy", "label start:"),
        },
      } as unknown as JSZip;

      const result = await extractRpyFiles(mockZip);

      expect(result).toHaveLength(1);
      expect(result[0].filePath).toBe("game/script.rpy");
    });

    it("should skip directories", async () => {
      const mockZip = {
        files: {
          "game/": createMockFile("game/", "", true),
          "game/script.rpy": createMockFile("game/script.rpy", "content"),
        },
      } as unknown as JSZip;

      const result = await extractRpyFiles(mockZip);

      expect(result).toHaveLength(1);
      expect(result[0].filePath).toBe("game/script.rpy");
    });

    it("should handle empty zip", async () => {
      const mockZip = {
        files: {},
      } as unknown as JSZip;

      const result = await extractRpyFiles(mockZip);

      expect(result).toEqual([]);
    });

    it("should handle zip with no .rpy files", async () => {
      const mockZip = {
        files: {
          "README.txt": createMockFile("README.txt", "readme"),
          "game/image.png": createMockFile("game/image.png", "image"),
        },
      } as unknown as JSZip;

      const result = await extractRpyFiles(mockZip);

      expect(result).toEqual([]);
    });

    it("should handle nested directory structures", async () => {
      const mockZip = {
        files: {
          "game/labels/act1/scene1.rpy": createMockFile(
            "game/labels/act1/scene1.rpy",
            "content 1"
          ),
          "game/labels/act1/scene2.rpy": createMockFile(
            "game/labels/act1/scene2.rpy",
            "content 2"
          ),
          "game/labels/act2/scene1.rpy": createMockFile(
            "game/labels/act2/scene1.rpy",
            "content 3"
          ),
        },
      } as unknown as JSZip;

      const result = await extractRpyFiles(mockZip);

      expect(result).toHaveLength(3);
      expect(result[0].filePath).toBe("game/labels/act1/scene1.rpy");
    });

    it("should read file content from zip", async () => {
      const mockContent = 'label start:\n    "Hello, world!"';
      const mockZip = {
        files: {
          "game/script.rpy": createMockFile("game/script.rpy", mockContent),
        },
      } as unknown as JSZip;

      const result = await extractRpyFiles(mockZip);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe(mockContent);
    });
  });

  describe("calculateContentHash", () => {
    it("should calculate SHA-256 hash of content", () => {
      const content = "Hello, world!";
      const hash = hashContent(content);

      expect(hash).toBeTypeOf("string");
      expect(hash).toHaveLength(64); // SHA-256 produces 64 hex characters
    });

    it("should produce consistent hash for same content", () => {
      const content = 'label start:\n    "Hello"';
      const hash1 = hashContent(content);
      const hash2 = hashContent(content);

      expect(hash1).toBe(hash2);
    });

    it("should produce different hash for different content", () => {
      const hash1 = hashContent('label start:\n    "Hello"');
      const hash2 = hashContent('label start:\n    "Goodbye"');

      expect(hash1).not.toBe(hash2);
    });

    it("should handle empty content", () => {
      const hash = hashContent("");
      expect(hash).toBeTypeOf("string");
      expect(hash).toHaveLength(64);
    });

    it("should handle unicode characters", () => {
      const content = 'label start:\n    s "Hello 世界! 🌍"';
      const hash = hashContent(content);

      expect(hash).toBeTypeOf("string");
      expect(hash).toHaveLength(64);
    });

    it("should be idempotent", () => {
      const content = 'label start:\n    "Test content"';
      const hashes = Array.from({ length: 10 }, () => hashContent(content));

      expect(new Set(hashes).size).toBe(1);
    });
  });

  describe("importZipFile", () => {
    const mockTx = {
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onConflictDoUpdate: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: "test-file-id" }]),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn(),
      commit: vi.fn(),
    };

    const mockDb = {
      transaction: vi.fn().mockImplementation(async (callback) => {
        return callback(mockTx as any);
      }),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onConflictDoUpdate: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: "test-file-id" }]),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockReturnThis(),
    };

    beforeEach(() => {
      vi.mocked(getDb).mockReturnValue(mockDb as any);
      // Reset all mocks before each test
      mockDb.transaction.mockImplementation(async (callback) => {
        return callback(mockTx as any);
      });
      mockTx.insert.mockReturnThis();
      mockTx.values.mockReturnThis();
      mockTx.onConflictDoUpdate?.mockReturnThis?.();
      mockTx.set.mockReturnThis();
      mockTx.select.mockReturnThis();
      mockTx.from.mockReturnThis();
      mockTx.where.mockReturnThis();
      mockTx.limit.mockResolvedValue([]);
      mockTx.update.mockReturnThis();
      mockTx.execute.mockResolvedValue(undefined);
    });

    it("should handle label sync failure gracefully", async () => {
      const mockContent = 'label start:\n    "Hello"';
      const mockBuffer = Buffer.from("mock zip content");
      const mockZip = {
        files: {
          "game/script.rpy": createMockFile("game/script.rpy", mockContent),
        },
      };

      vi.mocked(JSZip.loadAsync).mockResolvedValue(mockZip as any);

      vi.mocked(syncLabelsFromFile).mockResolvedValueOnce({
        success: false,
        labelsCreated: 0,
        labelsUpdated: 0,
        labelsDeleted: 0,
        linesProcessed: 0,
        errors: [{ label: "start", error: "Failed to process label" }],
        skipped: false,
        affectedLabelIds: [],
      });

      const result = await importZipFile(mockProjectId, mockBuffer);

      expect(result).toMatchObject({
        success: true,
        filesImported: 1,
        labelsCreated: 0,
      });
    });

    it("should import zip file and create project files", async () => {
      const mockContent = 'label start:\n    "Hello"';
      const mockBuffer = Buffer.from("mock zip content");

      // Mock JSZip loadAsync
      const mockZip = {
        files: {
          "game/script.rpy": createMockFile("game/script.rpy", mockContent),
        },
      };
      vi.mocked(JSZip.loadAsync).mockResolvedValue(mockZip as any);

      const result = await importZipFile(mockProjectId, mockBuffer);

      expect(result).toMatchObject({
        success: true,
        filesImported: 1,
        labelsCreated: 1, // Our mock parser returns 1 label
      });
    });

    it("should handle invalid zip files", async () => {
      const mockBuffer = Buffer.from("not a valid zip");
      vi.mocked(JSZip.loadAsync).mockRejectedValue(new Error("Invalid zip"));

      const result = await importZipFile(mockProjectId, mockBuffer);

      expect(result).toMatchObject({
        success: false,
        error: expect.any(String),
      });
    });

    it("should handle zip with no .rpy files", async () => {
      const mockBuffer = Buffer.from("empty zip");
      vi.mocked(JSZip.loadAsync).mockResolvedValue({ files: {} } as any);

      const result = await importZipFile(mockProjectId, mockBuffer);

      expect(result).toMatchObject({
        success: true,
        filesImported: 0,
      });
    });

    it("should skip files that already exist with same content hash", async () => {
      const mockContent = 'label start:\n    "Hello"';
      const existingHash = hashContent(mockContent);

      const mockBuffer = Buffer.from("mock zip");
      const mockZip = {
        files: {
          "game/script.rpy": createMockFile("game/script.rpy", mockContent),
        },
      };

      vi.mocked(JSZip.loadAsync).mockResolvedValue(mockZip as any);
      mockTx.limit.mockResolvedValueOnce([
        { contentHash: existingHash, id: "file-id", content: mockContent },
      ]);

      const result = await importZipFile(mockProjectId, mockBuffer);

      expect(result).toMatchObject({
        success: true,
        filesSkipped: 1,
      });
    });

    it("should update files with different content", async () => {
      const mockContent = 'label start:\n    "Updated content"';
      const existingHash = "different-hash";

      const mockBuffer = Buffer.from("mock zip");
      const mockZip = {
        files: {
          "game/script.rpy": createMockFile("game/script.rpy", mockContent),
        },
      };

      vi.mocked(JSZip.loadAsync).mockResolvedValue(mockZip as any);
      // Return existing file for the select query
      mockTx.limit.mockResolvedValueOnce([
        {
          id: "file-id",
          contentHash: existingHash,
          content: "old content",
          filePath: "game/script.rpy",
        },
      ]);

      const result = await importZipFile(mockProjectId, mockBuffer);

      expect(result).toMatchObject({
        success: true,
        filesUpdated: 1,
      });
    });

    it("should handle nested directory structures", async () => {
      const mockContent = 'label start:\n    "Hello"';
      const mockBuffer = Buffer.from("mock zip");

      const mockZip = {
        files: {
          "game/labels/act1/scene1.rpy": createMockFile(
            "game/labels/act1/scene1.rpy",
            mockContent
          ),
          "game/labels/act1/scene2.rpy": createMockFile(
            "game/labels/act1/scene2.rpy",
            mockContent
          ),
        },
      };

      vi.mocked(JSZip.loadAsync).mockResolvedValue(mockZip as any);

      const result = await importZipFile(mockProjectId, mockBuffer);

      expect(result).toMatchObject({
        success: true,
        filesImported: 2,
      });
    });

    it("should return statistics about imported files", async () => {
      const mockContent = 'label start:\n    s "Hello"';
      const mockBuffer = Buffer.from("mock zip");

      const mockZip = {
        files: {
          "game/script.rpy": createMockFile("game/script.rpy", mockContent),
        },
      };

      vi.mocked(JSZip.loadAsync).mockResolvedValue(mockZip as any);

      const result = await importZipFile(mockProjectId, mockBuffer);

      expect(result).toHaveProperty("filesImported");
      expect(result).toHaveProperty("labelsCreated");
      expect(result).toHaveProperty("filesSkipped");
      expect(result).toHaveProperty("filesUpdated");
    });
  });
});
