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
  normalizeCharacterNameType: vi.fn((nameType: string) => nameType),
}));

vi.mock("../character-source-preservation.service.js", () => ({
  ensureCharacterSourcePreservation: vi.fn(async () => {}),
}));

vi.mock("../../lib/logger.js", () => ({
  logInfo: vi.fn(),
  logWarn: vi.fn(),
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

import { getDb, type Db } from "../../db/index.js";
import {
  generateExport,
  listExports,
  getExportForDownload,
  getExportPreview,
} from "../export.service.js";
import { checkRateLimit } from "../rate-limiter.service.js";
import { requireProjectAccess } from "../authz.service.js";
import {
  NotFoundError,
  RateLimitError,
  ConflictError,
} from "../../middleware/error-handler.middleware.js";
import {
  generateVariablesFile,
  generateStatsFile,
  generateCharacterDefinitionsFile,
} from "../rpy-generator.service.js";
import type { GenerateExportResult, ExportSummary } from "../export.service.js";
import type { ExportPreviewResponse } from "@branchforge/shared";
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

type MockFn = ReturnType<typeof vi.fn>;

/**
 * Typed shape of the mock database object used in tests.
 * Mirrors the chainable, thenable query builder pattern.
 */
interface MockDb {
  select: MockFn;
  from: MockFn;
  innerJoin: MockFn;
  where: MockFn;
  orderBy: MockFn;
  limit: MockFn;
  offset: MockFn;
  insert: MockFn;
  values: MockFn;
  returning: MockFn;
  delete: MockFn;
  then: MockFn;
}

/**
 * Create a mock database object where every chain method returns the object
 * itself, and the object is thenable (resolves via the global resolveQueue).
 *
 * Terminal methods that need specific return values (.limit, .returning)
 * are overridden with mockResolvedValueOnce in each test.
 */
function createMockDb(): MockDb {
  const db = {} as MockDb;
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
  let mockDb: MockDb;

  beforeEach(() => {
    vi.clearAllMocks();
    resolveQueue = [];
    mockDb = createMockDb();
    vi.mocked(getDb).mockReturnValue(mockDb as unknown as Db);
  });

  // =========================================================================
  // generateExport
  // =========================================================================

  describe("generateExport", () => {
    it("preserves restored UI source despite stale story labels and managed rows", async () => {
      const generator = await vi.importActual<
        typeof import("../rpy-generator.service.js")
      >("../rpy-generator.service.js");
      vi.mocked(generateVariablesFile).mockImplementationOnce(
        generator.generateVariablesFile
      );
      const content =
        "default quick_menu = True\r\nlabel ui_label:\r\n    return\r\n";
      resolveQueue.push([]); // project settings
      resolveQueue.push([{ name: "Protected UI" }]); // project
      resolveQueue.push([
        {
          id: "ui-file",
          filePath: "game/screens.rpy",
          fileType: "STORY",
          content,
        },
      ]);
      resolveQueue.push([
        {
          projectFileId: "ui-file",
          title: "UI",
          labelName: "ui_label",
          conditions: {},
          effects: {},
        },
      ]);
      resolveQueue.push([{ key: "quick_menu" }, { key: "met_nelson" }]);
      resolveQueue.push([]);
      resolveQueue.push([]);
      resolveQueue.push([]);
      mockDb.returning.mockResolvedValueOnce([
        {
          id: EXPORT_ID,
          fileName: "protected.zip",
          format: "RENPY",
          createdAt: new Date(),
        },
      ]);

      await generateExport(PROJECT_ID, USER_ID);

      const payload = mockDb.values.mock.calls[0][0] as { content: string };
      const exported: Record<string, string> = JSON.parse(payload.content);
      expect(exported["game/screens.rpy"]).toBe(content);
      expect(exported["game/branchforge_variables.rpy"]).toContain(
        "default met_nelson = False"
      );
      expect(exported["game/branchforge_variables.rpy"]).not.toContain(
        "quick_menu"
      );
      expect(generateVariablesFile).toHaveBeenCalledWith([
        { key: "met_nelson" },
      ]);
    });

    it("renders the default-policy unknown-speaker fixture in the definitions file", async () => {
      // User fixture regression: `define u = Character("???", color="#E4E4E4")`
      // used to disappear from branchforge_definitions.rpy because the old
      // default exclusions contained `u`. The defaults are now exactly
      // `narrator` and `extend`, so the DB row must be exported.
      const generator = await vi.importActual<
        typeof import("../rpy-generator.service.js")
      >("../rpy-generator.service.js");
      vi.mocked(generateCharacterDefinitionsFile).mockImplementationOnce(
        generator.generateCharacterDefinitionsFile
      );
      const mockProject = { name: "Unknown Speaker" };
      const mockFiles = [
        {
          id: "file-1",
          projectId: PROJECT_ID,
          filePath: "game/script.rpy",
          fileType: "STORY",
          content: "label start:\n    return",
          contentHash: "abc",
          source: "manual",
        },
      ];
      const mockExportRecord = {
        id: EXPORT_ID,
        projectId: PROJECT_ID,
        format: "RENPY",
        fileName: "unknown_speaker.zip",
        content: "",
        fileSize: 0,
        createdAt: new Date("2024-01-01T00:00:00Z"),
      };

      resolveQueue.push([]); // project settings (defaults apply)
      resolveQueue.push([mockProject]); // project
      resolveQueue.push(mockFiles); // files
      resolveQueue.push([]); // labels
      resolveQueue.push([]); // variables
      resolveQueue.push([]); // stats
      resolveQueue.push([
        {
          renpyTag: "u",
          name: "???",
          nameType: "unknown",
          color: "#E4E4E4",
          isNarrator: false,
          displayName: "u",
          sourceDefinition: null,
        },
      ]); // characters
      resolveQueue.push([]); // cleanup

      mockDb.returning.mockResolvedValueOnce([mockExportRecord]);

      await generateExport(PROJECT_ID, USER_ID);

      const insertPayload = mockDb.values.mock.calls[0][0] as {
        content: string;
      };
      const savedContent = JSON.parse(insertPayload.content);
      expect(savedContent["game/branchforge_definitions.rpy"]).toContain(
        'define u = Character("???", color="#E4E4E4")'
      );
    });

    it("conflicts when an explicitly excluded character has no source declaration", async () => {
      resolveQueue.push([{ excludedCharacterTags: ["narrator", "u"] }]); // project settings (explicit legacy array)
      resolveQueue.push([{ name: "Legacy" }]); // project
      resolveQueue.push([
        {
          id: "file-1",
          projectId: PROJECT_ID,
          filePath: "game/script.rpy",
          fileType: "STORY",
          content: "label start:\n    return",
          contentHash: "abc",
          source: "manual",
        },
      ]); // files
      resolveQueue.push([]); // labels
      resolveQueue.push([]); // variables
      resolveQueue.push([]); // stats
      resolveQueue.push([
        {
          renpyTag: "u",
          name: "???",
          nameType: "unknown",
          color: "#E4E4E4",
          isNarrator: false,
          displayName: "u",
          sourceDefinition: null,
        },
      ]); // characters

      await expect(generateExport(PROJECT_ID, USER_ID)).rejects.toThrow(
        ConflictError
      );
      // No export record must be written.
      expect(mockDb.values).not.toHaveBeenCalled();
    });

    it("preserves an explicitly excluded character declared in source", async () => {
      const mockProject = { name: "Explicit" };
      const mockFiles = [
        {
          id: "file-1",
          projectId: PROJECT_ID,
          filePath: "game/script.rpy",
          fileType: "STORY",
          content:
            'define u = Character("???", color="#E4E4E4")\nlabel start:\n    return',
          contentHash: "abc",
          source: "manual",
        },
      ];
      const mockExportRecord = {
        id: EXPORT_ID,
        projectId: PROJECT_ID,
        format: "RENPY",
        fileName: "explicit.zip",
        content: "",
        fileSize: 0,
        createdAt: new Date("2024-01-01T00:00:00Z"),
      };

      resolveQueue.push([{ excludedCharacterTags: ["narrator", "u"] }]); // project settings
      resolveQueue.push([mockProject]); // project
      resolveQueue.push(mockFiles); // files
      resolveQueue.push([]); // labels
      resolveQueue.push([]); // variables
      resolveQueue.push([]); // stats
      resolveQueue.push([
        {
          renpyTag: "u",
          name: "???",
          nameType: "unknown",
          color: "#E4E4E4",
          isNarrator: false,
          displayName: "u",
          sourceDefinition: null,
        },
      ]); // characters
      resolveQueue.push([]); // cleanup

      mockDb.returning.mockResolvedValueOnce([mockExportRecord]);

      await generateExport(PROJECT_ID, USER_ID);

      const insertPayload = mockDb.values.mock.calls[0][0] as {
        content: string;
      };
      const savedContent = JSON.parse(insertPayload.content);
      // The declaration stays source-owned in the user file...
      expect(savedContent["game/script.rpy"]).toContain(
        'define u = Character("???", color="#E4E4E4")'
      );
      // ...and no generated definitions file is emitted for it.
      expect(savedContent).not.toHaveProperty(
        "game/branchforge_definitions.rpy"
      );
    });

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

      // Queue: settings, files, labels, variables, stats, characters, cleanup
      resolveQueue.push([]); // project settings
      resolveQueue.push([mockProject]); // project
      resolveQueue.push(mockFiles);
      resolveQueue.push(mockLabels);
      resolveQueue.push([]);
      resolveQueue.push([]);
      resolveQueue.push([]);
      resolveQueue.push([]);

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
        {
          id: "file-3",
          projectId: PROJECT_ID,
          filePath: "game/CON.rpy",
          fileType: "STORY",
          content: "label reserved:",
          contentHash: "ghi",
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

      resolveQueue.push([]); // project settings
      resolveQueue.push([mockProject]); // project
      resolveQueue.push(mockFiles);
      resolveQueue.push([]); // labels
      resolveQueue.push([]); // variables
      resolveQueue.push([]); // stats
      resolveQueue.push([]); // characters
      resolveQueue.push([]); // cleanup

      mockDb.returning.mockResolvedValueOnce([mockExportRecord]);

      const result = await generateExport(PROJECT_ID, USER_ID);

      // Verify the service passed the correct content to the DB insert.
      // The non-story file should be included as-is (no patching).
      expect(mockDb.values).toHaveBeenCalledTimes(1);
      const insertPayload = mockDb.values.mock.calls[0][0] as {
        content: string;
      };
      const savedContent = JSON.parse(insertPayload.content);
      expect(savedContent["game/gui.rpy"]).toBe("screen navigation():");
      // No labels queued, so the story file is also included as-is
      expect(savedContent["game/script.rpy"]).toBe("label start:");
      expect(result.id).toBe(EXPORT_ID);
    });

    it("should include empty-string project files in the zip payload", async () => {
      const mockProject = { name: "Empty File Export" };
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
          filePath: "game/new_chapter.rpy",
          fileType: "STORY",
          content: "",
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
          "game/script.rpy": "label start:",
          "game/new_chapter.rpy": "",
        }),
        fileSize: 0,
        createdAt: new Date("2024-01-01T00:00:00Z"),
      };

      resolveQueue.push([]); // project settings
      resolveQueue.push([mockProject]); // project
      resolveQueue.push(mockFiles);
      resolveQueue.push([]); // labels
      resolveQueue.push([]); // variables
      resolveQueue.push([]); // stats
      resolveQueue.push([]); // characters
      resolveQueue.push([]); // cleanup

      mockDb.returning.mockResolvedValueOnce([mockExportRecord]);

      await generateExport(PROJECT_ID, USER_ID);

      expect(mockDb.values).toHaveBeenCalledTimes(1);
      const insertPayload = mockDb.values.mock.calls[0][0] as {
        content: string;
      };
      const savedContent = JSON.parse(insertPayload.content);
      expect(savedContent["game/new_chapter.rpy"]).toBe("");
      expect(savedContent["game/script.rpy"]).toBe("label start:");
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
        {
          renpyTag: "e",
          name: "Eileen",
          nameType: "literal" as const,
          displayName: "Eileen",
          color: "#c8ffc8",
        },
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

      // Queue: settings, files, labels, variables, stats, characters, cleanup
      resolveQueue.push([]); // project settings
      resolveQueue.push([mockProject]); // project
      resolveQueue.push(mockFiles);
      resolveQueue.push(mockLabels);
      resolveQueue.push(mockVars);
      resolveQueue.push(mockStatsArr);
      resolveQueue.push(mockChars);
      resolveQueue.push([]);

      mockDb.returning.mockResolvedValueOnce([mockExportRecord]);

      const result = await generateExport(PROJECT_ID, USER_ID);

      expect(result.id).toBe(EXPORT_ID);

      // Verify the supporting file generators were called
      expect(generateVariablesFile).toHaveBeenCalledWith(mockVars);
      expect(generateStatsFile).toHaveBeenCalledWith(mockStatsArr);
      expect(generateCharacterDefinitionsFile).toHaveBeenCalledWith(mockChars);
    });

    it("should place generated branchforge_*.rpy files under the common directory prefix", async () => {
      // Reproduces the regression in issue #244: the three generated
      // supporting files used to be written at the archive root, so
      // Ren'Py silently ignored them. The fix is to compute the
      // shared top-level directory from the project file paths and
      // place the generated files under it.
      const mockProject = { name: "Prefixed" };
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
        fileName: "prefixed.zip",
        content: "",
        fileSize: 0,
        createdAt: new Date("2024-01-01T00:00:00Z"),
      };

      resolveQueue.push([]); // project settings
      resolveQueue.push([mockProject]); // project
      resolveQueue.push(mockFiles); // files
      resolveQueue.push([]); // labels
      resolveQueue.push([{ key: "v", description: null, category: null }]);
      resolveQueue.push([
        { key: "s", name: "S", minValue: 0, maxValue: 1, description: null },
      ]);
      resolveQueue.push([
        {
          renpyTag: "e",
          name: "Eileen",
          nameType: "literal" as const,
          displayName: "Eileen",
          color: "#c8ffc8",
        },
      ]);
      resolveQueue.push([]); // cleanup

      mockDb.returning.mockResolvedValueOnce([mockExportRecord]);

      // Capture the JSON content the service hands to the DB.
      mockDb.values.mockImplementationOnce(
        (vals: { fileName: string; content: string; fileSize: number }) => {
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
        }
      );

      await generateExport(PROJECT_ID, USER_ID);

      const insertPayload = mockDb.values.mock.calls[0][0] as {
        content: string;
      };
      const savedContent = JSON.parse(insertPayload.content);

      // The supporting files must live under `game/`, not at the
      // archive root.
      expect(savedContent).toHaveProperty("game/branchforge_variables.rpy");
      expect(savedContent).toHaveProperty("game/branchforge_stats.rpy");
      expect(savedContent).toHaveProperty("game/branchforge_definitions.rpy");
      expect(savedContent).not.toHaveProperty("branchforge_variables.rpy");
      expect(savedContent).not.toHaveProperty("branchforge_stats.rpy");
      expect(savedContent).not.toHaveProperty("branchforge_definitions.rpy");
    });

    it("strips define/default lines from project files at export time as a defensive safety net", async () => {
      // Simulates a project that was imported before issue #244
      // shipped and therefore still has `define <tag> = Character(...)`
      // and `default <key> = ...` lines in its stored `content`.
      // The export must strip them on the way out, otherwise the
      // generated `branchforge_*.rpy` files would collide with the
      // user-authored lines and crash Ren'Py with
      // `NameError: name 'X' is already defined`.
      const mockProject = { name: "Legacy" };
      const mockFiles = [
        {
          id: "file-1",
          projectId: PROJECT_ID,
          filePath: "game/characters.rpy",
          fileType: "STORY",
          // Pre-fix style: characters and stat defaults live in
          // the project files, not in the DB.
          content: [
            'define e = Character("Eileen", color="#c8ffc8")',
            "default affection = 0",
            "",
            "label start:",
            "    return",
          ].join("\n"),
          contentHash: "legacy-hash",
          source: "manual",
        },
      ];
      const mockExportRecord = {
        id: EXPORT_ID,
        projectId: PROJECT_ID,
        format: "RENPY",
        fileName: "legacy.zip",
        content: "",
        fileSize: 0,
        createdAt: new Date("2024-01-01T00:00:00Z"),
      };

      resolveQueue.push([]); // project settings
      resolveQueue.push([mockProject]); // project
      resolveQueue.push(mockFiles); // files
      resolveQueue.push([]); // labels
      resolveQueue.push([]); // variables
      resolveQueue.push([]); // stats
      resolveQueue.push([]); // characters (DB-side, not in the file)
      resolveQueue.push([]); // cleanup

      mockDb.returning.mockResolvedValueOnce([mockExportRecord]);

      mockDb.values.mockImplementationOnce(
        (vals: { fileName: string; content: string; fileSize: number }) => {
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
        }
      );

      await generateExport(PROJECT_ID, USER_ID);

      const insertPayload = mockDb.values.mock.calls[0][0] as {
        content: string;
      };
      const savedContent = JSON.parse(insertPayload.content);
      // The user file in the zip is clean of `define`/`default`
      // lines even though the DB has no characters / variables /
      // stats to generate a branchforge_*.rpy for.
      expect(savedContent["game/characters.rpy"]).not.toContain(
        "define e = Character"
      );
      expect(savedContent["game/characters.rpy"]).not.toContain(
        "default affection"
      );
      expect(savedContent["game/characters.rpy"]).toContain("label start:");
    });

    it("ignores unsafe file paths when computing the generated-file directory prefix", async () => {
      // A file whose `file_path` fails `sanitizeZipEntryPath` (e.g.
      // contains `..`) must not drag the directory-prefix
      // calculation off the real project layout. Before the fix,
      // such a stray entry would force the prefix to "" and place
      // `branchforge_*.rpy` at the archive root — silently
      // disabling them in Ren'Py. See issue #244.
      const mockProject = { name: "Unsafe" };
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
          // Path-traversal — `sanitizeZipEntryPath` rejects it.
          filePath: "evil/../escape.rpy",
          fileType: "STORY",
          content: "label evil:",
          contentHash: "def",
          source: "manual",
        },
      ];
      const mockExportRecord = {
        id: EXPORT_ID,
        projectId: PROJECT_ID,
        format: "RENPY",
        fileName: "unsafe.zip",
        content: "",
        fileSize: 0,
        createdAt: new Date("2024-01-01T00:00:00Z"),
      };

      resolveQueue.push([]); // project settings
      resolveQueue.push([mockProject]); // project
      resolveQueue.push(mockFiles); // files
      resolveQueue.push([]); // labels
      resolveQueue.push([{ key: "v", description: null, category: null }]);
      resolveQueue.push([]); // stats
      resolveQueue.push([]); // characters
      resolveQueue.push([]); // cleanup

      mockDb.returning.mockResolvedValueOnce([mockExportRecord]);

      mockDb.values.mockImplementationOnce(
        (vals: { fileName: string; content: string; fileSize: number }) => {
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
        }
      );

      await generateExport(PROJECT_ID, USER_ID);

      const insertPayload = mockDb.values.mock.calls[0][0] as {
        content: string;
      };
      const savedContent = JSON.parse(insertPayload.content);
      // The unsafe path was filtered out, so the prefix is `game/`
      // (not ""), and the generated file lives where Ren'Py will find it.
      expect(savedContent).toHaveProperty("game/branchforge_variables.rpy");
      expect(savedContent).not.toHaveProperty("branchforge_variables.rpy");
      // The unsafe path itself is not in the archive.
      expect(savedContent).not.toHaveProperty("evil/../escape.rpy");
      expect(savedContent).not.toHaveProperty("game/CON.rpy");
    });

    it("should fall back to no prefix when project files have mixed top-level directories", async () => {
      // If the project mixes top-level directories (e.g. `game/`
      // and `docs/`) and they disagree, the helper returns "" so we
      // place the generated files at the archive root. This matches
      // the GitLab export behaviour.
      const mockProject = { name: "Mixed" };
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
          filePath: "docs/readme.rpy",
          fileType: "SETTINGS",
          content: "screen about():",
          contentHash: "def",
          source: "manual",
        },
      ];
      const mockExportRecord = {
        id: EXPORT_ID,
        projectId: PROJECT_ID,
        format: "RENPY",
        fileName: "mixed.zip",
        content: "",
        fileSize: 0,
        createdAt: new Date("2024-01-01T00:00:00Z"),
      };

      resolveQueue.push([]); // project settings
      resolveQueue.push([mockProject]); // project
      resolveQueue.push(mockFiles); // files
      resolveQueue.push([]); // labels
      resolveQueue.push([{ key: "v", description: null, category: null }]);
      resolveQueue.push([]); // stats
      resolveQueue.push([]); // characters
      resolveQueue.push([]); // cleanup

      mockDb.returning.mockResolvedValueOnce([mockExportRecord]);

      mockDb.values.mockImplementationOnce(
        (vals: { fileName: string; content: string; fileSize: number }) => {
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
        }
      );

      await generateExport(PROJECT_ID, USER_ID);

      const insertPayload = mockDb.values.mock.calls[0][0] as {
        content: string;
      };
      const savedContent = JSON.parse(insertPayload.content);
      // Variables is the only generated file in this test; with no
      // common top-level directory it should be at the root.
      expect(savedContent).toHaveProperty("branchforge_variables.rpy");
      expect(savedContent).not.toHaveProperty("game/branchforge_variables.rpy");
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
      resolveQueue.push([]); // project settings
      // Project found
      resolveQueue.push([{ name: "Empty Project" }]);
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

      resolveQueue.push([]); // project settings
      resolveQueue.push([mockProject]); // project
      resolveQueue.push(mockFiles); // files
      resolveQueue.push([]); // labels
      resolveQueue.push([]); // variables
      resolveQueue.push([]); // stats
      resolveQueue.push([]); // characters
      resolveQueue.push([]); // cleanup

      // Intercept .values() to capture the fileName the service computed
      // so we can seed the returning() mock with it
      mockDb.values.mockImplementationOnce(
        (vals: { fileName: string; content: string; fileSize: number }) => {
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
        }
      );

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
  // getExportPreview
  // =========================================================================

  describe("getExportPreview", () => {
    it("previews only managed symbols not declared in protected source", async () => {
      resolveQueue.push([]); // project settings
      resolveQueue.push([{ key: "quick_menu" }, { key: "met_nelson" }]);
      resolveQueue.push([{ key: "text_scale" }, { key: "trust" }]);
      resolveQueue.push([
        { renpyTag: "ui_character" },
        { renpyTag: "ne", nameType: "literal" },
      ]);
      resolveQueue.push([
        {
          filePath: "game/screens.rpy",
          content:
            'default quick_menu = True\ndefault text_scale = 1.5\ndefine ui_character = Character("UI")',
        },
      ]);

      await getExportPreview(PROJECT_ID, USER_ID);

      expect(generateVariablesFile).toHaveBeenCalledWith([
        { key: "met_nelson" },
      ]);
      expect(generateStatsFile).toHaveBeenCalledWith([{ key: "trust" }]);
      expect(generateCharacterDefinitionsFile).toHaveBeenCalledWith([
        { renpyTag: "ne", nameType: "literal" },
      ]);
    });

    it("previews the default-policy unknown-speaker character", async () => {
      const generator = await vi.importActual<
        typeof import("../rpy-generator.service.js")
      >("../rpy-generator.service.js");
      vi.mocked(generateCharacterDefinitionsFile).mockImplementationOnce(
        generator.generateCharacterDefinitionsFile
      );
      resolveQueue.push([]); // project settings (defaults apply)
      resolveQueue.push([]); // variables
      resolveQueue.push([]); // stats
      resolveQueue.push([
        {
          renpyTag: "u",
          name: "???",
          nameType: "unknown",
          color: "#E4E4E4",
          isNarrator: false,
          displayName: "u",
          sourceDefinition: null,
        },
      ]); // characters
      resolveQueue.push([]); // source files

      const result: ExportPreviewResponse = await getExportPreview(
        PROJECT_ID,
        USER_ID
      );

      expect(result.files[2].content).toContain(
        'define u = Character("???", color="#E4E4E4")'
      );
      expect(result.files[2].isEmpty).toBe(false);
    });

    it("conflicts on preview when an excluded character has no source declaration", async () => {
      resolveQueue.push([{ excludedCharacterTags: ["narrator", "u"] }]); // project settings
      resolveQueue.push([]); // variables
      resolveQueue.push([]); // stats
      resolveQueue.push([
        {
          renpyTag: "u",
          name: "???",
          nameType: "unknown",
          color: "#E4E4E4",
          isNarrator: false,
          displayName: "u",
          sourceDefinition: null,
        },
      ]); // characters
      resolveQueue.push([]); // source files

      await expect(getExportPreview(PROJECT_ID, USER_ID)).rejects.toThrow(
        ConflictError
      );
    });

    it("previews an excluded character preserved in source without conflict", async () => {
      resolveQueue.push([{ excludedCharacterTags: ["narrator", "u"] }]); // project settings
      resolveQueue.push([]); // variables
      resolveQueue.push([]); // stats
      resolveQueue.push([
        {
          renpyTag: "u",
          name: "???",
          nameType: "unknown",
          color: "#E4E4E4",
          isNarrator: false,
          displayName: "u",
          sourceDefinition: null,
        },
      ]); // characters
      resolveQueue.push([
        {
          filePath: "game/script.rpy",
          content:
            'define u = Character("???", color="#E4E4E4")\nlabel start:\n    return',
        },
      ]); // source files

      const result: ExportPreviewResponse = await getExportPreview(
        PROJECT_ID,
        USER_ID
      );

      // Source-owned: the definitions preview stays empty.
      expect(result.files[2].isEmpty).toBe(true);
    });

    it("should throw RateLimitError when rate limited", async () => {
      vi.mocked(checkRateLimit).mockReturnValueOnce({
        allowed: false,
        remainingAttempts: 0,
        retryAfter: 5000,
      });

      await expect(getExportPreview(PROJECT_ID, USER_ID)).rejects.toThrow(
        RateLimitError
      );

      expect(requireProjectAccess).not.toHaveBeenCalled();
      expect(checkRateLimit).toHaveBeenCalledWith(
        `export-preview:${USER_ID}`,
        expect.objectContaining({ maxAttempts: 60 })
      );
    });

    it("should call requireProjectAccess", async () => {
      // Five queries: settings, variables, stats, characters, source files
      resolveQueue.push([]); // project settings
      resolveQueue.push([]); // variables
      resolveQueue.push([]); // stats
      resolveQueue.push([]); // characters
      resolveQueue.push([]); // source files

      await getExportPreview(PROJECT_ID, USER_ID);

      expect(requireProjectAccess).toHaveBeenCalledWith(PROJECT_ID, USER_ID);
      expect(checkRateLimit).toHaveBeenCalledWith(
        `export-preview:${USER_ID}`,
        expect.objectContaining({ maxAttempts: 60 })
      );
    });

    it("should return isEmpty true with emptyReason when all sources are empty", async () => {
      resolveQueue.push([]); // project settings
      resolveQueue.push([]); // variables
      resolveQueue.push([]); // stats
      resolveQueue.push([]); // characters
      resolveQueue.push([]); // source files

      const result: ExportPreviewResponse = await getExportPreview(
        PROJECT_ID,
        USER_ID
      );

      expect(result.files).toHaveLength(3);

      expect(result.files[0].isEmpty).toBe(true);
      expect(result.files[0].emptyReason).toBe(
        "No managed variable defaults to export"
      );

      expect(result.files[1].isEmpty).toBe(true);
      expect(result.files[1].emptyReason).toBe(
        "No managed stat defaults to export"
      );

      expect(result.files[2].isEmpty).toBe(true);
      expect(result.files[2].emptyReason).toBe(
        "No managed character definitions to export"
      );
    });

    it("should return isEmpty false when sources have data", async () => {
      const mockVars = [
        {
          key: "has_sword",
          description: "Started with sword",
          category: "items",
        },
      ];
      const mockStats = [
        {
          key: "affection",
          name: "Affection",
          minValue: 0,
          maxValue: 100,
          description: "Affection stat",
        },
      ];
      const mockChars = [
        {
          renpyTag: "e",
          name: "Eileen",
          nameType: "literal" as const,
          displayName: "Eileen",
          color: "#c8ffc8",
          isNarrator: false,
        },
      ];

      resolveQueue.push([]); // project settings
      resolveQueue.push(mockVars);
      resolveQueue.push(mockStats);
      resolveQueue.push(mockChars);
      resolveQueue.push([]); // source files

      const result: ExportPreviewResponse = await getExportPreview(
        PROJECT_ID,
        USER_ID
      );

      expect(result.files).toHaveLength(3);
      expect(result.files[0].isEmpty).toBe(false);
      expect(result.files[0].emptyReason).toBeNull();
      expect(result.files[1].isEmpty).toBe(false);
      expect(result.files[1].emptyReason).toBeNull();
      expect(result.files[2].isEmpty).toBe(false);
      expect(result.files[2].emptyReason).toBeNull();
    });

    it("should return files in order: variables, stats, definitions", async () => {
      resolveQueue.push([]); // project settings
      resolveQueue.push([]); // variables
      resolveQueue.push([]); // stats
      resolveQueue.push([]); // characters
      resolveQueue.push([]); // source files

      const result: ExportPreviewResponse = await getExportPreview(
        PROJECT_ID,
        USER_ID
      );

      expect(result.files[0].kind).toBe("variables");
      expect(result.files[0].fileName).toBe("branchforge_variables.rpy");
      expect(result.files[1].kind).toBe("stats");
      expect(result.files[1].fileName).toBe("branchforge_stats.rpy");
      expect(result.files[2].kind).toBe("definitions");
      expect(result.files[2].fileName).toBe("branchforge_definitions.rpy");
    });

    it("should pass data to generator functions", async () => {
      const mockVars = [
        {
          key: "has_sword",
          description: "Started with sword",
          category: "items",
        },
      ];
      const mockStats = [
        {
          key: "affection",
          name: "Affection",
          minValue: 0,
          maxValue: 100,
          description: "Affection stat",
        },
      ];
      const mockChars = [
        {
          renpyTag: "e",
          name: "Eileen",
          nameType: "literal" as const,
          displayName: "Eileen",
          color: "#c8ffc8",
          isNarrator: false,
        },
      ];

      resolveQueue.push([]); // project settings
      resolveQueue.push(mockVars);
      resolveQueue.push(mockStats);
      resolveQueue.push(mockChars);
      resolveQueue.push([]); // source files

      await getExportPreview(PROJECT_ID, USER_ID);

      expect(generateVariablesFile).toHaveBeenCalledWith(mockVars);
      expect(generateStatsFile).toHaveBeenCalledWith(mockStats);
      expect(generateCharacterDefinitionsFile).toHaveBeenCalledWith(mockChars);
    });

    it("should include generated content even when source is empty", async () => {
      resolveQueue.push([]); // project settings
      resolveQueue.push([]); // variables
      resolveQueue.push([]); // stats
      resolveQueue.push([]); // characters
      resolveQueue.push([]); // source files

      const result: ExportPreviewResponse = await getExportPreview(
        PROJECT_ID,
        USER_ID
      );

      // The mocked generators return "# variables file" etc. regardless
      expect(result.files[0].content).toBe("# variables file");
      expect(result.files[1].content).toBe("# stats file");
      expect(result.files[2].content).toBe("# characters file");
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

      resolveQueue.push([]); // project settings
      resolveQueue.push([mockProject]); // project
      resolveQueue.push(mockFiles); // files
      resolveQueue.push([]); // labels
      resolveQueue.push([]); // variables
      resolveQueue.push([]); // stats
      resolveQueue.push([]); // characters
      resolveQueue.push([]); // source files
      resolveQueue.push([]); // cleanup — no old exports

      mockDb.returning.mockResolvedValueOnce([mockExportRecord]);

      await generateExport(PROJECT_ID, USER_ID);

      // cleanupOldExports is called with the project ID and uses .offset(10)
      // to fetch exports past MAX_EXPORTS_PER_PROJECT (10)
      expect(mockDb.offset).toHaveBeenCalledWith(10);
    });
  });
});
