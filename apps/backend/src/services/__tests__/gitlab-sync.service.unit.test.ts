/**
 * GitLab Sync Service Tests
 *
 * Unit tests for GitLab sync orchestration service.
 * Tests are written before implementation (TDD approach).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import nock from "nock";
import {
  exportToGitlab,
  importFromGitlab,
  getSyncOperation,
  listSyncOperations,
  detectConflicts,
} from "../gitlab-sync.service.js";
import * as gitlabService from "../gitlab.service.js";
import * as rpyParserService from "../rpy-parser.service.js";

// Import schema for proper mocking
import { scenes, sceneLines } from "../../db/schema/index.js";

// Mock the database at module level
vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "../../db/index.js";

// Test fixtures
const testProjectId = "project-123";
const testBranch = "main";
const testOperationId = "operation-123";

// Helper to create default mock db
const createMockDb = () => ({
  select: vi.fn(function (this: any) {
    // Capture the 'from' table to return appropriate data
    let fromTable: any = null;
    return {
      from: vi.fn((table: any) => {
        fromTable = table;
        return {
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => {
                // Return different data based on table being queried
                if (fromTable === scenes) {
                  return Promise.resolve([]);
                } else if (fromTable === sceneLines) {
                  return Promise.resolve([]);
                }
                return Promise.resolve([]);
              }),
            })),
          })),
        };
      }),
    };
  }),
  insert: vi.fn(() => ({
    values: vi.fn(() => ({
      returning: vi.fn(() => Promise.resolve([])),
    })),
  })),
  update: vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve(undefined)),
    })),
  })),
  delete: vi.fn(() => ({
    where: vi.fn(() => Promise.resolve(undefined)),
  })),
});

describe("GitLabSyncService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nock.cleanAll();
    nock.disableNetConnect();

    // Set up getDb mock with proper chaining
    vi.mocked(getDb).mockReturnValue(createMockDb() as any);
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  describe("exportToGitlab", () => {
    it("should create a sync operation and export scenes to GitLab", async () => {
      // Mock database operations
      const mockDb = vi.mocked(getDb)();

      // First call to insert (createSyncOperation)
      mockDb.insert = vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() =>
            Promise.resolve([
              {
                id: testOperationId,
                projectId: testProjectId,
                operation: "export",
                status: "in_progress",
                branch: testBranch,
                conflictCount: 0,
                startedAt: new Date(),
              },
            ]),
          ),
        })),
      })) as any;

      // Second call to update (updateSyncOperation)
      mockDb.update = vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve(undefined)),
        })),
      })) as any;

      // Mock select for scenes
      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() =>
                Promise.resolve([
                  {
                    id: "scene-1",
                    projectId: testProjectId,
                    title: "start",
                    route: "COMMON",
                    sceneNumber: 1,
                  },
                  {
                    id: "scene-2",
                    projectId: testProjectId,
                    title: "chapter1",
                    route: "EILEEN",
                    sceneNumber: 2,
                  },
                ]),
              ),
            })),
          })),
        })),
      })) as any;

      // Mock generateRpyFile
      vi.spyOn(rpyParserService, "generateRpyFile")
        .mockReturnValueOnce(
          'label start:\n    "Hello world"\n    s "Welcome!"\n    return',
        )
        .mockReturnValueOnce('label chapter1:\n    s "Chapter 1"\n    return');

      // Mock createOrUpdateFile
      vi.spyOn(gitlabService, "createOrUpdateFile")
        .mockResolvedValueOnce({
          file_path: "game/start.rpy",
          branch: testBranch,
        } as any)
        .mockResolvedValueOnce({
          file_path: "game/chapter1.rpy",
          branch: testBranch,
        } as any);

      const result = await exportToGitlab(
        testProjectId,
        testBranch,
        "Export scenes",
      );

      expect(result).toMatchObject({
        id: testOperationId,
        projectId: testProjectId,
        operation: "export",
        branch: testBranch,
        conflictCount: 0,
      });
    });

    it("should use default branch when not provided", async () => {
      const mockDb = vi.mocked(getDb)();

      mockDb.insert = vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() =>
            Promise.resolve([
              {
                id: testOperationId,
                projectId: testProjectId,
                operation: "export",
                status: "in_progress",
                branch: "main",
                conflictCount: 0,
                startedAt: new Date(),
              },
            ]),
          ),
        })),
      })) as any;

      mockDb.update = vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve(undefined)),
        })),
      })) as any;

      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve([])),
            })),
          })),
        })),
      })) as any;

      vi.spyOn(rpyParserService, "generateRpyFile").mockReturnValue("");

      const result = await exportToGitlab(testProjectId);

      expect(result.id).toBe(testOperationId);
    });

    it("should handle export errors and mark operation as failed", async () => {
      const mockDb = vi.mocked(getDb)();

      mockDb.insert = vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() =>
            Promise.resolve([
              {
                id: testOperationId,
                projectId: testProjectId,
                operation: "export",
                status: "in_progress",
                branch: testBranch,
                conflictCount: 0,
                startedAt: new Date(),
              },
            ]),
          ),
        })),
      })) as any;

      mockDb.update = vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve(undefined)),
        })),
      })) as any;

      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() =>
                Promise.resolve([
                  { id: "scene-1", projectId: testProjectId, title: "start" },
                ]),
              ),
            })),
          })),
        })),
      })) as any;

      vi.spyOn(rpyParserService, "generateRpyFile").mockReturnValue("");

      vi.spyOn(gitlabService, "createOrUpdateFile").mockRejectedValue(
        new Error("API Error"),
      );

      const result = await exportToGitlab(
        testProjectId,
        testBranch,
        "Export scenes",
      );

      expect(result.status).toBe("failed");
    });

    it("should generate commit message when not provided", async () => {
      const mockDb = vi.mocked(getDb)();

      mockDb.insert = vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() =>
            Promise.resolve([
              {
                id: testOperationId,
                projectId: testProjectId,
                operation: "export",
                status: "in_progress",
                branch: testBranch,
                conflictCount: 0,
                startedAt: new Date(),
              },
            ]),
          ),
        })),
      })) as any;

      mockDb.update = vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve(undefined)),
        })),
      })) as any;

      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve([])),
            })),
          })),
        })),
      })) as any;

      vi.spyOn(rpyParserService, "generateRpyFile").mockReturnValue("");

      const result = await exportToGitlab(testProjectId, testBranch);

      expect(result.id).toBe(testOperationId);
    });
  });

  describe("importFromGitlab", () => {
    it("should import RPY files from GitLab and update database", async () => {
      const mockDb = vi.mocked(getDb)();

      mockDb.insert = vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() =>
            Promise.resolve([
              {
                id: testOperationId,
                projectId: testProjectId,
                operation: "import",
                status: "in_progress",
                branch: testBranch,
                conflictCount: 0,
                startedAt: new Date(),
              },
            ]),
          ),
        })),
      })) as any;

      mockDb.update = vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve(undefined)),
        })),
      })) as any;

      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve([])),
            })),
          })),
        })),
      })) as any;

      vi.spyOn(gitlabService, "listRpyFiles").mockResolvedValue([
        { name: "script.rpy", path: "game/script.rpy" },
        { name: "chapter1.rpy", path: "game/chapter1.rpy" },
      ] as any);

      vi.spyOn(gitlabService, "getFileContent")
        .mockResolvedValueOnce('label start:\n    "Hello"\n    return')
        .mockResolvedValueOnce(
          'label chapter1:\n    s "Chapter 1"\n    return',
        );

      vi.spyOn(rpyParserService, "parseRPYFile")
        .mockReturnValueOnce({
          labels: ["start"],
          dialogue: [{ speaker: null, content: "Hello" }],
          choices: [],
          jumps: [],
          characters: [],
        })
        .mockReturnValueOnce({
          labels: ["chapter1"],
          dialogue: [{ speaker: "s", content: "Chapter 1" }],
          choices: [],
          jumps: [],
          characters: [],
        });

      const result = await importFromGitlab(
        testProjectId,
        testBranch,
        "branchforge_wins",
      );

      expect(result).toMatchObject({
        id: testOperationId,
        projectId: testProjectId,
        operation: "import",
        status: "completed",
        branch: testBranch,
        conflictCount: 0,
      });
    });

    it("should handle gitlab_wins conflict resolution", async () => {
      const mockDb = vi.mocked(getDb)();

      mockDb.insert = vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() =>
            Promise.resolve([
              {
                id: testOperationId,
                projectId: testProjectId,
                operation: "import",
                status: "in_progress",
                branch: testBranch,
                conflictCount: 0,
                startedAt: new Date(),
              },
            ]),
          ),
        })),
      })) as any;

      mockDb.update = vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve(undefined)),
        })),
      })) as any;

      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() =>
                Promise.resolve([
                  { id: "scene-1", projectId: testProjectId, title: "start" },
                ]),
              ),
            })),
          })),
        })),
      })) as any;

      vi.spyOn(gitlabService, "listRpyFiles").mockResolvedValue([
        { name: "script.rpy", path: "game/script.rpy" },
      ] as any);

      vi.spyOn(gitlabService, "getFileContent").mockResolvedValueOnce(
        'label start:\n    "Updated from GitLab"\n    return',
      );

      vi.spyOn(rpyParserService, "parseRPYFile").mockReturnValueOnce({
        labels: ["start"],
        dialogue: [{ speaker: null, content: "Updated from GitLab" }],
        choices: [],
        jumps: [],
        characters: [],
      });

      const result = await importFromGitlab(
        testProjectId,
        testBranch,
        "gitlab_wins",
      );

      expect(result.status).toBe("completed");
    });

    it("should handle manual_review conflict resolution", async () => {
      const mockDb = vi.mocked(getDb)();

      mockDb.insert = vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() =>
            Promise.resolve([
              {
                id: testOperationId,
                projectId: testProjectId,
                operation: "import",
                status: "in_progress",
                branch: testBranch,
                conflictCount: 0,
                startedAt: new Date(),
              },
            ]),
          ),
        })),
      })) as any;

      mockDb.update = vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve(undefined)),
        })),
      })) as any;

      // Mock that returns scenes when queried by title (to simulate existing scenes)
      const existingScene = { id: "scene-1", projectId: testProjectId, title: "start" };
      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => {
            // Return a promise that resolves to an array with the existing scene
            // Also support the orderBy().limit() chain for other query patterns
            const result = Promise.resolve([existingScene]);
            (result as any).orderBy = vi.fn(() => ({
              limit: vi.fn(() => result),
            }));
            return result;
          }),
        })),
      })) as any;

      vi.spyOn(gitlabService, "listRpyFiles").mockResolvedValue([
        { name: "script.rpy", path: "game/script.rpy" },
      ] as any);

      vi.spyOn(gitlabService, "getFileContent").mockResolvedValueOnce(
        'label start:\n    "Conflicting content"\n    return',
      );

      vi.spyOn(rpyParserService, "parseRPYFile").mockReturnValueOnce({
        labels: ["start"],
        dialogue: [{ speaker: null, content: "Conflicting content" }],
        choices: [],
        jumps: [],
        characters: [],
      });

      const result = await importFromGitlab(
        testProjectId,
        testBranch,
        "manual_review",
      );

      expect(result.status).toBe("completed");
      expect(result.conflictCount).toBeGreaterThanOrEqual(1);
    });

    it("should handle import errors and mark operation as failed", async () => {
      const mockDb = vi.mocked(getDb)();

      mockDb.insert = vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() =>
            Promise.resolve([
              {
                id: testOperationId,
                projectId: testProjectId,
                operation: "import",
                status: "in_progress",
                branch: testBranch,
                conflictCount: 0,
                startedAt: new Date(),
              },
            ]),
          ),
        })),
      })) as any;

      mockDb.update = vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve(undefined)),
        })),
      })) as any;

      vi.spyOn(gitlabService, "listRpyFiles").mockRejectedValue(
        new Error("API Error"),
      );

      const result = await importFromGitlab(
        testProjectId,
        testBranch,
        "branchforge_wins",
      );

      expect(result.status).toBe("failed");
    });

    it("should handle empty repository (no RPY files)", async () => {
      const mockDb = vi.mocked(getDb)();

      mockDb.insert = vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() =>
            Promise.resolve([
              {
                id: testOperationId,
                projectId: testProjectId,
                operation: "import",
                status: "in_progress",
                branch: testBranch,
                conflictCount: 0,
                startedAt: new Date(),
              },
            ]),
          ),
        })),
      })) as any;

      mockDb.update = vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve(undefined)),
        })),
      })) as any;

      vi.spyOn(gitlabService, "listRpyFiles").mockResolvedValue([]);

      const result = await importFromGitlab(
        testProjectId,
        testBranch,
        "branchforge_wins",
      );

      expect(result).toMatchObject({
        status: "completed",
        conflictCount: 0,
      });
    });
  });

  describe("getSyncOperation", () => {
    it("should return sync operation by ID", async () => {
      const mockOperation = {
        id: testOperationId,
        projectId: testProjectId,
        operation: "export",
        status: "completed",
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
          operation: "export",
          status: "completed",
          branch: testBranch,
          conflictCount: 0,
          startedAt: new Date(),
        },
        {
          id: "op-2",
          projectId: testProjectId,
          operation: "import",
          status: "completed",
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
          operation: "export",
          status: "completed",
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

  describe("detectConflicts", () => {
    it("should detect no conflicts when local and remote are in sync", async () => {
      const mockDb = vi.mocked(getDb)();
      let callCount = 0;

      mockDb.select = vi.fn(function (this: any) {
        callCount++;
        return {
          from: vi.fn((table: any) => {
            // First call gets scenes, second call gets sceneLines
            if (callCount === 1) {
              return {
                where: vi.fn(() =>
                  Promise.resolve([
                    { id: "scene-1", projectId: testProjectId, title: "start" },
                  ]),
                ),
              };
            } else {
              // sceneLines query with leftJoin - return same content as remote
              return {
                leftJoin: vi.fn(() => ({
                  where: vi.fn(() =>
                    Promise.resolve([
                      {
                        sceneId: "scene-1",
                        contentType: "DIALOGUE",
                        speakerTag: null,
                        content: "Same content",
                      },
                    ]),
                  ),
                })),
              };
            }
          }),
        };
      }) as any;

      vi.spyOn(gitlabService, "listRpyFiles").mockResolvedValue([
        { name: "script.rpy", path: "game/script.rpy" },
      ] as any);

      vi.spyOn(gitlabService, "getFileContent").mockResolvedValueOnce(
        'label start:\n    "Same content"\n    return',
      );

      vi.spyOn(rpyParserService, "parseRPYFile").mockReturnValueOnce({
        labels: ["start"],
        dialogue: [{ speaker: null, text: "Same content" }],
        choices: [],
        jumps: [],
        characters: [],
      });

      const result = await detectConflicts(testProjectId, testBranch);

      expect(result).toMatchObject({
        hasConflicts: false,
        conflicts: [],
      });
    });

    it("should detect conflicts when local and remote differ", async () => {
      const mockDb = vi.mocked(getDb)();
      let callCount = 0;

      mockDb.select = vi.fn(function (this: any) {
        callCount++;
        return {
          from: vi.fn((table: any) => {
            // First call gets scenes, subsequent calls get sceneLines
            if (callCount === 1) {
              return {
                where: vi.fn(() =>
                  Promise.resolve([
                    { id: "scene-1", projectId: testProjectId, title: "start" },
                  ]),
                ),
              };
            } else {
              // sceneLines query with leftJoin - return different content than remote
              return {
                leftJoin: vi.fn(() => ({
                  where: vi.fn(() =>
                    Promise.resolve([
                      {
                        sceneId: "scene-1",
                        contentType: "DIALOGUE",
                        speakerTag: null,
                        content: "Local content",
                      },
                    ]),
                  ),
                })),
              };
            }
          }),
        };
      }) as any;

      vi.spyOn(gitlabService, "listRpyFiles").mockResolvedValue([
        { name: "script.rpy", path: "game/script.rpy" },
      ] as any);

      vi.spyOn(gitlabService, "getFileContent").mockResolvedValueOnce(
        'label start:\n    "Remote content"\n    return',
      );

      vi.spyOn(rpyParserService, "parseRPYFile").mockReturnValueOnce({
        labels: ["start"],
        dialogue: [{ speaker: null, content: "Remote content" }],
        choices: [],
        jumps: [],
        characters: [],
      });

      const result = await detectConflicts(testProjectId, testBranch);

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts.length).toBeGreaterThan(0);
    });

    it("should detect new remote labels", async () => {
      const mockDb = vi.mocked(getDb)();

      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve([])),
        })),
      })) as any;

      vi.spyOn(gitlabService, "listRpyFiles").mockResolvedValue([
        { name: "chapter2.rpy", path: "game/chapter2.rpy" },
      ] as any);

      vi.spyOn(gitlabService, "getFileContent").mockResolvedValueOnce(
        'label chapter2:\n    "New chapter"\n    return',
      );

      vi.spyOn(rpyParserService, "parseRPYFile").mockReturnValueOnce({
        labels: ["chapter2"],
        dialogue: [{ speaker: null, content: "New chapter" }],
        choices: [],
        jumps: [],
        characters: [],
      });

      const result = await detectConflicts(testProjectId, testBranch);

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts.length).toBeGreaterThan(0);
    });

    it("should detect deleted remote labels", async () => {
      const mockDb = vi.mocked(getDb)();

      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() =>
            Promise.resolve([
              { id: "scene-1", projectId: testProjectId, title: "start" },
              { id: "scene-2", projectId: testProjectId, title: "chapter1" },
            ]),
          ),
        })),
      })) as any;

      vi.spyOn(gitlabService, "listRpyFiles").mockResolvedValue([]);

      const result = await detectConflicts(testProjectId, testBranch);

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts.length).toBeGreaterThan(0);
    });

    it("should handle multiple conflict types", async () => {
      const mockDb = vi.mocked(getDb)();
      let callCount = 0;

      mockDb.select = vi.fn(function (this: any) {
        callCount++;
        return {
          from: vi.fn((table: any) => {
            // First call gets scenes, subsequent calls get sceneLines
            if (callCount === 1) {
              return {
                where: vi.fn(() =>
                  Promise.resolve([
                    { id: "scene-1", projectId: testProjectId, title: "start" },
                  ]),
                ),
              };
            } else {
              // sceneLines query with leftJoin - return different content than remote
              return {
                leftJoin: vi.fn(() => ({
                  where: vi.fn(() =>
                    Promise.resolve([
                      {
                        sceneId: "scene-1",
                        contentType: "DIALOGUE",
                        speakerTag: null,
                        content: "Local content",
                      },
                    ]),
                  ),
                })),
              };
            }
          }),
        };
      }) as any;

      vi.spyOn(gitlabService, "listRpyFiles").mockResolvedValue([
        { name: "script.rpy", path: "game/script.rpy" },
        { name: "chapter2.rpy", path: "game/chapter2.rpy" },
      ] as any);

      vi.spyOn(gitlabService, "getFileContent")
        .mockResolvedValueOnce('label start:\n    "Remote change"\n    return')
        .mockResolvedValueOnce('label chapter2:\n    "New remote"\n    return');

      vi.spyOn(rpyParserService, "parseRPYFile")
        .mockReturnValueOnce({
          labels: ["start"],
          dialogue: [{ speaker: null, content: "Remote change" }],
          choices: [],
          jumps: [],
          characters: [],
        })
        .mockReturnValueOnce({
          labels: ["chapter2"],
          dialogue: [{ speaker: null, content: "New remote" }],
          choices: [],
          jumps: [],
          characters: [],
        });

      const result = await detectConflicts(testProjectId, testBranch);

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts.length).toBeGreaterThan(0);
    });

    it("should handle API errors gracefully", async () => {
      const mockDb = vi.mocked(getDb)();

      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() =>
            Promise.resolve([
              { id: "scene-1", projectId: testProjectId, title: "start" },
            ]),
          ),
        })),
      })) as any;

      vi.spyOn(gitlabService, "listRpyFiles").mockRejectedValue(
        new Error("API Error"),
      );

      const result = await detectConflicts(testProjectId, testBranch);

      expect(result).toMatchObject({
        hasConflicts: false,
        conflicts: [],
        error: "API Error",
      });
    });
  });
});

