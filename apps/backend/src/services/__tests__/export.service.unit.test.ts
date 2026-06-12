/**
 * Export Service Unit Tests
 *
 * Unit tests for project export generation and management.
 * Covers generateExport, listExports, and getExportForDownload.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be defined before imports
// ---------------------------------------------------------------------------

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

vi.mock("../authz.service.js", () => ({
  requireProjectAccess: vi.fn(async () => {}),
}));

vi.mock("../rate-limiter.service.js", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
}));

vi.mock("../rpy-generator.service.js", () => ({
  patchRPYWithVariables: vi.fn((content: string) => content + "\n# patched"),
  generateVariablesFile: vi.fn(() => "# variables file"),
  generateStatsFile: vi.fn(() => "# stats file"),
  generateCharacterDefinitionsFile: vi.fn(() => "# characters file"),
}));

vi.mock("../../lib/logger.js", () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
  LogEventType: {
    SERVICE_START: "SERVICE_START",
    SERVICE_ERROR: "SERVICE_ERROR",
  },
}));

vi.mock("jszip", () => ({
  default: function MockJSZip() {
    return {
      file: vi.fn(),
      generateAsync: vi.fn(() => Promise.resolve(Buffer.from("mock-zip-data"))),
    };
  },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { getDb } from "../../db/index.js";
import {
  generateExport,
  listExports,
  getExportForDownload,
} from "../export.service.js";
import { checkRateLimit } from "../rate-limiter.service.js";
import { requireProjectAccess } from "../authz.service.js";
import {
  NotFoundError,
  RateLimitError,
} from "../../middleware/error-handler.middleware.js";
import {
  generateVariablesFile,
  generateStatsFile,
  generateCharacterDefinitionsFile,
} from "../rpy-generator.service.js";
import type { GenerateExportResult, ExportSummary } from "../export.service.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Queue of resolve values for successive `await mockDb` calls.
 * Each terminal `.where()` or terminal `.orderBy()` call triggers
 * `await mockDb`, which dequeues the next value.
 * Falls back to `[]` when the queue is empty.
 */
let resolveQueue: unknown[] = [];

/**
 * Create a mock database object where every chain method returns the object
 * itself, and the object is thenable (resolves via the global resolveQueue).
 *
 * Terminal methods that need specific return values (.limit, .returning)
 * are overridden with mockResolvedValueOnce in each test.
 */
