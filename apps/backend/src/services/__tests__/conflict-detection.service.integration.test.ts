/**
 * Conflict Detection Service Integration Tests
 *
 * Tests for the conflict detection service.
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
import * as gitlabService from "../gitlab.service.js";
import * as rpyParserService from "../rpy-parser.service.js";
import { getDb } from "../../db/index.js";
import {
  labels,
  labelLines,
  characters,
  projectFiles,
  projects,
  users,
} from "../../db/schema/index.js";
import { eq } from "drizzle-orm";
import { detectConflicts } from "../conflict-detection.service.js";
import { testUuid } from "../../utils/test-ids.js";

describe("ConflictDetectionService (Integration)", () => {
  let db: ReturnType<typeof getDb>;

  beforeAll(async () => {
    db = getDb();
  });

  // Test fixtures with hardcoded UUIDs
  const testUserId = testUuid("06000000", 1);
  const testProjectId = testUuid("16000000", 1);
  const testGitlabFileId = testUuid("56000000", 1);
  const testBranch = "main";

  const testUser = {
    id: testUserId,
    email: "test@example.com",
    passwordHash: "hashed_password",
    role: "OWNER" as const,
  };

  const testProject = {
    id: testProjectId,
    userId: testUserId,
    name: "Test Project",
    description: "A test project",
    maxMeterDelta: 10,
    source: "GITLAB" as const,
  };

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
    const counter = projectFileFixtureCounter;
    const id = overrides.id ?? testUuid("56000000", counter);
    // Only increment counter for auto-generated IDs
    if (!overrides.id) {
      projectFileFixtureCounter++;
    }
    return {
      id,
      projectId: testProjectId,
      source: "GITLAB" as const,
      filePath: overrides.filePath ?? `game/script${counter}.rpy`,
      fileType: "STORY" as const,
      content: overrides.content ?? 'label start:\n    "Content"\n    return',
      contentHash: overrides.contentHash ?? `hash${counter}`,
    };
  }

  const testCharacter = {
    id: testUuid("36000000", 1),
    projectId: testProjectId,
    name: "S",
    renpyTag: "s",
    displayName: "S",
    color: "#ffffff",
    avatarUrl: null,
  };

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
    prerequisites: {},
    effects: {},
    projectFileId: testGitlabFileId,
    labelName: "start",
    labelPosition: 0,
  };

  const testGitlabFile = createProjectFileFixture({
    id: testGitlabFileId,
    filePath: "game/script.rpy",
  });

  beforeEach(async () => {
    // Clear relevant tables
    await db.delete(labelLines);
    await db.delete(labels);
    await db.delete(characters);
    await db.delete(projectFiles);
    await db.delete(projects);
    await db.delete(users);

    // Set up test data
    await db.insert(users).values(testUser);
    await db.insert(projects).values(testProject);
    await db.insert(projectFiles).values(testGitlabFile);
  });

  afterEach(async () => {
    // Clean up all test data
    await db.delete(labelLines);
    await db.delete(labels);
    await db.delete(characters);
    await db.delete(projectFiles);
    await db.delete(projects);
    await db.delete(users);
    vi.restoreAllMocks();
  });

  describe("detectConflicts", () => {
    it("should detect no conflicts when local and remote are in sync", async () => {
      // Set up local scene with lines
      await db.insert(labels).values(testScene);

      // Insert a line with same content as remote
      await db.insert(labelLines).values({
        id: testUuid("46000000", 1),
        labelId: testScene.id,
        sequence: 1,
        contentType: "NARRATION" as const,
        content: "Same content",
        visualType: "GENERATED" as const,
      });

      // Mock GitLab API to return same content (for getFileContent)
      vi.spyOn(gitlabService, "getFileContent").mockResolvedValue(
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
      await db.insert(labels).values(testScene);

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
      vi.spyOn(gitlabService, "getFileContent").mockResolvedValue(
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
      vi.spyOn(gitlabService, "getFileContent").mockResolvedValue(
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
      await db.insert(labels).values(testScene);

      // Mock GitLab API to return a file with different labels
      vi.spyOn(gitlabService, "getFileContent").mockImplementation(
        async (_projectId, filePath) => {
          if (filePath === "game/script.rpy") {
            return 'label other:\n    "Other content"\n    return';
          }
          return "";
        }
      );

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

      // Check that we have deleted_remote_label conflict
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
      await db.insert(labels).values(testScene);
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
      vi.spyOn(gitlabService, "getFileContent").mockResolvedValue(
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
      await db.insert(labels).values(testScene);
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

      // Mock GitLab API to return same dialogue
      vi.spyOn(gitlabService, "getFileContent").mockResolvedValue(
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
      await db.insert(labels).values(testScene);

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
      vi.spyOn(gitlabService, "getFileContent").mockImplementation(
        async (_projectId, filePath) => {
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
      await db.insert(labels).values(testScene);

      // Mock GitLab API to throw error
      vi.spyOn(gitlabService, "getFileContent").mockRejectedValue(
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
      // Create another gitlab file for second scene
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
        prerequisites: {},
        effects: {},
        projectFileId: testGitlabFile2.id, // Uses dynamically generated ID
        labelName: "chapter1",
        labelPosition: 0,
      };

      await db.insert(labels).values([testScene, testScene2]);

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
      vi.spyOn(gitlabService, "getFileContent").mockImplementation(
        async (_projectId, filePath) => {
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
      await db.delete(labels).where(eq(labels.id, testScene2.id));
      await db
        .delete(projectFiles)
        .where(eq(projectFiles.id, testGitlabFile2.id));
    });
  });
});
