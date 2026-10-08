/**
 * GitLab Sync Service Integration Tests
 *
 * Tests for the GitLab sync service against a real database.
 * Tests cover the new file-based architecture with projectFiles table.
 *
 * Prerequisites:
 * - DATABASE_URL_TEST environment variable must be set
 * - Test database must exist and have proper schema
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  vi,
} from "vitest";
import nock from "nock";
import * as gitlabService from "../gitlab.service.js";
import * as gitlabRepoService from "../gitlab/gitlab-repository.service.js";
import * as gitlabFileService from "../gitlab/gitlab-file.service.js";
import * as gitlabIntegrationService from "../gitlab/gitlab-integration.service.js";
import * as rpyParserService from "../rpy-parser.service.js";
import { getDb } from "../../db/index.js";
import {
  users,
  projects,
  labels as labelsTable,
  labelLines,
  characters,
  variables,
  stats,
  projectFiles,
  projectFilePendingOperations,
  projectSettings,
  gitlabSyncOperations,
} from "../../db/schema/index.js";
import { and, eq } from "drizzle-orm";
import { NotFoundError } from "../../middleware/error-handler.middleware.js";
import {
  detectConflicts,
  exportToGitlab,
  importFromGitlab,
} from "../gitlab-sync.service.js";
import { charactersService } from "../characters.service.js";
import type { ConflictResolution } from "../gitlab.types.js";
import { testEmail, testUuid } from "../../utils/test-ids.js";
import { calculateContentHash } from "../../lib/hash.js";
import * as labelsService from "../labels.service.js";
import { extractAndStripRpySymbols } from "../rpy-statements.service.js";

describe("GitLabSyncService (Integration)", () => {
  let db: ReturnType<typeof getDb>;

  beforeAll(async () => {
    db = getDb();
  });

  // Test fixtures with hardcoded UUIDs
  const testUserId = testUuid("06000000", 1);
  const testProjectId = testUuid("16000000", 1);
  const testGitlabFileId = testUuid("56000000", 1);
  const testBranch = "main";

  // Factory helper for creating project file fixtures
  let projectFileFixtureCounter = 1;
  function createProjectFileFixture(
    overrides: {
      id?: string;
      filePath?: string;
      content?: string;
      contentHash?: string;
    } = {}
  ) {
    const id = overrides.id ?? testUuid("56000000", projectFileFixtureCounter);
    // Only increment counter for auto-generated IDs
    if (!overrides.id) {
      projectFileFixtureCounter++;
    }
    return {
      id,
      projectId: testProjectId,
      source: "GITLAB" as const,
      filePath:
        overrides.filePath ?? `game/script${projectFileFixtureCounter}.rpy`,
      fileType: "STORY" as const,
      content: overrides.content ?? 'label start:\n    "Content"\n    return',
      contentHash: overrides.contentHash ?? `hash${projectFileFixtureCounter}`,
    };
  }

  const testUser = {
    id: testUserId,
    email: testEmail("gitlab-sync-service", "owner"),
    passwordHash: "hashed_password",
    role: "OWNER" as const,
  };

  const testProject = {
    id: testProjectId,
    userId: testUserId,
    name: "Test Project",
    description: "A test project",
    maxStatDelta: 10,
    source: "GITLAB" as const,
  };

  const testGitlabFile = createProjectFileFixture({
    id: testGitlabFileId,
    filePath: "game/script.rpy",
    contentHash: "hash123",
  });

  const testScene = {
    id: testUuid("26000000", 1),
    projectId: testProjectId,
    title: "start",
    groupType: null,
    groupValue: null,
    labelNumber: 1,
    sequenceOrder: 0,
    route: "COMMON" as const,
    status: "DRAFT" as const,
    conditions: {},
    effects: {},
    projectFileId: testGitlabFileId,
    labelName: "start",
    labelPosition: 0,
  };

  const testCharacter = {
    id: testUuid("36000000", 1),
    projectId: testProjectId,
    name: "Sylvie",
    displayName: "Sylvie",
    renpyTag: "s",
    isLoveInterest: true,
    color: "#c8ffc8",
  };

  // Helper to clean up all test data
  async function cleanupTestData() {
    await db.delete(labelLines).where(eq(labelLines.labelId, testScene.id));
    await db.delete(labelsTable).where(eq(labelsTable.id, testScene.id));
    await db.delete(characters).where(eq(characters.id, testCharacter.id));
    await db
      .delete(projectFiles)
      .where(eq(projectFiles.projectId, testProjectId));
    await db
      .delete(gitlabSyncOperations)
      .where(eq(gitlabSyncOperations.projectId, testProjectId));
    await db.delete(projects).where(eq(projects.id, testProjectId));
    await db.delete(users).where(eq(users.id, testUserId));
  }

  // Helper to clean up additional test data (for multi-scene tests)
  async function _cleanupAdditionalData(labelIds: string[]) {
    for (const labelId of labelIds) {
      await db.delete(labelLines).where(eq(labelLines.labelId, labelId));
      await db.delete(labelsTable).where(eq(labelsTable.id, labelId));
    }
  }

  // Helper to set up test data
  async function setupTestData(includeGitlabFile = false) {
    // Insert user and project
    await db.insert(users).values(testUser);
    await db.insert(projects).values(testProject);
    if (includeGitlabFile) {
      await db.insert(projectFiles).values(testGitlabFile);
    }
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(gitlabRepoService, "getBranchCommitSha").mockResolvedValue(
      "existing-sha"
    );
    nock.cleanAll();
    nock.disableNetConnect();
    projectFileFixtureCounter = 2; // Reset counter (1 is used by testGitlabFile)
    await cleanupTestData();
    await setupTestData(true); // Include gitlabFile by default
  });

  afterEach(async () => {
    nock.cleanAll();
    nock.enableNetConnect();
    await cleanupTestData();
  });

  describe("detectConflicts", () => {
    it("should detect no conflicts when local and remote are in sync", async () => {
      // Set up local scene with lines
      await db.insert(labelsTable).values(testScene);

      // Insert a line with the same content as remote
      await db.insert(labelLines).values({
        id: testUuid("46000000", 1),
        labelId: testScene.id,
        sequence: 1,
        contentType: "NARRATION" as const,
        content: "Same content",
        visualType: "GENERATED" as const,
      });

      // Mock GitLab API to return the same content (for getFileContent)
      vi.spyOn(gitlabRepoService, "getFileContent").mockResolvedValue(
        'label start:\n    "Same content"\n    return'
      );

      vi.spyOn(rpyParserService, "parseRPYFileWithLabels").mockReturnValue({
        labels: [
          {
            label: "start",
            lineNumber: 1,
            dialogue: [{ speaker: null, text: "Same content", lineNumber: 2 }],
            choices: [],
            jumps: [],
          },
        ],
        characters: [],
        fileType: "STORY",
      });

      const result = await detectConflicts(
        testProjectId,
        testUserId,
        testBranch
      );

      expect(result).toMatchObject({
        hasConflicts: false,
        conflicts: [],
      });
    });

    it("should detect conflicts when local and remote content differs", async () => {
      // Set up local scene with lines
      await db.insert(labelsTable).values(testScene);

      // Insert a line with different content than remote
      await db.insert(labelLines).values({
        id: testUuid("46000000", 1),
        labelId: testScene.id,
        sequence: 1,
        contentType: "NARRATION" as const,
        content: "Local content",
        visualType: "GENERATED" as const,
      });

      // Mock GitLab API to return different content (for getFileContent)
      vi.spyOn(gitlabRepoService, "getFileContent").mockResolvedValue(
        'label start:\n    "Remote content"\n    return'
      );

      vi.spyOn(rpyParserService, "parseRPYFileWithLabels").mockReturnValue({
        labels: [
          {
            label: "start",
            lineNumber: 1,
            dialogue: [
              { speaker: null, text: "Remote content", lineNumber: 2 },
            ],
            choices: [],
            jumps: [],
          },
        ],
        characters: [],
        fileType: "STORY",
      });

      const result = await detectConflicts(
        testProjectId,
        testUserId,
        testBranch
      );

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toMatchObject({
        label: "start",
        type: "dialogue_mismatch",
      });
    });

    it("should detect new remote labels", async () => {
      // First, clean up the default gitlab file to avoid extra conflicts
      await db
        .delete(projectFiles)
        .where(eq(projectFiles.id, testGitlabFileId));

      // Create a gitlab file with a new label that doesn't exist locally
      const newGitlabFile = createProjectFileFixture({
        filePath: "game/chapter2.rpy",
        content: 'label chapter2:\n    "New chapter"\n    return',
      });
      await db.insert(projectFiles).values(newGitlabFile);

      // Mock GitLab API to return the new label content
      vi.spyOn(gitlabRepoService, "getFileContent").mockResolvedValue(
        'label chapter2:\n    "New chapter"\n    return'
      );

      vi.spyOn(rpyParserService, "parseRPYFileWithLabels").mockReturnValue({
        labels: [
          {
            label: "chapter2",
            lineNumber: 1,
            dialogue: [{ speaker: null, text: "New chapter", lineNumber: 2 }],
            choices: [],
            jumps: [],
          },
        ],
        characters: [],
        fileType: "STORY",
      });

      const result = await detectConflicts(
        testProjectId,
        testUserId,
        testBranch
      );

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toMatchObject({
        label: "chapter2",
        type: "new_remote_label",
      });

      // Cleanup
      await db
        .delete(projectFiles)
        .where(eq(projectFiles.id, newGitlabFile.id));
      // Restore the default gitlab file
      await db.insert(projectFiles).values(testGitlabFile);
    });

    it("should detect deleted remote labels", async () => {
      // Set up local scene
      await db.insert(labelsTable).values(testScene);

      // Mock GitLab API to return empty content (file deleted or label removed)
      // We need to mock the getFileContent to return a file with different labels
      let callCount = 0;
      vi.spyOn(gitlabRepoService, "getFileContent").mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call for testGitlabFile - return different label
          return Promise.resolve(
            'label other:\n    "Other content"\n    return'
          );
        }
        return Promise.resolve("");
      });

      vi.spyOn(rpyParserService, "parseRPYFileWithLabels").mockReturnValue({
        labels: [
          {
            label: "other",
            lineNumber: 1,
            dialogue: [{ speaker: null, text: "Other content", lineNumber: 2 }],
            choices: [],
            jumps: [],
          },
        ],
        characters: [],
        fileType: "STORY",
      });

      const result = await detectConflicts(
        testProjectId,
        testUserId,
        testBranch
      );

      expect(result.hasConflicts).toBe(true);
      // We expect 2 conflicts: "other" is a new remote label, and "start" was deleted remotely
      expect(result.conflicts.length).toBeGreaterThanOrEqual(1);

      // Check that we have the deleted_remote_label conflict
      const deletedConflict = result.conflicts.find(
        (c) => c.type === "deleted_remote_label"
      );
      expect(deletedConflict).toMatchObject({
        label: "start",
        type: "deleted_remote_label",
      });
    });

    it("should detect conflicts when dialogue with speakers differs", async () => {
      // Set up local scene with character
      await db.insert(labelsTable).values(testScene);
      await db.insert(characters).values(testCharacter);

      // Insert dialogue lines with speaker
      await db.insert(labelLines).values([
        {
          id: testUuid("46000000", 1),
          labelId: testScene.id,
          sequence: 1,
          contentType: "DIALOGUE" as const,
          content: "Local dialogue",
          speakerId: testCharacter.id,
          visualType: "GENERATED" as const,
        },
      ]);

      // Mock GitLab API to return different dialogue
      vi.spyOn(gitlabRepoService, "getFileContent").mockResolvedValue(
        'label start:\n    s "Remote dialogue"\n    return'
      );

      vi.spyOn(rpyParserService, "parseRPYFileWithLabels").mockReturnValue({
        labels: [
          {
            label: "start",
            lineNumber: 1,
            dialogue: [
              { speaker: "s", text: "Remote dialogue", lineNumber: 2 },
            ],
            choices: [],
            jumps: [],
          },
        ],
        characters: [],
        fileType: "STORY",
      });

      const result = await detectConflicts(
        testProjectId,
        testUserId,
        testBranch
      );

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toMatchObject({
        label: "start",
        type: "dialogue_mismatch",
      });
    });

    it("should detect no conflicts when dialogue with speakers matches", async () => {
      // Set up local scene with character
      await db.insert(labelsTable).values(testScene);
      await db.insert(characters).values(testCharacter);

      // Insert dialogue lines with speaker matching remote
      await db.insert(labelLines).values([
        {
          id: testUuid("46000000", 1),
          labelId: testScene.id,
          sequence: 1,
          contentType: "DIALOGUE" as const,
          content: "Same dialogue",
          speakerId: testCharacter.id,
          visualType: "GENERATED" as const,
        },
      ]);

      // Mock GitLab API to return the same dialogue
      vi.spyOn(gitlabRepoService, "getFileContent").mockResolvedValue(
        'label start:\n    s "Same dialogue"\n    return'
      );

      vi.spyOn(rpyParserService, "parseRPYFileWithLabels").mockReturnValue({
        labels: [
          {
            label: "start",
            lineNumber: 1,
            dialogue: [{ speaker: "s", text: "Same dialogue", lineNumber: 2 }],
            choices: [],
            jumps: [],
          },
        ],
        characters: [],
        fileType: "STORY",
      });

      const result = await detectConflicts(
        testProjectId,
        testUserId,
        testBranch
      );

      expect(result).toMatchObject({
        hasConflicts: false,
        conflicts: [],
      });
    });

    it("should handle multiple conflict types simultaneously", async () => {
      // Set up local scene with lines
      await db.insert(labelsTable).values(testScene);

      await db.insert(labelLines).values({
        id: testUuid("46000000", 1),
        labelId: testScene.id,
        sequence: 1,
        contentType: "NARRATION" as const,
        content: "Local content",
        visualType: "GENERATED" as const,
      });

      // Create another gitlab file for a new label
      const newGitlabFile = createProjectFileFixture({
        filePath: "game/chapter2.rpy",
        content: 'label chapter2:\n    "New remote"\n    return',
      });
      await db.insert(projectFiles).values(newGitlabFile);

      // Mock GitLab API to return different content based on file path (order-independent)
      vi.spyOn(gitlabRepoService, "getFileContent").mockImplementation(
        async (_projectId, _userId, filePath) => {
          if (filePath === "game/script.rpy") {
            return 'label start:\n    "Remote change"\n    return';
          } else if (filePath === "game/chapter2.rpy") {
            return 'label chapter2:\n    "New remote"\n    return';
          }
          return "";
        }
      );

      vi.spyOn(rpyParserService, "parseRPYFileWithLabels").mockImplementation(
        (content) => {
          if (content.includes("Remote change")) {
            return {
              labels: [
                {
                  label: "start",
                  lineNumber: 1,
                  dialogue: [
                    { speaker: null, text: "Remote change", lineNumber: 2 },
                  ],
                  choices: [],
                  jumps: [],
                },
              ],
              characters: [],
              fileType: "STORY",
            };
          } else if (content.includes("New remote")) {
            return {
              labels: [
                {
                  label: "chapter2",
                  lineNumber: 1,
                  dialogue: [
                    { speaker: null, text: "New remote", lineNumber: 2 },
                  ],
                  choices: [],
                  jumps: [],
                },
              ],
              characters: [],
              fileType: "STORY",
            };
          }
          return { labels: [], characters: [], fileType: "STORY" };
        }
      );

      const result = await detectConflicts(
        testProjectId,
        testUserId,
        testBranch
      );

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts.length).toBeGreaterThanOrEqual(2);

      const conflictLabels = result.conflicts.map((c) => c.label);
      expect(conflictLabels).toContain("start");
      expect(conflictLabels).toContain("chapter2");

      const conflictTypes = result.conflicts.map((c) => c.type);
      expect(conflictTypes).toContain("dialogue_mismatch");
      expect(conflictTypes).toContain("new_remote_label");

      // Cleanup
      await db
        .delete(projectFiles)
        .where(eq(projectFiles.id, newGitlabFile.id));
    });

    it("should handle API errors gracefully", async () => {
      // Set up local scene
      await db.insert(labelsTable).values(testScene);

      // Mock GitLab API to throw error
      vi.spyOn(gitlabRepoService, "getFileContent").mockRejectedValue(
        new Error("API Error")
      );

      const result = await detectConflicts(
        testProjectId,
        testUserId,
        testBranch
      );

      expect(result).toMatchObject({
        hasConflicts: false,
        conflicts: [],
        error: "API Error",
      });
    });

    it("should handle multiple scenes and lines correctly", async () => {
      // Create another gitlab file for the second scene
      const testGitlabFile2 = createProjectFileFixture({
        filePath: "game/chapter1.rpy",
        content: 'label chapter1:\n    "Chapter 1 Line 1"\n    return',
      });
      await db.insert(projectFiles).values(testGitlabFile2);

      // Set up two local scenes with multiple lines
      const testScene2 = {
        id: testUuid("26000000", 2),
        projectId: testProjectId,
        title: "chapter1",
        groupType: null,
        groupValue: null,
        labelNumber: 2,
        sequenceOrder: 1,
        route: "COMMON" as const,
        status: "DRAFT" as const,
        conditions: {},
        effects: {},
        projectFileId: testGitlabFile2.id, // Uses the dynamically generated ID
        labelName: "chapter1",
        labelPosition: 0,
      };

      await db.insert(labelsTable).values([testScene, testScene2]);

      await db.insert(labelLines).values([
        {
          id: testUuid("46000000", 1),
          labelId: testScene.id,
          sequence: 1,
          contentType: "NARRATION" as const,
          content: "Line 1",
          visualType: "GENERATED" as const,
        },
        {
          id: testUuid("46000000", 2),
          labelId: testScene.id,
          sequence: 2,
          contentType: "NARRATION" as const,
          content: "Line 2",
          visualType: "GENERATED" as const,
        },
        {
          id: testUuid("46000000", 3),
          labelId: testScene2.id,
          sequence: 1,
          contentType: "NARRATION" as const,
          content: "Chapter 1 Line 1",
          visualType: "GENERATED" as const,
        },
      ]);

      // Mock GitLab API to return matching content based on file path (order-independent)
      vi.spyOn(gitlabRepoService, "getFileContent").mockImplementation(
        async (_projectId, _userId, filePath) => {
          if (filePath === "game/script.rpy") {
            return 'label start:\n    "Line 1"\n    "Line 2"\n    return';
          } else if (filePath === "game/chapter1.rpy") {
            return 'label chapter1:\n    "Chapter 1 Line 1"\n    return';
          }
          return "";
        }
      );

      // Mock separate file parses for each scene based on content
      vi.spyOn(rpyParserService, "parseRPYFileWithLabels").mockImplementation(
        (content) => {
          if (content.includes("Line 1") && content.includes("Line 2")) {
            return {
              labels: [
                {
                  label: "start",
                  lineNumber: 1,
                  dialogue: [
                    { speaker: null, text: "Line 1", lineNumber: 2 },
                    { speaker: null, text: "Line 2", lineNumber: 3 },
                  ],
                  choices: [],
                  jumps: [],
                },
              ],
              characters: [],
              fileType: "STORY",
            };
          } else if (content.includes("Chapter 1 Line 1")) {
            return {
              labels: [
                {
                  label: "chapter1",
                  lineNumber: 1,
                  dialogue: [
                    { speaker: null, text: "Chapter 1 Line 1", lineNumber: 2 },
                  ],
                  choices: [],
                  jumps: [],
                },
              ],
              characters: [],
              fileType: "STORY",
            };
          }
          return { labels: [], characters: [], fileType: "STORY" };
        }
      );

      const result = await detectConflicts(
        testProjectId,
        testUserId,
        testBranch
      );

      expect(result).toMatchObject({
        hasConflicts: false,
        conflicts: [],
      });

      // Cleanup
      await db.delete(labelLines).where(eq(labelLines.labelId, testScene2.id));
      await db.delete(labelsTable).where(eq(labelsTable.id, testScene2.id));
      await db
        .delete(projectFiles)
        .where(eq(projectFiles.id, testGitlabFile2.id));
    });
  });

  describe("exportToGitlab", () => {
    /**
     * The new export pushes only REQUIRED actions: structural pending
     * operations, content-changed files (contentHash differs from the
     * last-pushed local baseline) and generated files. These tests seed a
     * stale lastPushedContentHash so the file counts as content-modified.
     */
    async function makeFileContentModified(fileId: string): Promise<void> {
      await db
        .update(projectFiles)
        .set({ lastPushedContentHash: "stale-pushed-baseline" })
        .where(eq(projectFiles.id, fileId));
    }

    async function setOlderRemoteBaseline(fileId: string): Promise<string> {
      const content = `${testGitlabFile.content}\n# older remote version`;
      await db
        .update(projectFiles)
        .set({
          remoteContent: content,
          remoteContentHash: calculateContentHash(content),
        })
        .where(eq(projectFiles.id, fileId));
      return content;
    }

    function mockRemoteContent(content: string): void {
      vi.spyOn(
        gitlabRepoService,
        "getFileContentWithMetadata"
      ).mockResolvedValue({
        content,
        lastCommitId: "remote-rev-1",
        contentSha256: null,
        blobId: null,
      });
    }

    it("exports cleaned legacy source files and later Script Mode edits", async () => {
      const sourcePath = "game/variables.rpy";
      const original =
        'default met_sylvie = False\ndefine s = Character("Sylvie")\nlabel start:\n    return';
      const cleaned = extractAndStripRpySymbols(original).cleanedContent;
      const sourceId = testUuid("56000000", 90);
      await db.insert(projectFiles).values({
        id: sourceId,
        projectId: testProjectId,
        source: "GITLAB",
        filePath: sourcePath,
        fileType: "STORY",
        content: cleaned,
        originalContent: original,
        contentHash: calculateContentHash(cleaned),
        lastPushedContentHash: null,
        remoteFilePath: sourcePath,
        remoteContent: null,
        remoteContentHash: null,
      });
      await db.insert(variables).values({
        id: testUuid("76000000", 90),
        projectId: testProjectId,
        key: "met_sylvie",
      });
      await db.insert(characters).values(testCharacter);

      let remoteSource = original;
      vi.spyOn(
        gitlabRepoService,
        "getFileContentWithMetadata"
      ).mockImplementation(async (_projectId, _userId, filePath) => ({
        content: filePath === sourcePath ? remoteSource : null,
        lastCommitId: "remote-rev-1",
        contentSha256: null,
        blobId: null,
      }));
      const commitSpy = vi
        .spyOn(gitlabFileService, "batchCommitFiles")
        .mockResolvedValue("commit-managed");

      const first = await exportToGitlab(testProjectId, testUserId, testBranch);
      expect(first.status, first.errorMessage ?? undefined).toBe("COMPLETED");
      expect(commitSpy.mock.calls[0]?.[4]).toEqual(
        expect.arrayContaining([
          { action: "update", filePath: sourcePath, content: cleaned },
          expect.objectContaining({
            action: "create",
            filePath: "game/branchforge_variables.rpy",
          }),
          expect.objectContaining({
            action: "create",
            filePath: "game/branchforge_definitions.rpy",
          }),
        ])
      );

      const [source] = await db
        .select()
        .from(projectFiles)
        .where(eq(projectFiles.id, sourceId));
      expect(source.remoteContentHash).toBe(calculateContentHash(cleaned));

      remoteSource = cleaned;
      const second = await exportToGitlab(
        testProjectId,
        testUserId,
        testBranch
      );
      expect(second.status).toBe("COMPLETED");
      expect(commitSpy).toHaveBeenCalledTimes(2);
      expect(commitSpy.mock.calls[1]?.[4]).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ filePath: sourcePath }),
        ])
      );

      const edited = `${cleaned}\n# local edit`;
      await db
        .update(projectFiles)
        .set({ content: edited, contentHash: calculateContentHash(edited) })
        .where(eq(projectFiles.id, sourceId));
      const third = await exportToGitlab(testProjectId, testUserId, testBranch);
      expect(third.status).toBe("COMPLETED");
      expect(commitSpy.mock.calls[2]?.[4]).toEqual(
        expect.arrayContaining([
          { action: "update", filePath: sourcePath, content: edited },
        ])
      );
    });

    it("exports a Script Mode edit when a legacy file has no sync hashes", async () => {
      const original = "default has_key = False\nlabel start:\n    return";
      const cleaned = extractAndStripRpySymbols(original).cleanedContent;
      const edited = `${cleaned}\n# Script Mode edit`;
      await db
        .update(projectFiles)
        .set({
          filePath: "variables.rpy",
          content: edited,
          contentHash: calculateContentHash(edited),
          originalContent: original,
          lastPushedContentHash: null,
          remoteContent: null,
          remoteContentHash: null,
        })
        .where(eq(projectFiles.id, testGitlabFileId));
      mockRemoteContent(original);
      const commitSpy = vi
        .spyOn(gitlabFileService, "batchCommitFiles")
        .mockResolvedValue("commit-legacy-edit");

      const result = await exportToGitlab(
        testProjectId,
        testUserId,
        testBranch
      );
      expect(result.status).toBe("COMPLETED");
      expect(commitSpy.mock.calls[0]?.[4]).toEqual(
        expect.arrayContaining([
          {
            action: "update",
            filePath: "variables.rpy",
            content: edited,
          },
        ])
      );
    });

    it("rejects remote drift against a legacy file's original content", async () => {
      const original = "default has_key = False\nlabel start:\n    return";
      const cleaned = extractAndStripRpySymbols(original).cleanedContent;
      await db
        .update(projectFiles)
        .set({
          filePath: "variables.rpy",
          content: cleaned,
          contentHash: calculateContentHash(cleaned),
          originalContent: original,
          lastPushedContentHash: null,
          remoteContent: null,
          remoteContentHash: null,
        })
        .where(eq(projectFiles.id, testGitlabFileId));
      mockRemoteContent(
        'default has_key = False\nlabel start:\n    "Changed remotely"\n    return'
      );
      const commitSpy = vi.spyOn(gitlabFileService, "batchCommitFiles");

      const result = await exportToGitlab(
        testProjectId,
        testUserId,
        testBranch
      );
      expect(result.status).toBe("FAILED");
      expect(result.errorMessage).toContain("remote file changed");
      expect(commitSpy).not.toHaveBeenCalled();
    });

    it("should export files to GitLab when files exist", async () => {
      vi.spyOn(gitlabFileService, "batchCommitFiles").mockResolvedValue(
        "commit123"
      );
      await makeFileContentModified(testGitlabFileId);
      mockRemoteContent(await setOlderRemoteBaseline(testGitlabFileId));

      const result = await exportToGitlab(
        testProjectId,
        testUserId,
        testBranch,
        "Test export"
      );

      expect(result).toMatchObject({
        projectId: testProjectId,
        operation: "EXPORT",
        status: "COMPLETED",
        branch: testBranch,
        conflictCount: 0,
        commitId: "commit123",
      });
      expect(gitlabFileService.batchCommitFiles).toHaveBeenCalledWith(
        testProjectId,
        testUserId,
        testBranch,
        "Test export",
        [
          {
            action: "update",
            filePath: testGitlabFile.filePath,
            content: testGitlabFile.content,
          },
        ]
      );

      // The pushed content advances the local baseline
      const [file] = await db
        .select()
        .from(projectFiles)
        .where(eq(projectFiles.id, testGitlabFileId));
      expect(file?.lastPushedContentHash).toBe("hash123");
      expect(file?.remoteFilePath).toBe("game/script.rpy");
    });

    it("preflights a missing branch against the default branch and commits to the new name", async () => {
      vi.spyOn(gitlabRepoService, "getBranchCommitSha").mockImplementation(
        async (_projectId, _userId, branch) => {
          if (branch === "feature/labels") {
            throw new NotFoundError("Branch 'feature/labels'");
          }
          return "base-sha";
        }
      );
      vi.spyOn(gitlabRepoService, "getRepositoryLink").mockResolvedValue({
        id: 1,
        projectId: testProjectId,
        gitlabProjectId: 42,
        repositoryName: "test/repo",
        defaultBranch: "main",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);
      vi.spyOn(gitlabFileService, "batchCommitFiles").mockResolvedValue(
        "commit-new-branch"
      );
      await makeFileContentModified(testGitlabFileId);
      const contentSpy = vi
        .spyOn(gitlabRepoService, "getFileContentWithMetadata")
        .mockResolvedValue({
          content: await setOlderRemoteBaseline(testGitlabFileId),
          lastCommitId: "remote-rev-1",
          contentSha256: null,
          blobId: null,
        });

      const result = await exportToGitlab(
        testProjectId,
        testUserId,
        "feature/labels",
        "Create branch"
      );

      expect(result).toMatchObject({
        status: "COMPLETED",
        branch: "feature/labels",
        commitId: "commit-new-branch",
      });
      expect(contentSpy).toHaveBeenCalledWith(
        testProjectId,
        testUserId,
        testGitlabFile.filePath,
        "main"
      );
      expect(gitlabFileService.batchCommitFiles).toHaveBeenCalledWith(
        testProjectId,
        testUserId,
        "feature/labels",
        "Create branch",
        [
          {
            action: "update",
            filePath: testGitlabFile.filePath,
            content: testGitlabFile.content,
          },
        ]
      );
    });

    it("fails clearly when the default branch is missing and a new branch cannot be created", async () => {
      vi.spyOn(gitlabRepoService, "getBranchCommitSha").mockRejectedValue(
        new NotFoundError("Branch 'main'")
      );
      vi.spyOn(gitlabRepoService, "getRepositoryLink").mockResolvedValue({
        id: 1,
        projectId: testProjectId,
        gitlabProjectId: 42,
        repositoryName: "test/repo",
        defaultBranch: "main",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);
      await makeFileContentModified(testGitlabFileId);

      const result = await exportToGitlab(
        testProjectId,
        testUserId,
        "main",
        "Missing default"
      );

      expect(result.status).toBe("FAILED");
      expect(result.errorMessage).toBe(
        "Export failed. The repository default branch was not found, so a new branch cannot be created."
      );
    });

    it("should export empty-string files created locally", async () => {
      const emptyFile = createProjectFileFixture({
        filePath: "game/new_chapter.rpy",
        content: "",
        contentHash: "empty-content-hash",
      });
      await db.insert(projectFiles).values(emptyFile);

      vi.spyOn(gitlabFileService, "batchCommitFiles").mockResolvedValue(
        "commit124"
      );
      await makeFileContentModified(testGitlabFileId);
      await db.insert(projectFilePendingOperations).values({
        projectId: testProjectId,
        projectFileId: emptyFile.id,
        operation: "CREATE",
        remoteBasePath: emptyFile.filePath,
        localPath: emptyFile.filePath,
      });
      vi.spyOn(
        gitlabRepoService,
        "getFileContentWithMetadata"
      ).mockImplementation(async (_projectId, _userId, filePath) => ({
        content: filePath === emptyFile.filePath ? null : "",
        lastCommitId: "remote-rev-1",
        contentSha256: null,
        blobId: null,
      }));

      const result = await exportToGitlab(
        testProjectId,
        testUserId,
        testBranch,
        "Test export"
      );

      expect(result).toMatchObject({
        projectId: testProjectId,
        operation: "EXPORT",
        status: "COMPLETED",
        branch: testBranch,
        conflictCount: 0,
      });
      expect(gitlabFileService.batchCommitFiles).toHaveBeenCalledWith(
        testProjectId,
        testUserId,
        testBranch,
        "Test export",
        expect.arrayContaining([
          {
            action: "update",
            filePath: testGitlabFile.filePath,
            content: testGitlabFile.content,
          },
          { action: "create", filePath: "game/new_chapter.rpy", content: "" },
        ])
      );

      await db.delete(projectFiles).where(eq(projectFiles.id, emptyFile.id));
    });

    it("should handle export when no files exist", async () => {
      // Delete the gitlab file first
      await db
        .delete(projectFiles)
        .where(eq(projectFiles.id, testGitlabFileId));

      // Mock the GitLab service (should not be called)
      const batchCommitFilesSpy = vi
        .spyOn(gitlabService, "batchCommitFiles")
        .mockResolvedValue(null);

      const result = await exportToGitlab(
        testProjectId,
        testUserId,
        testBranch,
        "Test export"
      );

      expect(result).toMatchObject({
        projectId: testProjectId,
        operation: "EXPORT",
        status: "COMPLETED",
        branch: testBranch,
        conflictCount: 0,
      });
      expect(batchCommitFilesSpy).not.toHaveBeenCalled();
    });

    it("should handle GitLab API errors", async () => {
      // Mock the GitLab service to throw error
      vi.spyOn(gitlabFileService, "batchCommitFiles").mockRejectedValue(
        new Error("GitLab API Error")
      );
      await makeFileContentModified(testGitlabFileId);
      mockRemoteContent(await setOlderRemoteBaseline(testGitlabFileId));

      const result = await exportToGitlab(
        testProjectId,
        testUserId,
        testBranch,
        "Test export"
      );

      expect(result).toMatchObject({
        projectId: testProjectId,
        operation: "EXPORT",
        status: "FAILED",
        errorMessage:
          "Export failed. Check your GitLab connection, branch name, and permissions, then try again.",
      });

      // Failure preserves pending baselines untouched
      const [file] = await db
        .select()
        .from(projectFiles)
        .where(eq(projectFiles.id, testGitlabFileId));
      expect(file?.lastPushedContentHash).toBe("stale-pushed-baseline");
    });

    it("skips identical generated files after a push and still exports later changes", async () => {
      await db
        .insert(variables)
        .values({ projectId: testProjectId, key: "has_key" });
      await db
        .insert(stats)
        .values({ projectId: testProjectId, key: "trust", name: "Trust" });
      await db.insert(characters).values(testCharacter);
      await makeFileContentModified(testGitlabFileId);
      await db
        .update(projectFiles)
        .set({ remoteRevision: "script-revision" })
        .where(eq(projectFiles.id, testGitlabFileId));
      const remoteFiles = new Map<string, string>([
        [testGitlabFile.filePath, testGitlabFile.content],
      ]);
      vi.spyOn(
        gitlabRepoService,
        "getFileContentWithMetadata"
      ).mockImplementation(async (_projectId, _userId, filePath) => ({
        content: remoteFiles.get(filePath) ?? null,
        lastCommitId: "remote-rev-1",
        contentSha256: null,
        blobId: null,
      }));
      const commitSpy = vi
        .spyOn(gitlabFileService, "batchCommitFiles")
        .mockImplementation(
          async (_projectId, _userId, _branch, _message, actions) => {
            for (const action of actions) {
              if (action.content !== undefined)
                remoteFiles.set(action.filePath, action.content);
            }
            return "generated-commit";
          }
        );
      const first = await exportToGitlab(testProjectId, testUserId, testBranch);
      expect(first.status).toBe("COMPLETED");
      expect(first.noChanges).not.toBe(true);
      expect(commitSpy.mock.calls[0][4]).toHaveLength(3);
      expect(
        commitSpy.mock.calls[0][4].every((action) => action.action === "create")
      ).toBe(true);

      const [scriptFile] = await db
        .select()
        .from(projectFiles)
        .where(eq(projectFiles.id, testGitlabFileId));
      expect(scriptFile.lastPushedContentHash).toBe(testGitlabFile.contentHash);
      expect(scriptFile.remoteRevision).toBe("script-revision");

      const second = await exportToGitlab(
        testProjectId,
        testUserId,
        testBranch
      );
      expect(second).toMatchObject({ status: "COMPLETED", noChanges: true });
      expect(commitSpy).toHaveBeenCalledTimes(1);

      await db
        .update(variables)
        .set({ key: "has_map" })
        .where(eq(variables.projectId, testProjectId));
      const third = await exportToGitlab(testProjectId, testUserId, testBranch);
      expect(third.status).toBe("COMPLETED");
      expect(commitSpy).toHaveBeenCalledTimes(2);
      expect(commitSpy.mock.calls[1][4]).toEqual([
        expect.objectContaining({
          action: "update",
          filePath: "game/branchforge_variables.rpy",
        }),
      ]);
    });

    it("advances a no-op local baseline without overwriting the remote revision", async () => {
      const localContent = `default has_key = False\n${testGitlabFile.content}`;
      const exportedContent =
        extractAndStripRpySymbols(localContent).cleanedContent;
      await db
        .update(projectFiles)
        .set({
          content: localContent,
          contentHash: calculateContentHash(localContent),
          lastPushedContentHash: "stale-baseline",
          remoteContent: exportedContent,
          remoteContentHash: calculateContentHash(exportedContent),
          remoteRevision: "existing-revision",
        })
        .where(eq(projectFiles.id, testGitlabFileId));
      mockRemoteContent(exportedContent);
      const commitSpy = vi.spyOn(gitlabFileService, "batchCommitFiles");
      const result = await exportToGitlab(
        testProjectId,
        testUserId,
        testBranch
      );
      expect(result).toMatchObject({ status: "COMPLETED", noChanges: true });
      expect(commitSpy).not.toHaveBeenCalled();
      const [file] = await db
        .select()
        .from(projectFiles)
        .where(eq(projectFiles.id, testGitlabFileId));
      expect(file.lastPushedContentHash).toBe(
        calculateContentHash(localContent)
      );
      expect(file.remoteRevision).toBe("existing-revision");
      expect(file.remoteContent).toBe(exportedContent);
    });

    it("does not create a new branch for an identical export", async () => {
      vi.spyOn(gitlabRepoService, "getBranchCommitSha").mockImplementation(
        async (_projectId, _userId, branch) => {
          if (branch === "feature/no-changes")
            throw new NotFoundError("Branch");
          return "base-sha";
        }
      );
      vi.spyOn(gitlabRepoService, "getRepositoryLink").mockResolvedValue({
        id: 1,
        projectId: testProjectId,
        gitlabProjectId: 42,
        repositoryName: "test/repo",
        defaultBranch: "main",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);
      await makeFileContentModified(testGitlabFileId);
      mockRemoteContent(testGitlabFile.content);
      const commitSpy = vi.spyOn(gitlabFileService, "batchCommitFiles");
      const result = await exportToGitlab(
        testProjectId,
        testUserId,
        "feature/no-changes"
      );
      expect(result).toMatchObject({ status: "COMPLETED", noChanges: true });
      expect(commitSpy).not.toHaveBeenCalled();
      const [file] = await db
        .select()
        .from(projectFiles)
        .where(eq(projectFiles.id, testGitlabFileId));
      expect(file.remoteBranch).toBe("main");
    });

    it("rejects remote drift even when desired content already matches GitLab", async () => {
      await makeFileContentModified(testGitlabFileId);
      await setOlderRemoteBaseline(testGitlabFileId);
      mockRemoteContent(testGitlabFile.content);
      const commitSpy = vi.spyOn(gitlabFileService, "batchCommitFiles");
      const result = await exportToGitlab(
        testProjectId,
        testUserId,
        testBranch
      );
      expect(result.status).toBe("FAILED");
      expect(result.errorMessage).toContain("remote file changed");
      expect(commitSpy).not.toHaveBeenCalled();
    });

    it("creates generated files when absent and updates them after export", async () => {
      await db.insert(variables).values({
        id: testUuid("76000000", 1),
        projectId: testProjectId,
        key: "met_sylvie",
        description: "Met Sylvie",
        category: "story",
      });
      await makeFileContentModified(testGitlabFileId);

      let generatedFileExists = false;
      vi.spyOn(
        gitlabRepoService,
        "getFileContentWithMetadata"
      ).mockImplementation(async (_projectId, _userId, filePath) => ({
        content:
          filePath === "game/branchforge_variables.rpy" && !generatedFileExists
            ? null
            : testGitlabFile.content,
        lastCommitId: "remote-rev-1",
        contentSha256: null,
        blobId: null,
      }));
      const batchCommitFilesSpy = vi
        .spyOn(gitlabFileService, "batchCommitFiles")
        .mockResolvedValue("commit-generated");

      await exportToGitlab(
        testProjectId,
        testUserId,
        testBranch,
        "First generated export"
      );
      expect(batchCommitFilesSpy.mock.calls[0]?.[4]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "create",
            filePath: "game/branchforge_variables.rpy",
          }),
        ])
      );

      generatedFileExists = true;
      await makeFileContentModified(testGitlabFileId);
      await exportToGitlab(
        testProjectId,
        testUserId,
        testBranch,
        "Repeat generated export"
      );
      expect(batchCommitFilesSpy.mock.calls[1]?.[4]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "update",
            filePath: "game/branchforge_variables.rpy",
          }),
        ])
      );
    });

    it("should generate default commit message when not provided", async () => {
      vi.spyOn(gitlabFileService, "batchCommitFiles").mockResolvedValue(
        "commit125"
      );
      await makeFileContentModified(testGitlabFileId);
      mockRemoteContent(await setOlderRemoteBaseline(testGitlabFileId));

      await exportToGitlab(testProjectId, testUserId, testBranch);

      expect(gitlabFileService.batchCommitFiles).toHaveBeenCalled();
      const calls = (gitlabFileService.batchCommitFiles as any).mock.calls;
      // batchCommitFiles(projectId, userId, branch, commitMessage, actions)
      // The commit message is at index 3
      expect(calls.length).toBeGreaterThan(0);
      const commitMessage = calls[0][3];
      expect(commitMessage).toMatch(/Export from BranchForge -/);
    });

    it("should export multiple files", async () => {
      // Create additional gitlab files
      const testGitlabFile2 = createProjectFileFixture({
        filePath: "game/chapter1.rpy",
        content: 'label chapter1:\n    "Content"\n    return',
      });
      await db.insert(projectFiles).values(testGitlabFile2);

      const batchCommitFilesSpy = vi
        .spyOn(gitlabFileService, "batchCommitFiles")
        .mockResolvedValue("commit126");
      await makeFileContentModified(testGitlabFileId);
      await makeFileContentModified(testGitlabFile2.id);
      mockRemoteContent(await setOlderRemoteBaseline(testGitlabFileId));

      const result = await exportToGitlab(
        testProjectId,
        testUserId,
        testBranch,
        "Test export"
      );

      expect(result.status).toBe("COMPLETED");
      expect(batchCommitFilesSpy).toHaveBeenCalledTimes(1);
      const callArgs = batchCommitFilesSpy.mock.calls[0];
      expect(callArgs[4]).toHaveLength(2);

      // Cleanup
      await db
        .delete(projectFiles)
        .where(eq(projectFiles.id, testGitlabFile2.id));
    });

    it("should advance lastSyncedHash baseline after successful export", async () => {
      // Create a label with initial lastSyncedHash different from contentHash
      const initialContentHash = "initial-content-hash";
      const initialLastSyncedHash = "old-baseline-hash";
      const lineContentHash = "line-content-hash";
      const lineLastSyncedHash = "old-line-baseline-hash";

      await db.insert(labelsTable).values({
        ...testScene,
        contentHash: initialContentHash,
        lastSyncedHash: initialLastSyncedHash,
        syncStatus: "MODIFIED_LOCAL",
      });

      // Create label lines with different hashes
      await db.insert(labelLines).values({
        id: testUuid("46000000", 1),
        labelId: testScene.id,
        sequence: 1,
        contentType: "NARRATION" as const,
        content: "Test content",
        contentHash: lineContentHash,
        lastSyncedHash: lineLastSyncedHash,
        lastSyncedAt: new Date("2024-01-01"),
        isDirty: true,
        visualType: "GENERATED" as const,
      });

      // Mock the GitLab service
      vi.spyOn(gitlabFileService, "batchCommitFiles").mockResolvedValue(
        "commit127"
      );
      await makeFileContentModified(testGitlabFileId);
      mockRemoteContent(testGitlabFile.content);

      // Perform export
      const result = await exportToGitlab(
        testProjectId,
        testUserId,
        testBranch,
        "Test export"
      );

      expect(result.status).toBe("COMPLETED");

      // Verify label's lastSyncedHash was advanced to contentHash
      const [updatedLabel] = await db
        .select()
        .from(labelsTable)
        .where(eq(labelsTable.id, testScene.id));
      expect(updatedLabel).toBeDefined();
      expect(updatedLabel?.lastSyncedHash).toBe(initialContentHash);
      expect(updatedLabel?.syncStatus).toBe("SYNCED");

      // Verify label_lines' lastSyncedHash was advanced to contentHash
      const [updatedLine] = await db
        .select()
        .from(labelLines)
        .where(eq(labelLines.labelId, testScene.id));
      expect(updatedLine).toBeDefined();
      expect(updatedLine?.lastSyncedHash).toBe(lineContentHash);
      expect(updatedLine?.isDirty).toBe(false);
      expect(updatedLine?.lastSyncedAt).toBeDefined();
      expect(updatedLine?.lastSyncedAt?.getTime()).toBeGreaterThan(
        new Date("2024-01-01").getTime()
      );
    });

    it("should skip labels with null contentHash (regression: F11)", async () => {
      // Insert a label with non-null contentHash (control)
      const initialContentHash = "control-content-hash";
      await db.insert(labelsTable).values({
        ...testScene,
        contentHash: initialContentHash,
        lastSyncedHash: "old-baseline",
        syncStatus: "MODIFIED_LOCAL",
      });

      // Insert a second label with null contentHash
      const nullHashLabelId = testUuid("26000000", 2);
      await db.insert(labelsTable).values({
        id: nullHashLabelId,
        projectId: testProjectId,
        title: "null_hash_label",
        labelName: "null_hash_label",
        labelPosition: 1,
        labelNumber: 2,
        sequenceOrder: 1,
        status: "DRAFT" as const,
        conditions: {},
        effects: {},
        projectFileId: testGitlabFileId,
        contentHash: null,
        lastSyncedHash: null,
        syncStatus: "MODIFIED_LOCAL",
        route: "COMMON" as const,
      });

      // Insert a label line for the null-hash label
      await db.insert(labelLines).values({
        id: testUuid("46000000", 9),
        labelId: nullHashLabelId,
        sequence: 1,
        contentType: "NARRATION" as const,
        content: "Null hash line content",
        contentHash: "null-hash-line-ch",
        lastSyncedHash: null,
        isDirty: true,
        visualType: "GENERATED" as const,
      });

      // Mock the GitLab service
      vi.spyOn(gitlabFileService, "batchCommitFiles").mockResolvedValue(
        "commit128"
      );
      await makeFileContentModified(testGitlabFileId);
      mockRemoteContent(testGitlabFile.content);

      const result = await exportToGitlab(
        testProjectId,
        testUserId,
        testBranch,
        "Test export"
      );

      try {
        expect(result.status).toBe("COMPLETED");

        // Verify: null-hash label was NOT synced
        const [nullHashLabel] = await db
          .select()
          .from(labelsTable)
          .where(eq(labelsTable.id, nullHashLabelId));
        expect(nullHashLabel).toBeDefined();
        expect(nullHashLabel?.lastSyncedHash).toBeNull();
        expect(nullHashLabel?.syncStatus).toBe("MODIFIED_LOCAL");

        // Verify: null-hash label's line baseline was NOT cleared
        const [nullHashLine] = await db
          .select()
          .from(labelLines)
          .where(eq(labelLines.labelId, nullHashLabelId));
        expect(nullHashLine).toBeDefined();
        expect(nullHashLine?.lastSyncedHash).toBeNull();
        expect(nullHashLine?.isDirty).toBe(true);

        // Verify: control label with non-null contentHash WAS synced
        const [controlLabel] = await db
          .select()
          .from(labelsTable)
          .where(eq(labelsTable.id, testScene.id));
        expect(controlLabel).toBeDefined();
        expect(controlLabel?.lastSyncedHash).toBe(initialContentHash);
        expect(controlLabel?.syncStatus).toBe("SYNCED");
      } finally {
        // Cleanup the additional data — always runs, even on assertion failures
        await db
          .delete(labelLines)
          .where(eq(labelLines.labelId, nullHashLabelId));
        await db.delete(labelsTable).where(eq(labelsTable.id, nullHashLabelId));
      }
    });

    it("keeps a restored protected source verbatim and clears a stale generated quick_menu declaration", async () => {
      const raw =
        'default quick_menu = True\n\nscreen quick_menu():\n    text "Menu"\n';
      await db.delete(variables).where(eq(variables.projectId, testProjectId));
      await db
        .update(projectFiles)
        .set({
          filePath: "game/gui.rpy",
          fileType: "STORY",
          content: raw,
          contentHash: calculateContentHash(raw),
          originalContent: raw,
          lastPushedContentHash: calculateContentHash(raw),
          remoteFilePath: "game/gui.rpy",
          remoteContent: raw,
          remoteContentHash: calculateContentHash(raw),
        })
        .where(eq(projectFiles.id, testGitlabFileId));
      // Stale DB row left behind by an earlier import of the generated
      // file or a previous parser version.
      await db.insert(variables).values({
        id: testUuid("76000000", 42),
        projectId: testProjectId,
        key: "quick_menu",
      });

      vi.spyOn(
        gitlabRepoService,
        "getFileContentWithMetadata"
      ).mockImplementation(async (_p, _u, filePath) => ({
        content:
          filePath === "game/branchforge_variables.rpy"
            ? "default quick_menu = False\n"
            : filePath === "game/gui.rpy"
              ? raw
              : null,
        lastCommitId: "remote-rev-stale",
        contentSha256: null,
        blobId: null,
      }));
      const commitSpy = vi
        .spyOn(gitlabFileService, "batchCommitFiles")
        .mockResolvedValue("commit-stale-generated");

      const result = await exportToGitlab(
        testProjectId,
        testUserId,
        testBranch,
        "Stale generated push"
      );

      expect(result.status, result.errorMessage ?? undefined).toBe("COMPLETED");

      const actions = commitSpy.mock.calls[0]?.[4] as Array<{
        action: string;
        filePath: string;
        content?: string;
      }>;
      // The protected file itself stays untouched on the remote.
      expect(
        actions.find((a) => a.filePath === "game/gui.rpy")
      ).toBeUndefined();

      // The stale generated copy is overwritten WITHOUT the source-owned
      // declaration, so no duplicate quick_menu remains on the remote.
      const generatedUpdate = actions.find(
        (a) => a.filePath === "game/branchforge_variables.rpy"
      );
      expect(generatedUpdate).toBeDefined();
      expect(generatedUpdate?.action).toBe("update");
      expect(generatedUpdate?.content).not.toContain("quick_menu");

      // Row data remains untouched — no DB deletion of source values.
      const [staleRow] = await db
        .select()
        .from(variables)
        .where(
          and(
            eq(variables.projectId, testProjectId),
            eq(variables.key, "quick_menu")
          )
        );
      expect(staleRow).toBeDefined();
    });

    it("exports the default-policy unknown-speaker character without a source declaration", async () => {
      // User fixture: a DB row `u` / `???` / `#E4E4E4` with no source
      // declaration must render in branchforge_definitions.rpy now that
      // the automatic exclusions are exactly `narrator` and `extend`.
      await db.insert(characters).values({
        projectId: testProjectId,
        renpyTag: "u",
        name: "???",
        displayName: "???",
        nameType: "unknown",
        color: "#E4E4E4",
      });
      await db.insert(characters).values({
        projectId: testProjectId,
        renpyTag: "n",
        name: "N",
        displayName: "N",
        nameType: "literal",
        color: "#cfcfcf",
      });
      const commitSpy = vi
        .spyOn(gitlabFileService, "batchCommitFiles")
        .mockResolvedValue("commit-u");
      mockRemoteContent(null);

      const result = await exportToGitlab(
        testProjectId,
        testUserId,
        testBranch
      );
      expect(result.status, result.errorMessage ?? undefined).toBe("COMPLETED");

      const actions = commitSpy.mock.calls[0]?.[4] as Array<{
        action: string;
        filePath: string;
        content?: string;
      }>;
      const definitions = actions.find(
        (a) => a.filePath === "game/branchforge_definitions.rpy"
      );
      expect(definitions).toBeDefined();
      expect(definitions?.content).toContain(
        'define u = Character("???", color="#E4E4E4")'
      );
      expect(definitions?.content).toContain(
        'define n = Character("N", color="#cfcfcf")'
      );
      for (const tag of ["u", "n"]) {
        const declarations = actions.flatMap(
          (action) =>
            (action.content ?? "").match(
              new RegExp(`^define ${tag} = Character`, "gm")
            ) ?? []
        );
        expect(declarations).toHaveLength(1);
      }
    });

    it("fails the export with an actionable conflict when an explicitly excluded character has no source declaration", async () => {
      // Legacy project: stored explicit exclusions still contain `u`,
      // and a DB row exists without any source declaration. The export
      // must conflict before any remote write instead of silently
      // dropping the row.
      await db.insert(projectSettings).values({
        projectId: testProjectId,
        excludedCharacterTags: ["narrator", "u"],
      });
      await db.insert(characters).values({
        projectId: testProjectId,
        renpyTag: "u",
        name: "???",
        displayName: "???",
        nameType: "unknown",
        color: "#E4E4E4",
        sourceDefinition: {
          declaration: 'define u = Character("???", color="#E4E4E4")',
          name: "???",
          nameType: "unknown",
          color: "#E4E4E4",
        },
      });
      const commitSpy = vi
        .spyOn(gitlabFileService, "batchCommitFiles")
        .mockResolvedValue("commit-conflict");
      mockRemoteContent(null);

      const result = await exportToGitlab(
        testProjectId,
        testUserId,
        testBranch
      );
      expect(result.status).toBe("FAILED");
      expect(result.errorMessage).toContain(
        "Some excluded characters have no source declaration"
      );
      expect(result.errorMessage).toContain("excluded character tags");
      expect(commitSpy).not.toHaveBeenCalled();
    });

    it("exports an explicitly excluded character whose declaration is preserved in source", async () => {
      const sourceWithU =
        'define u = Character("???", color="#E4E4E4")\n' +
        testGitlabFile.content;
      await db
        .update(projectFiles)
        .set({
          content: sourceWithU,
          contentHash: calculateContentHash(sourceWithU),
        })
        .where(eq(projectFiles.id, testGitlabFileId));
      await db.insert(projectSettings).values({
        projectId: testProjectId,
        excludedCharacterTags: ["narrator", "u"],
      });
      await db.insert(characters).values({
        projectId: testProjectId,
        renpyTag: "u",
        name: "???",
        displayName: "???",
        nameType: "unknown",
        color: "#E4E4E4",
      });
      const commitSpy = vi
        .spyOn(gitlabFileService, "batchCommitFiles")
        .mockResolvedValue("commit-preserved");
      mockRemoteContent(sourceWithU);

      const result = await exportToGitlab(
        testProjectId,
        testUserId,
        testBranch
      );
      expect(result.status, result.errorMessage ?? undefined).toBe("COMPLETED");

      // The excluded declaration stays source-owned: no generated
      // definition for `u` may be pushed.
      const actions = commitSpy.mock.calls[0]?.[4] as Array<{
        action: string;
        filePath: string;
        content?: string;
      }>;
      for (const action of actions) {
        if (action.filePath.endsWith("branchforge_definitions.rpy")) {
          expect(action.content ?? "").not.toContain("define u = Character");
        }
      }
      // The user file is not rewritten without its declaration.
      const userFileAction = actions.find(
        (a) => a.filePath === testGitlabFile.filePath
      );
      if (userFileAction) {
        expect(userFileAction.content).toContain("define u = Character");
      }
    });
  });

  describe("exportToGitlab structural push", () => {
    async function insertPendingOp(
      values: Omit<
        typeof projectFilePendingOperations.$inferInsert,
        "id" | "createdAt" | "updatedAt" | "deletedLabelIds" | "deletedLineIds"
      >
    ) {
      const [op] = await db
        .insert(projectFilePendingOperations)
        .values(values)
        .returning();
      return op!;
    }

    afterEach(async () => {
      await db
        .delete(projectFilePendingOperations)
        .where(eq(projectFilePendingOperations.projectId, testProjectId));
    });

    it("pushes explicit create/move/delete actions in ONE commit including casing-only two-step moves on a non-default branch", async () => {
      const createdFile = createProjectFileFixture({
        filePath: "game/new.rpy",
        content: 'label new:\n    "New"\n    return',
        contentHash: "hash-new",
      });
      await db.insert(projectFiles).values(createdFile);

      const renamedFile = createProjectFileFixture({
        id: testUuid("56000000", 90),
        filePath: "game/renamed_dst.rpy",
        content: 'label renamed:\n    "Renamed"\n    return',
        contentHash: "hash-renamed",
      });
      await db.insert(projectFiles).values(renamedFile);

      const casingFile = createProjectFileFixture({
        id: testUuid("56000000", 91),
        filePath: "game/Cased.rpy",
        content: "label cased:\n    return",
        contentHash: "hash-cased",
      });
      await db.insert(projectFiles).values(casingFile);

      const tombstonedFile = {
        ...createProjectFileFixture({
          id: testUuid("56000000", 92),
          filePath: "game/old.rpy",
          content: "label old:\n    return",
          contentHash: "hash-old",
        }),
        deletedAt: new Date(),
      };
      await db.insert(projectFiles).values(tombstonedFile);

      await insertPendingOp({
        projectId: testProjectId,
        projectFileId: createdFile.id,
        operation: "CREATE",
        remoteBasePath: "game/new.rpy",
        localPath: "game/new.rpy",
      });
      await insertPendingOp({
        projectId: testProjectId,
        projectFileId: renamedFile.id,
        operation: "RENAME",
        remoteBasePath: "game/renamed_src.rpy",
        localPath: "game/renamed_dst.rpy",
      });
      await insertPendingOp({
        projectId: testProjectId,
        projectFileId: casingFile.id,
        operation: "RENAME",
        remoteBasePath: "game/cased.rpy",
        localPath: "game/Cased.rpy",
      });
      await insertPendingOp({
        projectId: testProjectId,
        projectFileId: tombstonedFile.id,
        operation: "DELETE",
        remoteBasePath: "game/old.rpy",
        localPath: "game/old.rpy",
      });

      const batchSpy = vi
        .spyOn(gitlabFileService, "batchCommitFiles")
        .mockResolvedValue("commit-xyz");

      // Preflight: existing sources exist remotely with no stored baseline
      // (legacy rows), create destination does not exist yet.
      vi.spyOn(
        gitlabRepoService,
        "getFileContentWithMetadata"
      ).mockImplementation(async (_p, _u, filePath) => {
        if (filePath === "game/new.rpy") {
          return {
            content: null,
            lastCommitId: null,
            contentSha256: null,
            blobId: null,
          };
        }
        if (
          filePath === "game/renamed_src.rpy" ||
          filePath === "game/cased.rpy" ||
          filePath === "game/old.rpy"
        ) {
          return {
            content: "remote-content",
            lastCommitId: "remote-rev",
            contentSha256: null,
            blobId: null,
          };
        }
        return {
          content: null,
          lastCommitId: null,
          contentSha256: null,
          blobId: null,
        };
      });

      const result = await exportToGitlab(
        testProjectId,
        testUserId,
        "feature/non-default",
        "Structural push"
      );

      expect(result.status).toBe("COMPLETED");
      expect(result.commitId).toBe("commit-xyz");

      expect(batchSpy).toHaveBeenCalledTimes(1);
      const actions = batchSpy.mock.calls[0]![4]!;
      const byPath = new Map(
        actions.map(
          (a: { action: string; filePath: string; previousPath?: string }) => [
            `${a.action}:${a.filePath}`,
            a,
          ]
        )
      );

      // Explicit create for the pending CREATE
      expect(byPath.get("create:game/new.rpy")).toMatchObject({
        action: "create",
        filePath: "game/new.rpy",
      });

      // Move with content change for the pending RENAME
      expect(byPath.get("move:game/renamed_dst.rpy")).toMatchObject({
        action: "move",
        previousPath: "game/renamed_src.rpy",
        filePath: "game/renamed_dst.rpy",
      });

      // Casing-only rename: deterministic temporary two-step move
      expect(
        byPath.get("move:game/Cased.rpy.branchforge-casing-move-tmp")
      ).toBeDefined();
      expect(byPath.get("move:game/Cased.rpy")).toMatchObject({
        action: "move",
        previousPath: "game/Cased.rpy.branchforge-casing-move-tmp",
        filePath: "game/Cased.rpy",
      });

      // Delete for the tombstoned file
      expect(byPath.get("delete:game/old.rpy")).toMatchObject({
        action: "delete",
        filePath: "game/old.rpy",
      });

      // Finalization: tombstone permanently removed, baselines advanced
      const [tombstone] = await db
        .select()
        .from(projectFiles)
        .where(eq(projectFiles.id, tombstonedFile.id));
      expect(tombstone).toBeUndefined();

      const [renamedRow] = await db
        .select()
        .from(projectFiles)
        .where(eq(projectFiles.id, renamedFile.id));
      expect(renamedRow?.lastPushedContentHash).toBe("hash-renamed");

      const pendingRows = await db
        .select()
        .from(projectFilePendingOperations)
        .where(eq(projectFilePendingOperations.projectId, testProjectId));
      expect(pendingRows).toHaveLength(0);
    });

    it("fails and preserves pending rows/baselines on remote content drift", async () => {
      const renamedFile = createProjectFileFixture({
        id: testUuid("56000000", 93),
        filePath: "game/drift_dst.rpy",
        content: "label drift:\n    return",
        contentHash: "hash-drift",
      });
      await db.insert(projectFiles).values(renamedFile);
      // The per-file remote baseline still points at the ORIGINAL remote
      // path until the rename is pushed.
      await db
        .update(projectFiles)
        .set({
          remoteContentHash: "stored-remote-hash",
          remoteFilePath: "game/drift_src.rpy",
        })
        .where(eq(projectFiles.id, renamedFile.id));
      await insertPendingOp({
        projectId: testProjectId,
        projectFileId: renamedFile.id,
        operation: "RENAME",
        remoteBasePath: "game/drift_src.rpy",
        localPath: "game/drift_dst.rpy",
      });

      vi.spyOn(gitlabRepoService, "getRepositoryLink").mockResolvedValue({
        id: 1,
        projectId: testProjectId,
        gitlabProjectId: 42,
        repositoryName: "test/repo",
        defaultBranch: "main",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);
      vi.spyOn(
        gitlabRepoService,
        "getFileContentWithMetadata"
      ).mockResolvedValue({
        content: "changed on the remote!",
        lastCommitId: "remote-rev-2",
        contentSha256: null,
        blobId: null,
      });

      const result = await exportToGitlab(
        testProjectId,
        testUserId,
        testBranch,
        "Drift push"
      );

      expect(result.status).toBe("FAILED");
      expect(result.errorMessage).toMatch(/remote file changed/);

      // Pending row and stored baseline preserved untouched
      const pendingRows = await db
        .select()
        .from(projectFilePendingOperations)
        .where(eq(projectFilePendingOperations.projectId, testProjectId));
      expect(pendingRows).toHaveLength(1);
      const [fileRow] = await db
        .select()
        .from(projectFiles)
        .where(eq(projectFiles.id, renamedFile.id));
      expect(fileRow?.remoteContentHash).toBe("stored-remote-hash");
    });

    it("treats an expected source 404 as a conflict", async () => {
      const renamedFile = createProjectFileFixture({
        id: testUuid("56000000", 94),
        filePath: "game/missing_dst.rpy",
        content: "label missing:\n    return",
        contentHash: "hash-missing",
      });
      await db.insert(projectFiles).values(renamedFile);
      await insertPendingOp({
        projectId: testProjectId,
        projectFileId: renamedFile.id,
        operation: "RENAME",
        remoteBasePath: "game/missing_src.rpy",
        localPath: "game/missing_dst.rpy",
      });

      vi.spyOn(gitlabRepoService, "getRepositoryLink").mockResolvedValue({
        id: 1,
        projectId: testProjectId,
        gitlabProjectId: 42,
        repositoryName: "test/repo",
        defaultBranch: "main",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);
      vi.spyOn(
        gitlabRepoService,
        "getFileContentWithMetadata"
      ).mockResolvedValue({
        content: null,
        lastCommitId: null,
        contentSha256: null,
        blobId: null,
      });

      const result = await exportToGitlab(
        testProjectId,
        testUserId,
        testBranch,
        "Missing push"
      );

      expect(result.status).toBe("FAILED");
      expect(result.errorMessage).toMatch(/expected source file not found/);

      const pendingRows = await db
        .select()
        .from(projectFilePendingOperations)
        .where(eq(projectFilePendingOperations.projectId, testProjectId));
      expect(pendingRows).toHaveLength(1);
    });

    it("reconciles an ambiguous attempt as success only when the full action set is observed remotely", async () => {
      const renamedFile = createProjectFileFixture({
        id: testUuid("56000000", 95),
        filePath: "game/reconciled_dst.rpy",
        content: "label reconciled:\n    return",
        contentHash: "hash-reconciled",
      });
      await db.insert(projectFiles).values(renamedFile);
      await insertPendingOp({
        projectId: testProjectId,
        projectFileId: renamedFile.id,
        operation: "RENAME",
        remoteBasePath: "game/reconciled_src.rpy",
        localPath: "game/reconciled_dst.rpy",
        attemptBranch: testBranch,
        attemptStartedAt: new Date(),
        lastAttemptCommitId: "commit-ambiguous",
      });

      // Remote shows the post-state: destination exists with pushed content,
      // source path gone.
      vi.spyOn(gitlabRepoService, "getRepositoryLink").mockResolvedValue({
        id: 1,
        projectId: testProjectId,
        gitlabProjectId: 42,
        repositoryName: "test/repo",
        defaultBranch: "main",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);
      vi.spyOn(gitlabRepoService, "_listFilesWithAuth").mockResolvedValue([
        { name: "reconciled_dst.rpy", path: "game/reconciled_dst.rpy" },
      ]);
      vi.spyOn(gitlabIntegrationService, "getDecryptedToken").mockResolvedValue(
        "test-token"
      );
      vi.spyOn(
        gitlabRepoService,
        "getFileContentWithMetadata"
      ).mockResolvedValue({
        content: "label reconciled:\n    return",
        lastCommitId: "commit-ambiguous",
        contentSha256: null,
        blobId: null,
      });

      const result = await exportToGitlab(
        testProjectId,
        testUserId,
        testBranch,
        "Reconciliation push"
      );

      expect(result.status).toBe("COMPLETED");

      const pendingRows = await db
        .select()
        .from(projectFilePendingOperations)
        .where(eq(projectFilePendingOperations.projectId, testProjectId));
      expect(pendingRows).toHaveLength(0);

      const [fileRow] = await db
        .select()
        .from(projectFiles)
        .where(eq(projectFiles.id, renamedFile.id));
      expect(fileRow?.lastPushedContentHash).toBe("hash-reconciled");
      expect(fileRow?.remoteFilePath).toBe("game/reconciled_dst.rpy");
    });

    it("deletes only planned pending ops and preserves concurrent ops (H2)", async () => {
      const createdFile = createProjectFileFixture({
        id: testUuid("56000000", 96),
        filePath: "game/planned_create.rpy",
        content: 'label planned:\n    "New"\n    return',
        contentHash: "hash-planned",
      });
      await db.insert(projectFiles).values(createdFile);

      const concurrentFile = createProjectFileFixture({
        id: testUuid("56000000", 97),
        filePath: "game/concurrent_create.rpy",
        content: 'label concurrent:\n    "Later"\n    return',
        contentHash: "hash-concurrent",
      });
      await db.insert(projectFiles).values(concurrentFile);

      const plannedOp = await insertPendingOp({
        projectId: testProjectId,
        projectFileId: createdFile.id,
        operation: "CREATE",
        remoteBasePath: "game/planned_create.rpy",
        localPath: "game/planned_create.rpy",
      });

      let concurrentOpId: string | null = null;
      vi.spyOn(gitlabFileService, "batchCommitFiles").mockImplementation(
        async () => {
          const concurrentOp = await insertPendingOp({
            projectId: testProjectId,
            projectFileId: concurrentFile.id,
            operation: "CREATE",
            remoteBasePath: "game/concurrent_create.rpy",
            localPath: "game/concurrent_create.rpy",
          });
          concurrentOpId = concurrentOp.id;
          return "commit-h2-scoped";
        }
      );

      vi.spyOn(
        gitlabRepoService,
        "getFileContentWithMetadata"
      ).mockResolvedValue({
        content: null,
        lastCommitId: null,
        contentSha256: null,
        blobId: null,
      });

      const result = await exportToGitlab(
        testProjectId,
        testUserId,
        testBranch,
        "Scoped finalize"
      );

      expect(result.status).toBe("COMPLETED");
      expect(concurrentOpId).not.toBeNull();

      const pendingRows = await db
        .select()
        .from(projectFilePendingOperations)
        .where(eq(projectFilePendingOperations.projectId, testProjectId));
      expect(pendingRows).toHaveLength(1);
      expect(pendingRows[0]?.id).toBe(concurrentOpId);
      expect(pendingRows[0]?.id).not.toBe(plannedOp.id);
      expect(pendingRows[0]?.attemptStartedAt).toBeNull();
    });

    it("marks attempt metadata only on planned pending ops (H2)", async () => {
      const plannedFile = createProjectFileFixture({
        id: testUuid("56000000", 98),
        filePath: "game/mark_planned.rpy",
        content: "label planned:\n    return",
        contentHash: "hash-mark-planned",
      });
      await db.insert(projectFiles).values(plannedFile);

      const skippedFile = {
        ...createProjectFileFixture({
          id: testUuid("56000000", 99),
          filePath: "game/mark_skipped.rpy",
          content: "label skipped:\n    return",
          contentHash: "hash-mark-skipped",
        }),
        // Not tombstoned: DELETE op is skipped by the planner.
        deletedAt: null,
      };
      await db.insert(projectFiles).values(skippedFile);

      const plannedOp = await insertPendingOp({
        projectId: testProjectId,
        projectFileId: plannedFile.id,
        operation: "CREATE",
        remoteBasePath: "game/mark_planned.rpy",
        localPath: "game/mark_planned.rpy",
      });
      const skippedOp = await insertPendingOp({
        projectId: testProjectId,
        projectFileId: skippedFile.id,
        operation: "DELETE",
        remoteBasePath: "game/mark_skipped.rpy",
        localPath: "game/mark_skipped.rpy",
      });

      vi.spyOn(gitlabFileService, "batchCommitFiles").mockImplementation(
        async () => {
          const [plannedRow] = await db
            .select()
            .from(projectFilePendingOperations)
            .where(eq(projectFilePendingOperations.id, plannedOp.id));
          const [skippedRow] = await db
            .select()
            .from(projectFilePendingOperations)
            .where(eq(projectFilePendingOperations.id, skippedOp.id));
          expect(plannedRow?.attemptStartedAt).not.toBeNull();
          expect(plannedRow?.attemptBranch).toBe(testBranch);
          expect(skippedRow?.attemptStartedAt).toBeNull();
          return "commit-h2-mark";
        }
      );
      vi.spyOn(
        gitlabRepoService,
        "getFileContentWithMetadata"
      ).mockResolvedValue({
        content: null,
        lastCommitId: null,
        contentSha256: null,
        blobId: null,
      });

      const result = await exportToGitlab(
        testProjectId,
        testUserId,
        testBranch,
        "Mark planned only"
      );

      expect(result.status).toBe("COMPLETED");

      const pendingRows = await db
        .select()
        .from(projectFilePendingOperations)
        .where(eq(projectFilePendingOperations.projectId, testProjectId));
      expect(pendingRows).toHaveLength(1);
      expect(pendingRows[0]?.id).toBe(skippedOp.id);
    });
  });

  describe("importFromGitlab", () => {
    function mockCharacterPull(content: string) {
      vi.spyOn(gitlabRepoService, "listRpyFiles").mockResolvedValue([
        { name: "script.rpy", path: "game/script.rpy" },
      ]);
      vi.spyOn(
        gitlabRepoService,
        "getFileContentWithMetadata"
      ).mockResolvedValue({
        content,
        lastCommitId: "character-review-rev",
        contentSha256: null,
        blobId: null,
      });
      vi.spyOn(rpyParserService, "parseRPYFileWithLabels").mockReturnValue({
        labels: [],
        characters: [],
        fileType: "SETTINGS",
      });
    }

    it("preserves narrator styling and reviews styling-only accepted GitLab pulls", async () => {
      const narrator =
        'define narrator = Character(None, what_color="#cfcfcf", what_italic=True)';
      const raw =
        narrator +
        '\ndefine hero = Character("Hero", who_color="#ABC", what_italic=False, what_font="old.ttf")\n';
      mockCharacterPull(raw);
      const first = await importFromGitlab(
        testProjectId,
        testUserId,
        testBranch,
        "gitlab_wins"
      );
      expect(first.status, first.errorMessage ?? undefined).toBe("COMPLETED");
      const [file] = await db
        .select()
        .from(projectFiles)
        .where(eq(projectFiles.id, testGitlabFileId));
      expect(file.content).toContain(narrator);
      const [character] = await db
        .select()
        .from(characters)
        .where(eq(characters.projectId, testProjectId));
      expect(character.renpyTag).toBe("hero");
      expect(character.sourceDefinition?.declaration).toContain(
        'what_font="old.ttf"'
      );
      mockCharacterPull(raw.replace("old.ttf", "new.ttf"));
      const second = await importFromGitlab(
        testProjectId,
        testUserId,
        testBranch,
        "gitlab_wins"
      );
      expect(second.status, second.errorMessage ?? undefined).toBe("COMPLETED");
      expect(
        second.characterReview?.conflicts.find((entry) => entry.tag === "hero")
          ?.changedFields
      ).toContain("definition");
      const [unchanged] = await db
        .select()
        .from(characters)
        .where(eq(characters.id, character.id));
      expect(unchanged.sourceDefinition?.declaration).toContain(
        'what_font="old.ttf"'
      );
      const detection = await charactersService.detectCharacters(
        testProjectId,
        testUserId
      );
      expect(
        detection.conflicts.find((entry) => entry.tag === "hero")
          ?.detectedDefinition
      ).toContain('what_font="new.ttf"');
    });

    it("reviews auto-promoted discoveries against pre-pull rows and keeps repeated pulls unchanged", async () => {
      const content = 'define boss = Character(boss_name, color="#ABC")\n';
      mockCharacterPull(content);
      const first = await importFromGitlab(
        testProjectId,
        testUserId,
        testBranch,
        "gitlab_wins"
      );
      expect(first.status, first.errorMessage ?? undefined).toBe("COMPLETED");
      expect(first.characterReview).toMatchObject({
        existingTags: [],
        conflicts: [],
        characters: [
          expect.objectContaining({ tag: "boss", nameType: "variable" }),
        ],
      });
      const [stored] = await db
        .select()
        .from(characters)
        .where(eq(characters.projectId, testProjectId));
      expect(stored).toMatchObject({
        name: "boss_name",
        nameType: "variable",
        color: "#AABBCC",
      });
      await db
        .update(characters)
        .set({
          displayName: "Custom boss",
          isNarrator: true,
          isLoveInterest: true,
        })
        .where(eq(characters.id, stored.id));
      const repeated = await importFromGitlab(
        testProjectId,
        testUserId,
        testBranch,
        "gitlab_wins"
      );
      expect(repeated.characterReview).toMatchObject({
        existingTags: ["boss"],
        conflicts: [],
      });
      const [preserved] = await db
        .select()
        .from(characters)
        .where(eq(characters.id, stored.id));
      expect(preserved).toMatchObject({
        displayName: "Custom boss",
        isNarrator: true,
        isLoveInterest: true,
      });
    });

    it("shows source differences without applying them during pull", async () => {
      await db
        .insert(characters)
        .values({ ...testCharacter, displayName: "My Sylvie" });
      mockCharacterPull('define s = Character("Changed", color="#FF0000")\n');
      const result = await importFromGitlab(
        testProjectId,
        testUserId,
        testBranch,
        "gitlab_wins"
      );
      expect(result.characterReview?.conflicts).toEqual([
        expect.objectContaining({
          tag: "s",
          changedFields: ["name", "color"],
          existingDisplayName: "My Sylvie",
          detectedName: "Changed",
        }),
      ]);
      const [stored] = await db
        .select()
        .from(characters)
        .where(eq(characters.id, testCharacter.id));
      expect(stored).toMatchObject({
        name: "Sylvie",
        displayName: "My Sylvie",
        isLoveInterest: true,
      });
    });

    it("omits character definitions from a rejected remote file", async () => {
      const local = 'label start:\n    "Local edit"\n';
      await db
        .update(projectFiles)
        .set({
          content: local,
          contentHash: calculateContentHash(local),
          lastPushedContentHash: "older",
          remoteContentHash: "older-remote",
        })
        .where(eq(projectFiles.id, testGitlabFileId));
      mockCharacterPull('define remote_only = Character("Remote")\n');
      const result = await importFromGitlab(
        testProjectId,
        testUserId,
        testBranch,
        "branchforge_wins"
      );
      expect(result.status, result.errorMessage ?? undefined).toBe("COMPLETED");
      expect(result.characterReview).toMatchObject({
        characters: [],
        conflicts: [],
      });
      expect(
        await db
          .select()
          .from(characters)
          .where(eq(characters.projectId, testProjectId))
      ).toEqual([]);
    });

    it.each([
      {
        scenario: "accepted raw remote content",
        conflict: false,
        diverged: false,
        expectedTags: ["detected"],
      },
      {
        scenario: "conflicting remote content",
        conflict: true,
        diverged: false,
        expectedTags: [],
      },
      {
        scenario: "remote content that differs from accepted content",
        conflict: false,
        diverged: true,
        expectedTags: [],
      },
    ])(
      "detects safely from $scenario",
      async ({ conflict, diverged, expectedTags }) => {
        const remote =
          'define detected = Character("Detected")\nlabel start:\n    "Remote dialogue"\n';
        const cleaned = extractAndStripRpySymbols(remote).cleanedContent;
        const accepted = diverged
          ? 'label start:\n    "Local dialogue"\n'
          : cleaned;
        await db
          .update(projectFiles)
          .set({
            content: accepted,
            // Detection must compare actual accepted content, not a stale stored hash.
            contentHash: "stale-hash",
            remoteContent: remote,
            originalContent: 'define historical = Character("Historical")\n',
            hasRemoteConflict: conflict,
          })
          .where(eq(projectFiles.id, testGitlabFileId));
        const result = await charactersService.detectCharacters(
          testProjectId,
          testUserId
        );
        expect(result.characters.map((c) => c.tag)).toEqual(expectedTags);
      }
    );

    it("does not resurrect historical definitions after a cleaned file returns from GitLab", async () => {
      const cleaned = 'label start:\n    "Cleaned"\n';
      const original = 'define old = Character("Old")\n' + cleaned;
      await db
        .update(projectFiles)
        .set({
          content: cleaned,
          contentHash: calculateContentHash(cleaned),
          lastPushedContentHash: calculateContentHash(cleaned),
          originalContent: original,
          remoteContentHash: calculateContentHash(original),
        })
        .where(eq(projectFiles.id, testGitlabFileId));
      mockCharacterPull(cleaned);
      const result = await importFromGitlab(
        testProjectId,
        testUserId,
        testBranch,
        "gitlab_wins"
      );
      expect(result.status, result.errorMessage ?? undefined).toBe("COMPLETED");
      expect(result.characterReview).toMatchObject({
        characters: [],
        conflicts: [],
      });
      const detection = await charactersService.detectCharacters(
        testProjectId,
        testUserId
      );
      expect(detection.characters).toEqual([]);
      const [stored] = await db
        .select()
        .from(projectFiles)
        .where(eq(projectFiles.id, testGitlabFileId));
      expect(stored.originalContent).toBe(original);
    });

    it("should import files from GitLab", async () => {
      // Mock the GitLab service
      vi.spyOn(gitlabRepoService, "getBranchCommitSha").mockResolvedValue(
        "abc123def456"
      );
      vi.spyOn(gitlabRepoService, "listRpyFiles").mockResolvedValue([
        { name: "script.rpy", path: "game/script.rpy" } as any,
      ]);

      vi.spyOn(
        gitlabRepoService,
        "getFileContentWithMetadata"
      ).mockResolvedValue({
        content: 'label start:\n    "Imported content"\n    return',
        lastCommitId: "remote-rev-import-1",
        contentSha256: null,
        blobId: null,
      });

      vi.spyOn(rpyParserService, "parseRPYFileWithLabels").mockReturnValue({
        labels: [
          {
            label: "start",
            lineNumber: 1,
            dialogue: [
              { speaker: null, text: "Imported content", lineNumber: 2 },
            ],
            choices: [],
            jumps: [],
          },
        ],
        characters: [],
        fileType: "STORY",
      });

      const result = await importFromGitlab(
        testProjectId,
        testUserId,
        testBranch,
        "branchforge_wins" as ConflictResolution
      );

      expect(result).toMatchObject({
        projectId: testProjectId,
        operation: "IMPORT",
        status: "COMPLETED",
        branch: testBranch,
        conflictCount: 0,
      });

      // Verify gitlab file was created
      const [gitlabFile] = await db
        .select()
        .from(projectFiles)
        .where(eq(projectFiles.filePath, "game/script.rpy"));
      expect(gitlabFile).toBeDefined();
      expect(gitlabFile?.content).toBe(
        'label start:\n    "Imported content"\n    return'
      );

      // Verify scene was created with linkage
      const [scene] = await db
        .select()
        .from(labelsTable)
        .where(eq(labelsTable.title, "start"));
      expect(scene).toBeDefined();
      expect(scene?.projectFileId).toBe(gitlabFile?.id);
      expect(scene?.labelName).toBe("start");

      // Cleanup
      if (scene) {
        await db.delete(labelLines).where(eq(labelLines.labelId, scene.id));
        await db.delete(labelsTable).where(eq(labelsTable.id, scene.id));
      }
      if (gitlabFile) {
        await db.delete(projectFiles).where(eq(projectFiles.id, gitlabFile.id));
      }
    });

    it("should handle import from empty repository", async () => {
      vi.spyOn(gitlabRepoService, "getBranchCommitSha").mockResolvedValue(
        "abc123def456"
      );
      vi.spyOn(gitlabRepoService, "listRpyFiles").mockResolvedValue([]);

      const result = await importFromGitlab(
        testProjectId,
        testUserId,
        testBranch,
        "branchforge_wins" as ConflictResolution
      );

      expect(result).toMatchObject({
        status: "COMPLETED",
        conflictCount: 0,
      });
    });

    it("should handle gitlab_wins conflict resolution", async () => {
      const localContent = 'label start:\n    "Local unpushed"\n    return';
      const remoteContent =
        'label start:\n    "Updated from GitLab"\n    return';
      await db
        .update(projectFiles)
        .set({
          content: localContent,
          contentHash: calculateContentHash(localContent),
          lastPushedContentHash: "stale-pushed-baseline",
          remoteContentHash: calculateContentHash(
            'label start:\n    "Previous remote"\n    return'
          ),
          originalContent: 'label start:\n    "Previous remote"\n    return',
        })
        .where(eq(projectFiles.id, testGitlabFileId));
      await db.insert(labelsTable).values(testScene);

      vi.spyOn(gitlabRepoService, "getBranchCommitSha").mockResolvedValue(
        "abc123def456"
      );
      vi.spyOn(gitlabRepoService, "listRpyFiles").mockResolvedValue([
        { name: "script.rpy", path: "game/script.rpy" } as any,
      ]);

      vi.spyOn(
        gitlabRepoService,
        "getFileContentWithMetadata"
      ).mockResolvedValue({
        content: remoteContent,
        lastCommitId: "remote-rev-import-2",
        contentSha256: null,
        blobId: null,
      });

      vi.spyOn(rpyParserService, "parseRPYFileWithLabels").mockReturnValue({
        labels: [
          {
            label: "start",
            lineNumber: 1,
            dialogue: [
              { speaker: null, text: "Updated from GitLab", lineNumber: 2 },
            ],
            choices: [],
            jumps: [],
          },
        ],
        characters: [],
        fileType: "STORY",
      });

      const result = await importFromGitlab(
        testProjectId,
        testUserId,
        testBranch,
        "gitlab_wins" as ConflictResolution
      );

      expect(result.status).toBe("COMPLETED");
      expect(result.conflictCount).toBe(0);

      const [file] = await db
        .select()
        .from(projectFiles)
        .where(eq(projectFiles.id, testGitlabFileId));
      expect(file?.content).toBe(remoteContent);
      expect(file?.hasRemoteConflict).toBe(false);
    });

    it("should handle manual_review conflict resolution", async () => {
      const localContent = 'label start:\n    "Local unpushed"\n    return';
      const remoteContent =
        'label start:\n    "Conflicting content"\n    return';
      await db
        .update(projectFiles)
        .set({
          content: localContent,
          contentHash: calculateContentHash(localContent),
          lastPushedContentHash: "stale-pushed-baseline",
          remoteContentHash: calculateContentHash(
            'label start:\n    "Previous remote"\n    return'
          ),
          originalContent: 'label start:\n    "Previous remote"\n    return',
        })
        .where(eq(projectFiles.id, testGitlabFileId));
      await db.insert(labelsTable).values(testScene);

      vi.spyOn(gitlabRepoService, "getBranchCommitSha").mockResolvedValue(
        "abc123def456"
      );
      vi.spyOn(gitlabRepoService, "listRpyFiles").mockResolvedValue([
        { name: "script.rpy", path: "game/script.rpy" } as any,
      ]);

      vi.spyOn(
        gitlabRepoService,
        "getFileContentWithMetadata"
      ).mockResolvedValue({
        content: remoteContent,
        lastCommitId: "remote-rev-import-3",
        contentSha256: null,
        blobId: null,
      });

      vi.spyOn(rpyParserService, "parseRPYFileWithLabels").mockReturnValue({
        labels: [
          {
            label: "start",
            lineNumber: 1,
            dialogue: [
              { speaker: null, text: "Conflicting content", lineNumber: 2 },
            ],
            choices: [],
            jumps: [],
          },
        ],
        characters: [],
        fileType: "STORY",
      });

      const result = await importFromGitlab(
        testProjectId,
        testUserId,
        testBranch,
        "manual_review" as ConflictResolution
      );

      expect(result.status).toBe("COMPLETED");
      expect(result.conflictCount).toBeGreaterThanOrEqual(1);

      const [file] = await db
        .select()
        .from(projectFiles)
        .where(eq(projectFiles.id, testGitlabFileId));
      expect(file?.content).toBe(localContent);
      expect(file?.hasRemoteConflict).toBe(true);
      expect(file?.remoteContentHash).toBe(calculateContentHash(remoteContent));
    });

    it("preserves dirty local content under branchforge_wins (H1)", async () => {
      const localContent = 'label start:\n    "Local unpushed"\n    return';
      const remoteContent = 'label start:\n    "Remote wins text"\n    return';
      await db
        .update(projectFiles)
        .set({
          content: localContent,
          contentHash: calculateContentHash(localContent),
          lastPushedContentHash: "stale-pushed-baseline",
          remoteContentHash: calculateContentHash(
            'label start:\n    "Previous remote"\n    return'
          ),
          originalContent: 'label start:\n    "Previous remote"\n    return',
        })
        .where(eq(projectFiles.id, testGitlabFileId));
      await db.insert(labelsTable).values(testScene);

      vi.spyOn(gitlabRepoService, "getBranchCommitSha").mockResolvedValue(
        "abc123def456"
      );
      vi.spyOn(gitlabRepoService, "listRpyFiles").mockResolvedValue([
        { name: "script.rpy", path: "game/script.rpy" } as any,
      ]);
      vi.spyOn(
        gitlabRepoService,
        "getFileContentWithMetadata"
      ).mockResolvedValue({
        content: remoteContent,
        lastCommitId: "remote-rev-h1",
        contentSha256: null,
        blobId: null,
      });
      vi.spyOn(rpyParserService, "parseRPYFileWithLabels").mockReturnValue({
        labels: [
          {
            label: "start",
            lineNumber: 1,
            dialogue: [
              { speaker: null, text: "Remote wins text", lineNumber: 2 },
            ],
            choices: [],
            jumps: [],
          },
        ],
        characters: [],
        fileType: "STORY",
      });

      const result = await importFromGitlab(
        testProjectId,
        testUserId,
        testBranch,
        "branchforge_wins" as ConflictResolution
      );

      expect(result.status).toBe("COMPLETED");

      const [file] = await db
        .select()
        .from(projectFiles)
        .where(eq(projectFiles.id, testGitlabFileId));
      expect(file?.content).toBe(localContent);
      expect(file?.contentHash).toBe(calculateContentHash(localContent));
      expect(file?.lastPushedContentHash).toBe("stale-pushed-baseline");
      expect(file?.hasRemoteConflict).toBe(true);
      expect(file?.remoteContentHash).toBe(calculateContentHash(remoteContent));
    });

    it("preserves dirty SETTINGS file content under branchforge_wins (H1)", async () => {
      const localContent = 'define config.name = _("Local Game")\n';
      const remoteContent = 'define config.name = _("Remote Game")\n';
      await db
        .update(projectFiles)
        .set({
          fileType: "SETTINGS",
          content: localContent,
          contentHash: calculateContentHash(localContent),
          lastPushedContentHash: "stale-settings-baseline",
          remoteContentHash: calculateContentHash(
            'define config.name = _("Old Game")\n'
          ),
          originalContent: 'define config.name = _("Old Game")\n',
        })
        .where(eq(projectFiles.id, testGitlabFileId));

      vi.spyOn(gitlabRepoService, "getBranchCommitSha").mockResolvedValue(
        "abc123def456"
      );
      vi.spyOn(gitlabRepoService, "listRpyFiles").mockResolvedValue([
        { name: "script.rpy", path: "game/script.rpy" } as any,
      ]);
      vi.spyOn(
        gitlabRepoService,
        "getFileContentWithMetadata"
      ).mockResolvedValue({
        content: remoteContent,
        lastCommitId: "remote-rev-settings",
        contentSha256: null,
        blobId: null,
      });
      vi.spyOn(rpyParserService, "parseRPYFileWithLabels").mockReturnValue({
        labels: [],
        characters: [],
        fileType: "SETTINGS",
      });

      const result = await importFromGitlab(
        testProjectId,
        testUserId,
        testBranch,
        "branchforge_wins" as ConflictResolution
      );

      expect(result.status).toBe("COMPLETED");
      const [file] = await db
        .select()
        .from(projectFiles)
        .where(eq(projectFiles.id, testGitlabFileId));
      expect(file?.content).toBe(localContent);
      expect(file?.lastPushedContentHash).toBe("stale-settings-baseline");
      expect(file?.hasRemoteConflict).toBe(true);
    });

    it("imports remote-only changes under branchforge_wins when local is clean", async () => {
      const localContent = 'label start:\n    "Synced"\n    return';
      const remoteContent =
        'label start:\n    "Remote only change"\n    return';
      const localHash = calculateContentHash(localContent);
      await db
        .update(projectFiles)
        .set({
          content: localContent,
          contentHash: localHash,
          lastPushedContentHash: localHash,
          remoteContentHash: calculateContentHash(localContent),
          originalContent: localContent,
          hasRemoteConflict: false,
        })
        .where(eq(projectFiles.id, testGitlabFileId));

      vi.spyOn(gitlabRepoService, "getBranchCommitSha").mockResolvedValue(
        "abc123def456"
      );
      vi.spyOn(gitlabRepoService, "listRpyFiles").mockResolvedValue([
        { name: "script.rpy", path: "game/script.rpy" } as any,
      ]);
      vi.spyOn(
        gitlabRepoService,
        "getFileContentWithMetadata"
      ).mockResolvedValue({
        content: remoteContent,
        lastCommitId: "remote-rev-clean",
        contentSha256: null,
        blobId: null,
      });
      vi.spyOn(rpyParserService, "parseRPYFileWithLabels").mockReturnValue({
        labels: [
          {
            label: "start",
            lineNumber: 1,
            dialogue: [
              { speaker: null, text: "Remote only change", lineNumber: 2 },
            ],
            choices: [],
            jumps: [],
          },
        ],
        characters: [],
        fileType: "STORY",
      });

      const result = await importFromGitlab(
        testProjectId,
        testUserId,
        testBranch,
        "branchforge_wins" as ConflictResolution
      );

      expect(result.status).toBe("COMPLETED");
      const [file] = await db
        .select()
        .from(projectFiles)
        .where(eq(projectFiles.id, testGitlabFileId));
      expect(file?.content).toBe(remoteContent);
      expect(file?.hasRemoteConflict).toBe(false);
    });

    it("fails the whole pull when any file fetch fails (M1)", async () => {
      const localContent = 'label start:\n    "Keep me"\n    return';
      await db
        .update(projectFiles)
        .set({
          content: localContent,
          contentHash: calculateContentHash(localContent),
          lastPushedContentHash: calculateContentHash(localContent),
        })
        .where(eq(projectFiles.id, testGitlabFileId));

      vi.spyOn(gitlabRepoService, "getBranchCommitSha").mockResolvedValue(
        "abc123def456"
      );
      vi.spyOn(gitlabRepoService, "listRpyFiles").mockResolvedValue([
        { name: "script.rpy", path: "game/script.rpy" } as any,
        { name: "other.rpy", path: "game/other.rpy" } as any,
      ]);
      vi.spyOn(
        gitlabRepoService,
        "getFileContentWithMetadata"
      ).mockImplementation(async (_projectId, _userId, path) => {
        if (path === "game/other.rpy") {
          throw new Error("fetch failed for other.rpy");
        }
        return {
          content: 'label start:\n    "Remote"\n    return',
          lastCommitId: "remote-rev-partial-fetch",
          contentSha256: null,
          blobId: null,
        };
      });

      const result = await importFromGitlab(
        testProjectId,
        testUserId,
        testBranch,
        "gitlab_wins" as ConflictResolution
      );

      expect(result.status).toBe("FAILED");
      expect(result.errorMessage).toContain("fetch failed");

      const [file] = await db
        .select()
        .from(projectFiles)
        .where(eq(projectFiles.id, testGitlabFileId));
      expect(file?.content).toBe(localContent);
    });

    it("rolls back file upserts when incoming-jump recompute fails (M1)", async () => {
      const localContent = 'label start:\n    "Before import"\n    return';
      const remoteContent = 'label start:\n    "After import"\n    return';
      await db
        .update(projectFiles)
        .set({
          content: localContent,
          contentHash: calculateContentHash(localContent),
          lastPushedContentHash: calculateContentHash(localContent),
          remoteContentHash: calculateContentHash(localContent),
          originalContent: localContent,
        })
        .where(eq(projectFiles.id, testGitlabFileId));

      vi.spyOn(gitlabRepoService, "getBranchCommitSha").mockResolvedValue(
        "abc123def456"
      );
      vi.spyOn(gitlabRepoService, "listRpyFiles").mockResolvedValue([
        { name: "script.rpy", path: "game/script.rpy" } as any,
      ]);
      vi.spyOn(
        gitlabRepoService,
        "getFileContentWithMetadata"
      ).mockResolvedValue({
        content: remoteContent,
        lastCommitId: "remote-rev-rollback",
        contentSha256: null,
        blobId: null,
      });
      vi.spyOn(rpyParserService, "parseRPYFileWithLabels").mockReturnValue({
        labels: [
          {
            label: "start",
            lineNumber: 1,
            dialogue: [{ speaker: null, text: "After import", lineNumber: 2 }],
            choices: [],
            jumps: [],
          },
        ],
        characters: [],
        fileType: "STORY",
      });
      vi.spyOn(
        labelsService,
        "updateIncomingJumpsForLabels"
      ).mockRejectedValueOnce(new Error("incoming jumps failed"));

      const result = await importFromGitlab(
        testProjectId,
        testUserId,
        testBranch,
        "gitlab_wins" as ConflictResolution
      );

      expect(result.status).toBe("FAILED");
      expect(result.errorMessage).toContain("incoming jumps failed");

      const [file] = await db
        .select()
        .from(projectFiles)
        .where(eq(projectFiles.id, testGitlabFileId));
      expect(file?.content).toBe(localContent);
      expect(file?.contentHash).toBe(calculateContentHash(localContent));
    });

    it("should handle API errors", async () => {
      vi.spyOn(gitlabRepoService, "getBranchCommitSha").mockResolvedValue(
        "abc123def456"
      );
      vi.spyOn(gitlabRepoService, "listRpyFiles").mockRejectedValue(
        new Error("API Error")
      );

      const result = await importFromGitlab(
        testProjectId,
        testUserId,
        testBranch,
        "branchforge_wins" as ConflictResolution
      );

      expect(result).toMatchObject({
        status: "FAILED",
        errorMessage: "API Error",
      });
    });

    it("should handle invalid RPY content gracefully", async () => {
      vi.spyOn(gitlabRepoService, "getBranchCommitSha").mockResolvedValue(
        "abc123def456"
      );
      vi.spyOn(gitlabRepoService, "listRpyFiles").mockResolvedValue([
        { name: "script.rpy", path: "game/script.rpy" } as any,
      ]);

      vi.spyOn(
        gitlabRepoService,
        "getFileContentWithMetadata"
      ).mockResolvedValue({
        content: "invalid rpy content",
        lastCommitId: "remote-rev-import-4",
        contentSha256: null,
        blobId: null,
      });

      // Parse should still work, just return empty labels
      vi.spyOn(rpyParserService, "parseRPYFileWithLabels").mockReturnValue({
        labels: [],
        characters: [],
        fileType: "STORY",
      });

      const result = await importFromGitlab(
        testProjectId,
        testUserId,
        testBranch,
        "branchforge_wins" as ConflictResolution
      );

      expect(result.status).toBe("COMPLETED");
    });

    it("imports protected standard files verbatim without promoting symbols", async () => {
      const { parseRPYFileWithLabels } = await import("../rpy/parser.js");
      vi.spyOn(rpyParserService, "parseRPYFileWithLabels").mockImplementation(
        parseRPYFileWithLabels
      );
      const remote =
        'default quick_menu = True\ndefine screens_narrator = Character("Narrator")\n\nscreen quick_menu():\n    text "Menu"\n';
      vi.spyOn(gitlabRepoService, "getBranchCommitSha").mockResolvedValue(
        "abc123def456"
      );
      vi.spyOn(gitlabRepoService, "listRpyFiles").mockResolvedValue([
        { name: "gui.rpy", path: "game/gui.rpy" },
      ]);
      vi.spyOn(
        gitlabRepoService,
        "getFileContentWithMetadata"
      ).mockResolvedValue({
        content: remote,
        lastCommitId: "remote-rev-protected",
        contentSha256: null,
        blobId: null,
      });

      const result = await importFromGitlab(
        testProjectId,
        testUserId,
        testBranch,
        "gitlab_wins" as ConflictResolution
      );

      expect(result.status, result.errorMessage ?? undefined).toBe("COMPLETED");

      const [file] = await db
        .select()
        .from(projectFiles)
        .where(
          and(
            eq(projectFiles.projectId, testProjectId),
            eq(projectFiles.filePath, "game/gui.rpy")
          )
        );
      expect(file).toBeDefined();
      expect(file?.content).toBe(remote);
      expect(file?.fileType).toBe("SETTINGS");

      expect(result.characterReview).toMatchObject({
        characters: [],
        conflicts: [],
      });

      const [promotedVariable] = await db
        .select()
        .from(variables)
        .where(
          and(
            eq(variables.projectId, testProjectId),
            eq(variables.key, "quick_menu")
          )
        );
      expect(promotedVariable).toBeUndefined();

      const [promotedCharacter] = await db
        .select()
        .from(characters)
        .where(
          and(
            eq(characters.projectId, testProjectId),
            eq(characters.renpyTag, "screens_narrator")
          )
        );
      expect(promotedCharacter).toBeUndefined();

      const promotedLabels = await db
        .select()
        .from(labelsTable)
        .where(
          and(
            eq(labelsTable.projectId, testProjectId),
            eq(labelsTable.projectFileId, file!.id)
          )
        );
      expect(promotedLabels).toEqual([]);
    });
  });
});