function createMockDb(): Record<string, ReturnType<typeof vi.fn>> {
  const db: any = {};
  db.select = vi.fn(() => db);
  db.from = vi.fn(() => db);
  db.innerJoin = vi.fn(() => db);
  db.where = vi.fn(() => db);
  db.orderBy = vi.fn(() => db);
  db.limit = vi.fn(() => db);
  db.offset = vi.fn(() => db);
  db.insert = vi.fn(() => db);
  db.values = vi.fn(() => db);
  db.returning = vi.fn(() => db);
  db.delete = vi.fn(() => db);
  // Make the object thenable — dequeues from resolveQueue on each await
  db.then = vi.fn((resolve: (val: unknown) => void) => {
    resolve(resolveQueue.shift() ?? []);
  });
  return db;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ID = "test-project-id";
const USER_ID = "test-user-id";
const EXPORT_ID = "test-export-id";

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("ExportService", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    resolveQueue = [];
    mockDb = createMockDb();
    vi.mocked(getDb).mockReturnValue(mockDb as any);
  });

  // =========================================================================
  // generateExport
  // =========================================================================

  describe("generateExport", () => {
    it("should generate an export successfully with story files and labels", async () => {
      const mockProject = { name: "My Project" };
      const mockFiles = [
        {
          id: "file-1",
          projectId: PROJECT_ID,
          filePath: "game/script.rpy",
          fileType: "STORY",
          content: "label start:",
          contentHash: "abc123",
          source: "manual",
        },
      ];
      const mockLabels = [
        {
          id: "label-1",
          title: "Start",
          labelName: "start",
          conditions: {},
          effects: {},
          projectFileId: "file-1",
        },
      ];
      const mockExportRecord = {
        id: EXPORT_ID,
        projectId: PROJECT_ID,
        format: "RENPY",
        fileName: "my_project_test.zip",
        content: JSON.stringify({
          "game/script.rpy": "label start:\n# patched",
        }),
        fileSize: 0,
        createdAt: new Date("2024-01-01T00:00:00Z"),
      };

      // Queue: files, labels, variables, stats, characters, cleanup
      resolveQueue.push(mockFiles);
      resolveQueue.push(mockLabels);
      resolveQueue.push([]);
      resolveQueue.push([]);
      resolveQueue.push([]);
      resolveQueue.push([]);

      // Project query: limit(1) returns the project
      mockDb.limit.mockResolvedValueOnce([mockProject]);
      // Insert: returning returns export record
      mockDb.returning.mockResolvedValueOnce([mockExportRecord]);

      const result: GenerateExportResult = await generateExport(
        PROJECT_ID,
        USER_ID
      );

      expect(result.id).toBe(EXPORT_ID);
      expect(result.fileName).toBe(mockExportRecord.fileName);
      expect(result.format).toBe("RENPY");
      expect(result.createdAt).toBe(mockExportRecord.createdAt.toISOString());
      expect(result.fileSize).toBeGreaterThan(0);

      expect(requireProjectAccess).toHaveBeenCalledWith(PROJECT_ID, USER_ID);
      expect(checkRateLimit).toHaveBeenCalledWith(
        `export:${USER_ID}`,
        expect.objectContaining({ maxAttempts: 10 })
      );
    });

    it("should include non-story files as-is", async () => {
      const mockProject = { name: "Test" };
      const mockFiles = [
        {
          id: "file-1",
          projectId: PROJECT_ID,
          filePath: "game/script.rpy",
          fileType: "STORY",
          content: "label start:",
          contentHash: "abc",
          source: "manual",
        },
        {
          id: "file-2",
          projectId: PROJECT_ID,
          filePath: "game/gui.rpy",
          fileType: "SETTINGS",
          content: "screen navigation():",
          contentHash: "def",
          source: "manual",
        },
      ];
      const mockExportRecord = {
        id: EXPORT_ID,
        projectId: PROJECT_ID,
        format: "RENPY",
        fileName: "test_export.zip",
        content: JSON.stringify({
          "game/script.rpy": "label start:\n# patched",
          "game/gui.rpy": "screen navigation():",
        }),
        fileSize: 0,
        createdAt: new Date("2024-01-01T00:00:00Z"),
      };

      resolveQueue.push(mockFiles);
      resolveQueue.push([]); // labels
      resolveQueue.push([]); // variables
      resolveQueue.push([]); // stats
      resolveQueue.push([]); // characters
      resolveQueue.push([]); // cleanup

      mockDb.limit.mockResolvedValueOnce([mockProject]);
      mockDb.returning.mockResolvedValueOnce([mockExportRecord]);

      const result = await generateExport(PROJECT_ID, USER_ID);

      // The non-story file should have been included as-is (no patching)
      const content = JSON.parse(mockExportRecord.content);
      expect(content["game/gui.rpy"]).toBe("screen navigation():");
      expect(content["game/script.rpy"]).toContain("# patched");
      expect(result.id).toBe(EXPORT_ID);
    });

    it("should generate variables/stats/characters files when they exist", async () => {
      const mockProject = { name: "Full Export" };
      const mockFiles = [
        {
          id: "file-1",
          projectId: PROJECT_ID,
          filePath: "game/script.rpy",
          fileType: "STORY",
          content: "label start:",
          contentHash: "abc",
          source: "manual",
        },
      ];
      const mockLabels = [
        {
          id: "label-1",
          title: "Start",
          labelName: "start",
          conditions: {},
          effects: {},
          projectFileId: "file-1",
        },
      ];
      const mockVars = [
        {
          key: "has_sword",
          description: "Started with sword",
          category: "items",
        },
      ];
      const mockStatsArr = [
        {
          key: "affection",
          name: "Affection",
          minValue: 0,
          maxValue: 100,
          description: "Affection stat",
        },
      ];
      const mockChars = [
        { renpyTag: "e", displayName: "Eileen", color: "#c8ffc8" },
      ];
      const mockExportRecord = {
        id: EXPORT_ID,
        projectId: PROJECT_ID,
        format: "RENPY",
        fileName: "full_export_test.zip",
        content: "",
        fileSize: 0,
        createdAt: new Date("2024-01-01T00:00:00Z"),
      };

      // Queue: files, labels, variables, stats, characters, cleanup
      resolveQueue.push(mockFiles);
      resolveQueue.push(mockLabels);
      resolveQueue.push(mockVars);
      resolveQueue.push(mockStatsArr);
      resolveQueue.push(mockChars);
      resolveQueue.push([]);

      mockDb.limit.mockResolvedValueOnce([mockProject]);
      mockDb.returning.mockResolvedValueOnce([mockExportRecord]);

      const result = await generateExport(PROJECT_ID, USER_ID);

      expect(result.id).toBe(EXPORT_ID);

      // Verify the supporting file generators were called
      expect(generateVariablesFile).toHaveBeenCalledWith(mockVars);
      expect(generateStatsFile).toHaveBeenCalledWith(mockStatsArr);
      expect(generateCharacterDefinitionsFile).toHaveBeenCalledWith(mockChars);
    });

    it("should throw RateLimitError when rate limited", async () => {
      vi.mocked(checkRateLimit).mockReturnValueOnce({
        allowed: false,
        remainingAttempts: 0,
        retryAfter: 5000,
      });

      await expect(generateExport(PROJECT_ID, USER_ID)).rejects.toThrow(
        RateLimitError
      );

      expect(requireProjectAccess).not.toHaveBeenCalled();
    });

    it("should throw NotFoundError when project not found", async () => {
      // limit(1) returns [] (no project found) via default mockDb.then fallback
      await expect(generateExport(PROJECT_ID, USER_ID)).rejects.toThrow(
        NotFoundError
      );
    });

    it("should throw NotFoundError when project has no files", async () => {
      // Project found
      mockDb.limit.mockResolvedValueOnce([{ name: "Empty Project" }]);
      // Files query returns [] — nothing in queue, falls back to []
      resolveQueue.push([]);

      // The files query triggers await mockDb, which dequeues []
      // (queue has one element: [])
      // After that, labels query would also trigger await mockDb,
      // but the function throws NotFoundError before reaching it.

      await expect(generateExport(PROJECT_ID, USER_ID)).rejects.toThrow(
        NotFoundError
      );
    });

    it("should sanitize project name in filename", async () => {
      const mockProject = { name: "My Project! (v2)" };
      const mockFiles = [
        {
          id: "file-1",
          projectId: PROJECT_ID,
          filePath: "game/script.rpy",
          fileType: "STORY",
          content: "label start:",
          contentHash: "abc",
          source: "manual",
        },
      ];

      resolveQueue.push(mockFiles); // files
      resolveQueue.push([]); // labels
      resolveQueue.push([]); // variables
      resolveQueue.push([]); // stats
      resolveQueue.push([]); // characters
      resolveQueue.push([]); // cleanup

      mockDb.limit.mockResolvedValueOnce([mockProject]);

      // Intercept .values() to capture the fileName the service computed
      // so we can seed the returning() mock with it
      mockDb.values.mockImplementationOnce((vals: any) => {
        mockDb.returning.mockResolvedValueOnce([
          {
            id: EXPORT_ID,
            projectId: PROJECT_ID,
            format: "RENPY",
            fileName: vals.fileName,
            content: vals.content,
            fileSize: vals.fileSize,
            createdAt: new Date(),
          },
        ]);
        return mockDb;
      });

      const result = await generateExport(PROJECT_ID, USER_ID);

      // The project name "My Project! (v2)" should be sanitized to "my_project__v2_"
      // and then used as the prefix of the output filename
      expect(result.fileName).toMatch(/^my_project___v2_.*\.zip$/);
    });
  });

  // =========================================================================
  // listExports
  // =========================================================================

  describe("listExports", () => {
    it("should list exports ordered by newest first", async () => {
      const mockRows = [
        {
          id: "export-2",
          projectId: PROJECT_ID,
          format: "RENPY",
          fileName: "second.zip",
          fileSize: 200,
          createdAt: new Date("2024-01-02T00:00:00Z"),
        },
        {
          id: "export-1",
          projectId: PROJECT_ID,
          format: "RENPY",
          fileName: "first.zip",
          fileSize: 100,
          createdAt: new Date("2024-01-01T00:00:00Z"),
        },
      ];

      // listExports ends the chain with .orderBy(). We need it to be terminal.
      mockDb.orderBy.mockResolvedValueOnce(mockRows);

      const result: ExportSummary[] = await listExports(PROJECT_ID, USER_ID);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("export-2");
      expect(result[1].id).toBe("export-1");
      expect(result[0].createdAt).toBe(mockRows[0].createdAt.toISOString());
      expect(requireProjectAccess).toHaveBeenCalledWith(PROJECT_ID, USER_ID);
    });

    it("should return empty array when no exports exist", async () => {
      // Default mock resolves to [] for any terminal method
      mockDb.orderBy.mockResolvedValueOnce([]);

      const result: ExportSummary[] = await listExports(PROJECT_ID, USER_ID);

      expect(result).toEqual([]);
      expect(requireProjectAccess).toHaveBeenCalledWith(PROJECT_ID, USER_ID);
    });
  });

  // =========================================================================
  // getExportForDownload
  // =========================================================================

  describe("getExportForDownload", () => {
    it("should return export content when found", async () => {
      const mockRow = { fileName: "test.zip", content: '{"file.rpy":"data"}' };

      mockDb.limit.mockResolvedValueOnce([mockRow]);

      const result = await getExportForDownload(EXPORT_ID, PROJECT_ID, USER_ID);

      expect(result).toEqual(mockRow);
      expect(requireProjectAccess).toHaveBeenCalledWith(PROJECT_ID, USER_ID);
    });

    it("should throw NotFoundError when export not found", async () => {
      // limit(1) resolves to [] by default → row is undefined → NotFoundError
      await expect(
        getExportForDownload(EXPORT_ID, PROJECT_ID, USER_ID)
      ).rejects.toThrow(NotFoundError);

      expect(requireProjectAccess).toHaveBeenCalledWith(PROJECT_ID, USER_ID);
    });
  });

  // =========================================================================
  // cleanupOldExports (tested indirectly via generateExport)
  // =========================================================================

  describe("cleanupOldExports (indirect)", () => {
    it("should trigger cleanup of old exports when generating an export", async () => {
      const mockProject = { name: "Cleanup Test" };
      const mockFiles = [
        {
          id: "file-1",
          projectId: PROJECT_ID,
          filePath: "game/script.rpy",
          fileType: "STORY",
          content: "label start:",
          contentHash: "abc",
          source: "manual",
        },
      ];
      const mockExportRecord = {
        id: EXPORT_ID,
        projectId: PROJECT_ID,
        format: "RENPY",
        fileName: "cleanup_test.zip",
        content: "{}",
        fileSize: 2,
        createdAt: new Date("2024-01-01T00:00:00Z"),
      };

      resolveQueue.push(mockFiles); // files
      resolveQueue.push([]); // labels
      resolveQueue.push([]); // variables
      resolveQueue.push([]); // stats
      resolveQueue.push([]); // characters
      resolveQueue.push([]); // cleanup — no old exports

      mockDb.limit.mockResolvedValueOnce([mockProject]);
      mockDb.returning.mockResolvedValueOnce([mockExportRecord]);

      await generateExport(PROJECT_ID, USER_ID);

      // cleanupOldExports is called with the project ID and uses .offset(10)
      // to fetch exports past MAX_EXPORTS_PER_PROJECT (10)
      expect(mockDb.offset).toHaveBeenCalledWith(10);
    });
  });
});
