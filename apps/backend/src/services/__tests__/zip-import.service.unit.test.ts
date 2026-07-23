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

// Mock labels.service
import {
  syncLabelsFromFile,
  updateIncomingJumpsForLabels,
} from "../labels.service.js";

vi.mock("../labels.service.js", () => ({
  syncLabelsFromFile: vi.fn().mockResolvedValue({
    success: true,
    labelsCreated: 1,
    labelsUpdated: 0,
    labelsDeleted: 0,
    linesProcessed: 0,
    errors: [],
    skipped: false,
    affectedLabelIds: [],
    dbLabelCount: 1,
  }),
  updateIncomingJumpsForLabels: vi.fn().mockResolvedValue(undefined),
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
      // onConflictDoNothing is used by the symbol-promotion
      // transaction (issue #244) to upsert characters / variables /
      // stats idempotently. It needs to return `this` like the
      // other chain methods.
      onConflictDoNothing: vi.fn().mockReturnThis(),
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
      // Allow mockTx to be awaited (resolves to []) so that
      // `await tx.select(…).from(…).where(…)` returns an array.
      then: (resolve: (v: unknown[]) => void) => resolve([]),
    };

    const mockDb = {
      transaction: vi.fn().mockImplementation(async (callback) => {
        return callback(mockTx as any);
      }),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onConflictDoUpdate: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockReturnThis(),
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
      mockTx.onConflictDoNothing?.mockReturnThis?.();
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
        dbLabelCount: 0,
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

    // ====================================================================
    // issue #244: `define` / `default` symbols are stripped from the
    // stored file content and promoted into the characters / variables /
    // stats tables so that re-exporting the project cannot produce
    // duplicate `define` statements that would crash Ren'Py with
    // `NameError: name 'X' is already defined`.
    // ====================================================================

    it("strips define Character() and default lines from the content passed to the project_files insert", async () => {
      // The RPY file a user would drop into Ren'Py typically declares
      // its characters and any custom stat defaults at the top. The
      // importer must remove those lines from the stored content and
      // surface them to the database tables instead.
      const fileContent = [
        'define e = Character("Eileen", color="#c8ffc8")',
        'define s = Character("Sylvie", color="#ff0000")',
        "",
        "default affection = 0",
        "default has_met_alex = False",
        "",
        "label start:",
        '    e "Hello."',
        "    return",
      ].join("\n");

      const mockBuffer = Buffer.from("mock zip");
      const mockZip = {
        files: {
          "game/characters.rpy": createMockFile(
            "game/characters.rpy",
            fileContent
          ),
        },
      };
      vi.mocked(JSZip.loadAsync).mockResolvedValue(mockZip as any);

      await importZipFile(mockProjectId, mockBuffer);

      // Find the .values() call for the projectFiles insert. The
      // mock chain is permissive, so the chain is `insert -> values`
      // with `values` receiving the row payload.
      const valuesCalls = mockTx.values.mock.calls;
      const projectFileRow = valuesCalls
        .map((c) => c[0] as Record<string, unknown>)
        .find((row) => row && typeof row.filePath === "string");

      expect(projectFileRow).toBeDefined();
      // The stored `content` no longer contains the symbols, but it
      // does contain the label and dialogue that follow.
      const storedContent = projectFileRow!.content as string;
      expect(storedContent).not.toContain("define e = Character");
      expect(storedContent).not.toContain("define s = Character");
      expect(storedContent).not.toContain("default affection");
      expect(storedContent).not.toContain("default has_met_alex");
      expect(storedContent).toContain("label start:");
      expect(storedContent).toContain('e "Hello."');

      // The original (un-stripped) content is preserved for
      // round-tripping / reconstruction.
      expect(projectFileRow!.originalContent).toBe(fileContent);
    });

    it("promotes extracted characters, variables and stats into the database", async () => {
      // End-to-end check: after importing a file that defines an
      // `e` character, an `affection` stat, and a `has_met_alex`
      // variable, those rows should be inserted into the
      // `characters`, `stats`, and `variables` tables.
      const fileContent = [
        'define e = Character("Eileen", color="#c8ffc8")',
        "",
        "default affection = 0",
        "default has_met_alex = False",
        "",
        "label start:",
        "    return",
      ].join("\n");

      const mockBuffer = Buffer.from("mock zip");
      const mockZip = {
        files: {
          "game/script.rpy": createMockFile("game/script.rpy", fileContent),
        },
      };
      vi.mocked(JSZip.loadAsync).mockResolvedValue(mockZip as any);

      await importZipFile(mockProjectId, mockBuffer);

      // Collect every row that was passed to `tx.values(...)` across
      // both the per-file savepoint transaction and the symbol-
      // promotion transaction. The mock chain is shared by both
      // transactions (they both run via the same `mockTx`), so this
      // captures inserts into all relevant tables.
      const allRows = mockTx.values.mock.calls.map(
        (c) => c[0] as Record<string, unknown>
      );

      // The character row was inserted with the right tag and color.
      const characterRow = allRows.find((r) => "renpyTag" in r);
      expect(characterRow).toMatchObject({
        projectId: mockProjectId,
        renpyTag: "e",
        name: "Eileen",
        displayName: "Eileen",
        color: "#c8ffc8",
      });

      // The variable row (True/False) was inserted.
      const variableRow = allRows.find(
        (r) => "key" in r && !("minValue" in r) && !("maxValue" in r)
      );
      expect(variableRow).toMatchObject({
        projectId: mockProjectId,
        key: "has_met_alex",
      });

      // The stat row (numeric) was inserted with the parsed minValue.
      const statRow = allRows.find((r) => "minValue" in r && "maxValue" in r);
      expect(statRow).toMatchObject({
        projectId: mockProjectId,
        key: "affection",
        minValue: 0,
        maxValue: 100,
      });

      // The `onConflictDoNothing` upsert path was used for all three
      // symbol inserts.
      expect(mockTx.onConflictDoNothing).toHaveBeenCalled();
    });

    it("is idempotent: re-importing the same RPY files does not duplicate symbols", async () => {
      // Same RPY content, two imports. The second one must not
      // fail (the unique constraint on (projectId, renpyTag) and
      // (projectId, key) is handled via onConflictDoNothing).
      const fileContent = [
        'define e = Character("Eileen", color="#c8ffc8")',
        "",
        "default has_met_alex = False",
        "",
        "label start:",
        "    return",
      ].join("\n");

      const mockBuffer = Buffer.from("mock zip");
      const mockZip = {
        files: {
          "game/script.rpy": createMockFile("game/script.rpy", fileContent),
        },
      };
      vi.mocked(JSZip.loadAsync).mockResolvedValue(mockZip as any);

      const first = await importZipFile(mockProjectId, mockBuffer);
      const second = await importZipFile(mockProjectId, mockBuffer);

      expect(first.success).toBe(true);
      expect(second.success).toBe(true);
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

    it("does NOT promote symbols when the per-file savepoint rolls back", async () => {
      // Two files: the first will fail label sync (triggering a
      // savepoint rollback), the second will succeed. Symbols from
      // the failed file must not appear in the promoteSymbols calls.
      const file1Content = [
        'define e = Character("Eileen", color="#c8ffc8")',
        "",
        "label start:",
        '    e "Hello."',
        "    return",
      ].join("\n");

      const file2Content = [
        'define s = Character("Sylvie", color="#ff0000")',
        "",
        "label start:",
        '    s "Hi."',
        "    return",
      ].join("\n");

      const mockBuffer = Buffer.from("mock zip");
      const mockZip = {
        files: {
          "game/fail.rpy": createMockFile("game/fail.rpy", file1Content),
          "game/ok.rpy": createMockFile("game/ok.rpy", file2Content),
        },
      };
      vi.mocked(JSZip.loadAsync).mockResolvedValue(mockZip as any);

      // Make label sync throw for the first file only.
      vi.mocked(syncLabelsFromFile)
        .mockRejectedValueOnce(new Error("Label sync failed"))
        .mockResolvedValueOnce({
          success: true,
          labelsCreated: 1,
          labelsUpdated: 0,
          labelsDeleted: 0,
          linesProcessed: 1,
          errors: [],
          skipped: false,
          affectedLabelIds: ["label-id"],
          dbLabelCount: 1,
        });

      const result = await importZipFile(mockProjectId, mockBuffer);

      expect(result).toMatchObject({
        success: true,
        filesFailed: 1,
        filesImported: 1,
      });

      // Collect all rows passed to tx.values() — these include both
      // the project_file inserts and the symbol-promotion inserts.
      const allRows = mockTx.values.mock.calls.map(
        (c) => c[0] as Record<string, unknown>
      );
      const characterRows = allRows.filter((r) => "renpyTag" in r);

      // Eileen's character (from the failed file) must NOT be promoted.
      const eileenRow = characterRows.find((r) => r.renpyTag === "e");
      expect(eileenRow).toBeUndefined();

      // Sylvie's character (from the succeeding file) MUST be promoted.
      const sylvieRow = characterRows.find((r) => r.renpyTag === "s");
      expect(sylvieRow).toMatchObject({
        projectId: mockProjectId,
        renpyTag: "s",
        name: "Sylvie",
        displayName: "Sylvie",
        color: "#ff0000",
      });
    });

    it("calls updateIncomingJumpsForLabels with the transaction object", async () => {
      const mockContent = 'label start:\n    "Hello"';
      const mockBuffer = Buffer.from("mock zip");
      const mockZip = {
        files: {
          "game/script.rpy": createMockFile("game/script.rpy", mockContent),
        },
      };
      vi.mocked(JSZip.loadAsync).mockResolvedValue(mockZip as any);

      await importZipFile(mockProjectId, mockBuffer);

      // updateIncomingJumpsForLabels must be called with the same
      // transaction (tx) that the file inserts and symbol promotion
      // ran in — not via a separate db.transaction call.
      expect(vi.mocked(updateIncomingJumpsForLabels)).toHaveBeenCalledWith(
        mockTx,
        expect.any(Array),
        mockProjectId
      );
    });
  });
});
