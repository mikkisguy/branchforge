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
  projectFiles,
  projectFilePendingOperations,
  gitlabSyncOperations,
} from "../../db/schema/index.js";
import { eq } from "drizzle-orm";
import {
  detectConflicts,
  exportToGitlab,
  importFromGitlab,
} from "../gitlab-sync.service.js";
import type { ConflictResolution } from "../gitlab.types.js";
import { testEmail, testUuid } from "../../utils/test-ids.js";
import { calculateContentHash } from "../../lib/hash.js";
import * as labelsService from "../labels.service.js";

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
    routeAffiliation: "SHARED" as const,
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

    it("should export files to GitLab when files exist", async () => {
      vi.spyOn(gitlabFileService, "batchCommitFiles").mockResolvedValue(
        "commit123"
      );
      await makeFileContentModified(testGitlabFileId);
      mockRemoteContent(testGitlabFile.content);

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
      await makeFileContentModified(emptyFile.id);
      mockRemoteContent("");

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
          { action: "update", filePath: "game/new_chapter.rpy", content: "" },
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
      mockRemoteContent(testGitlabFile.content);

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
        errorMessage: "GitLab API Error",
      });

      // Failure preserves pending baselines untouched
      const [file] = await db
        .select()
        .from(projectFiles)
        .where(eq(projectFiles.id, testGitlabFileId));
      expect(file?.lastPushedContentHash).toBe("stale-pushed-baseline");
    });

    it("should generate default commit message when not provided", async () => {
      vi.spyOn(gitlabFileService, "batchCommitFiles").mockResolvedValue(
        "commit125"
      );
      await makeFileContentModified(testGitlabFileId);
      mockRemoteContent(testGitlabFile.content);

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
      mockRemoteContent(testGitlabFile.content);

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
  });
});
