/**
 * Labels Service Sync Integration Tests
 *
 * Tests for label sync functionality against a real database.
 * Consolidated from label-sync.service.ts and gitlab-file-sync.service.ts
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
import { getDb } from "../../db/index.js";
import {
  users,
  projects,
  labels as labelsTable,
  labelLines,
  characters,
  projectFiles,
  projectFileSyncState,
  type NewUser,
  type NewProject,
  type NewCharacter,
  type NewProjectFile,
} from "../../db/schema/index.js";
import { eq, isNull, and, inArray } from "drizzle-orm";
import {
  syncLabelsFromFile,
  syncLabelsFromGitLabFile,
  validateRPYContent,
  validateFileType,
} from "../labels.service.js";
import { parseRPYFileWithLabels } from "../rpy-parser.service.js";
import { calculateContentHash } from "../../lib/hash.js";
import { testEmail, testUuid } from "../../utils/test-ids.js";

describe("LabelsService Sync (Integration)", () => {
  let db: ReturnType<typeof getDb>;

  beforeAll(async () => {
    db = getDb();
  });

  const testUserId = testUuid("08000000", 1);
  const testProjectId = testUuid("18000000", 1);
  const testFileId = testUuid("58000000", 1);

  const testUser: NewUser = {
    id: testUserId,
    email: testEmail("labels-sync", "owner"),
    passwordHash: "hashed_password",
    role: "OWNER",
  };

  const testProject: NewProject = {
    id: testProjectId,
    userId: testUserId,
    name: "Test Project",
    description: "A test project",
    maxMeterDelta: 10,
    source: "GITLAB",
  };

  const testFile: NewProjectFile = {
    id: testFileId,
    projectId: testProjectId,
    source: "GITLAB",
    filePath: "game/script.rpy",
    fileType: "STORY",
    content: 'label start:\n    "Content"\n    return',
    contentHash: calculateContentHash(
      'label start:\n    "Content"\n    return'
    ),
  };

  async function cleanupTestData() {
    await db
      .delete(projectFileSyncState)
      .where(eq(projectFileSyncState.projectFileId, testFileId));
    const labelIdsToDelete = await db
      .select({ id: labelsTable.id })
      .from(labelsTable)
      .where(eq(labelsTable.projectFileId, testFileId));
    if (labelIdsToDelete.length > 0) {
      const ids = labelIdsToDelete.map((l) => l.id);
      await db.delete(labelLines).where(inArray(labelLines.labelId, ids));
    }
    await db
      .delete(labelsTable)
      .where(eq(labelsTable.projectFileId, testFileId));
    await db.delete(characters).where(eq(characters.projectId, testProjectId));
    await db.delete(projectFiles).where(eq(projectFiles.id, testFileId));
    await db.delete(projects).where(eq(projects.id, testProjectId));
    await db.delete(users).where(eq(users.id, testUserId));
  }

  async function setupTestData() {
    await db.insert(users).values(testUser);
    await db.insert(projects).values(testProject);
    await db.insert(projectFiles).values(testFile);
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanupTestData();
    await setupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe("Validation", () => {
    describe("validateRPYContent", () => {
      it("should pass validation for valid content", () => {
        const content = 'label start:\n    "Hello"\n    return';
        const parsed = parseRPYFileWithLabels(content);

        expect(() => validateRPYContent(content, parsed)).not.toThrow();
      });

      it("should throw error for empty content", () => {
        const content = "";
        const parsed = parseRPYFileWithLabels(content);

        expect(() => validateRPYContent(content, parsed)).toThrow(
          "RPY content is empty"
        );
      });

      it("should throw error for whitespace-only content", () => {
        const content = "   \n  \n  ";
        const parsed = parseRPYFileWithLabels(content);

        expect(() => validateRPYContent(content, parsed)).toThrow(
          "RPY content is empty"
        );
      });

      it("should throw error for content with no labels", () => {
        const content = "# Just a comment\n# No labels here";
        const parsed = parseRPYFileWithLabels(content);

        expect(() => validateRPYContent(content, parsed)).toThrow(
          "No labels found in RPY content"
        );
      });

      it("should throw error for duplicate labels", () => {
        const content =
          'label start:\n    "First"\nlabel start:\n    "Second"\n    return';
        const parsed = parseRPYFileWithLabels(content);

        expect(() => validateRPYContent(content, parsed)).toThrow(
          "Duplicate labels found"
        );
      });

      it("should detect case-insensitive duplicate labels", () => {
        const content =
          'label start:\n    "First"\nlabel START:\n    "Second"\n    return';
        const parsed = parseRPYFileWithLabels(content);

        expect(() => validateRPYContent(content, parsed)).toThrow(
          "Duplicate labels found"
        );
      });
    });

    describe("validateFileType", () => {
      it("should pass for STORY type", () => {
        expect(() => validateFileType("STORY")).not.toThrow();
      });

      it("should throw error for SETTINGS type", () => {
        expect(() => validateFileType("SETTINGS")).toThrow(
          "Invalid file type for label sync"
        );
      });
    });
  });

  describe("syncLabelsFromFile", () => {
    it("should create labels from RPY content", async () => {
      const content =
        'label start:\n    "First line"\n    "Second line"\n    return';

      const result = await syncLabelsFromFile(
        testProjectId,
        { filePath: testFile.filePath, fileType: testFile.fileType },
        content,
        testFileId
      );

      expect(result.success).toBe(true);
      expect(result.labelsCreated).toBe(1);
      expect(result.labelsUpdated).toBe(0);
      expect(result.linesProcessed).toBe(2);
      expect(result.affectedLabelIds).toHaveLength(1);
      expect(result.errors).toHaveLength(0);

      const [label] = await db
        .select()
        .from(labelsTable)
        .where(eq(labelsTable.labelName, "start"))
        .limit(1);

      expect(label).toBeDefined();
      expect(label?.title).toBe("start");
      expect(label?.projectFileId).toBe(testFileId);
    });

    it("should create multiple labels from multiple labels", async () => {
      const content =
        'label start:\n    "Start"\n    return\nlabel chapter1:\n    "Chapter 1"\n    return';

      const result = await syncLabelsFromFile(
        testProjectId,
        { filePath: testFile.filePath, fileType: testFile.fileType },
        content,
        testFileId
      );

      expect(result.success).toBe(true);
      expect(result.labelsCreated).toBe(2);
      expect(result.affectedLabelIds).toHaveLength(2);
    });

    it("should update existing labels", async () => {
      const content1 = 'label start:\n    "Original"\n    return';

      const result1 = await syncLabelsFromFile(
        testProjectId,
        { filePath: testFile.filePath, fileType: testFile.fileType },
        content1,
        testFileId
      );
      expect(result1.labelsCreated).toBe(1);

      const [label] = await db
        .select()
        .from(labelsTable)
        .where(eq(labelsTable.labelName, "start"))
        .limit(1);

      const content2 =
        'label start:\n    "Updated"\n    "Second line"\n    return';

      const result2 = await syncLabelsFromFile(
        testProjectId,
        { filePath: testFile.filePath, fileType: testFile.fileType },
        content2,
        testFileId
      );

      expect(result2.success).toBe(true);
      expect(result2.labelsCreated).toBe(0);
      expect(result2.labelsUpdated).toBe(1);
      expect(result2.linesProcessed).toBe(2);

      const lines = await db
        .select()
        .from(labelLines)
        .where(eq(labelLines.labelId, label!.id));

      expect(lines).toHaveLength(2);
      expect(lines[0].content).toBe("Updated");
      expect(lines[1].content).toBe("Second line");
    });

    it("should handle external transaction parameter", async () => {
      const content = 'label start:\n    "Content"\n    return';

      const result = await db.transaction(async (tx) => {
        const syncResult = await syncLabelsFromFile(
          testProjectId,
          { filePath: testFile.filePath, fileType: testFile.fileType },
          content,
          testFileId,
          { tx }
        );

        // Verify label exists within transaction
        const [label] = await tx
          .select()
          .from(labelsTable)
          .where(eq(labelsTable.labelName, "start"))
          .limit(1);

        expect(label).toBeDefined();
        return syncResult;
      });

      expect(result.success).toBe(true);
      expect(result.labelsCreated).toBe(1);
    });

    it("should skip cleanup when skipCleanup option is true", async () => {
      const content1 =
        'label start:\n    "Start"\n    return\nlabel chapter1:\n    "Chapter 1"\n    return';

      const result1 = await syncLabelsFromFile(
        testProjectId,
        { filePath: testFile.filePath, fileType: testFile.fileType },
        content1,
        testFileId
      );

      expect(result1.labelsCreated).toBe(2);

      const content2 = 'label start:\n    "Start"\n    return';

      const result2 = await syncLabelsFromFile(
        testProjectId,
        { filePath: testFile.filePath, fileType: testFile.fileType },
        content2,
        testFileId,
        { skipCleanup: true }
      );

      expect(result2.success).toBe(true);
      expect(result2.labelsDeleted).toBe(0);

      const labels = await db
        .select()
        .from(labelsTable)
        .where(eq(labelsTable.projectFileId, testFileId));

      expect(labels).toHaveLength(2);
    });

    it("should perform orphan cleanup by default", async () => {
      const content1 =
        'label start:\n    "Start"\n    return\nlabel chapter1:\n    "Chapter 1"\n    return';

      const result1 = await syncLabelsFromFile(
        testProjectId,
        { filePath: testFile.filePath, fileType: testFile.fileType },
        content1,
        testFileId
      );

      expect(result1.labelsCreated).toBe(2);

      const content2 = 'label start:\n    "Start"\n    return';

      const result2 = await syncLabelsFromFile(
        testProjectId,
        { filePath: testFile.filePath, fileType: testFile.fileType },
        content2,
        testFileId
      );

      expect(result2.success).toBe(true);
      expect(result2.labelsDeleted).toBe(1);

      const labels = await db
        .select()
        .from(labelsTable)
        .where(
          and(
            eq(labelsTable.projectFileId, testFileId),
            isNull(labelsTable.deletedAt)
          )
        );

      expect(labels).toHaveLength(1);
      expect(labels[0].labelName).toBe("start");
    });

    it("should return error for empty content", async () => {
      const result = await syncLabelsFromFile(
        testProjectId,
        { filePath: testFile.filePath, fileType: testFile.fileType },
        "",
        testFileId
      );

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain("empty");
    });

    it("should return error for content with no labels", async () => {
      const content = "# Just comments\n# No labels";

      const result = await syncLabelsFromFile(
        testProjectId,
        { filePath: testFile.filePath, fileType: testFile.fileType },
        content,
        testFileId
      );

      expect(result.success).toBe(false);
      expect(result.errors[0].error).toContain("No labels found");
    });

    it("should return error for duplicate labels", async () => {
      const content =
        'label start:\n    "First"\nlabel start:\n    "Second"\n    return';

      const result = await syncLabelsFromFile(
        testProjectId,
        { filePath: testFile.filePath, fileType: testFile.fileType },
        content,
        testFileId
      );

      expect(result.success).toBe(false);
      expect(result.errors[0].error).toContain("Duplicate labels");
    });

    it("should return error for SETTINGS file type", async () => {
      const result = await syncLabelsFromFile(
        testProjectId,
        { filePath: testFile.filePath, fileType: "SETTINGS" },
        'label start:\n    "Content"\n    return',
        testFileId
      );

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors[0].error).toContain("Invalid file type");
    });

    it("should link characters to label lines", async () => {
      const character: NewCharacter = {
        id: testUuid("18000001", 1),
        projectId: testProjectId,
        name: "Eileen",
        displayName: "Eileen",
        renpyTag: "a",
        color: "#FF5733",
      };

      await db.insert(characters).values(character);

      const content = 'label start:\n    a "Hello from Eileen"\n    return';

      const result = await syncLabelsFromFile(
        testProjectId,
        { filePath: testFile.filePath, fileType: testFile.fileType },
        content,
        testFileId
      );

      expect(result.success).toBe(true);

      const [label] = await db
        .select()
        .from(labelsTable)
        .where(eq(labelsTable.labelName, "start"))
        .limit(1);

      const lines = await db
        .select()
        .from(labelLines)
        .where(eq(labelLines.labelId, label!.id));

      expect(lines).toHaveLength(1);
      expect(lines[0].speakerId).toBe(character.id);
    });
  });

  describe("syncLabelsFromGitLabFile", () => {
    describe("Happy Path", () => {
      it("should create labels from RPY content", async () => {
        const content =
          'label start:\n    "First line"\n    "Second line"\n    return';

        const result = await syncLabelsFromGitLabFile(testFileId, content);

        expect(result.success).toBe(true);
        expect(result.skipped).toBe(false);
        expect(result.labelsCreated).toBe(1);
        expect(result.labelsUpdated).toBe(0);
        expect(result.labelsDeleted).toBe(0);
        expect(result.linesProcessed).toBe(2);
        expect(result.errors).toHaveLength(0);

        const [label] = await db
          .select()
          .from(labelsTable)
          .where(eq(labelsTable.labelName, "start"))
          .limit(1);

        expect(label).toBeDefined();
        expect(label?.title).toBe("start");
        expect(label?.projectFileId).toBe(testFileId);
      });

      it("should create multiple labels from multiple labels", async () => {
        const content =
          'label start:\n    "Start"\n    return\nlabel chapter1:\n    "Chapter 1"\n    return';

        const result = await syncLabelsFromGitLabFile(testFileId, content);

        expect(result.success).toBe(true);
        expect(result.labelsCreated).toBe(2);
        expect(result.labelsUpdated).toBe(0);
      });

      it("should update existing labels", async () => {
        const content1 = 'label start:\n    "Original"\n    return';

        const result1 = await syncLabelsFromGitLabFile(testFileId, content1);
        expect(result1.labelsCreated).toBe(1);

        const [label] = await db
          .select()
          .from(labelsTable)
          .where(eq(labelsTable.labelName, "start"))
          .limit(1);

        const content2 =
          'label start:\n    "Updated"\n    "Second line"\n    return';

        const result2 = await syncLabelsFromGitLabFile(testFileId, content2);

        expect(result2.success).toBe(true);
        expect(result2.labelsCreated).toBe(0);
        expect(result2.labelsUpdated).toBe(1);
        expect(result2.linesProcessed).toBe(2);

        const lines = await db
          .select()
          .from(labelLines)
          .where(eq(labelLines.labelId, label!.id));

        expect(lines).toHaveLength(2);
        expect(lines[0].content).toBe("Updated");
        expect(lines[1].content).toBe("Second line");
      });
    });

    describe("Idempotency", () => {
      it("should skip sync if content already synced", async () => {
        const content = 'label start:\n    "Content"\n    return';

        const result1 = await syncLabelsFromGitLabFile(testFileId, content);

        expect(result1.success).toBe(true);
        expect(result1.skipped).toBe(false);
        expect(result1.labelsCreated).toBe(1);

        const result2 = await syncLabelsFromGitLabFile(testFileId, content);

        expect(result2.success).toBe(true);
        expect(result2.skipped).toBe(true);
        expect(result2.labelsCreated).toBe(0);
        expect(result2.labelsUpdated).toBe(0);
      });

      it("should sync if content changed", async () => {
        const content1 = 'label start:\n    "Original"\n    return';

        const result1 = await syncLabelsFromGitLabFile(testFileId, content1);

        expect(result1.success).toBe(true);
        expect(result1.skipped).toBe(false);

        const content2 = 'label start:\n    "Changed"\n    return';

        const result2 = await syncLabelsFromGitLabFile(testFileId, content2);

        expect(result2.success).toBe(true);
        expect(result2.skipped).toBe(false);
        expect(result2.labelsUpdated).toBe(1);
      });
    });

    describe("Concurrent Sync Prevention", () => {
      it("should return error when sync is already in progress", async () => {
        await db.insert(projectFileSyncState).values({
          id: testUuid("68000000", 1),
          projectFileId: testFileId,
          contentHash: "hash123",
          status: "MODIFIED_LOCAL",
          rpyLabelCount: 1,
          dbLabelCount: 0,
        });

        const content = 'label start:\n    "Content"\n    return';

        const result = await syncLabelsFromGitLabFile(testFileId, content);

        expect(result.success).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].error).toContain("already in progress");
      });
    });

    describe("Orphan Cleanup", () => {
      it("should delete labels whose labels no longer exist", async () => {
        const content1 =
          'label start:\n    "Start"\n    return\nlabel chapter1:\n    "Chapter 1"\n    return';

        const result1 = await syncLabelsFromGitLabFile(testFileId, content1);

        expect(result1.labelsCreated).toBe(2);

        const labels = await db
          .select()
          .from(labelsTable)
          .where(eq(labelsTable.projectFileId, testFileId));

        expect(labels).toHaveLength(2);

        const content2 = 'label start:\n    "Start"\n    return';

        const result2 = await syncLabelsFromGitLabFile(testFileId, content2);

        expect(result2.success).toBe(true);
        expect(result2.labelsDeleted).toBe(1);

        const remainingLabels = await db
          .select()
          .from(labelsTable)
          .where(
            and(
              eq(labelsTable.projectFileId, testFileId),
              isNull(labelsTable.deletedAt)
            )
          );

        expect(remainingLabels).toHaveLength(1);
        expect(remainingLabels[0].labelName).toBe("start");
      });

      it("should skip cleanup when skipCleanup option is true", async () => {
        const content1 =
          'label start:\n    "Start"\n    return\nlabel chapter1:\n    "Chapter 1"\n    return';

        const result1 = await syncLabelsFromGitLabFile(testFileId, content1);

        expect(result1.labelsCreated).toBe(2);

        const content2 = 'label start:\n    "Start"\n    return';

        const result2 = await syncLabelsFromGitLabFile(testFileId, content2, {
          skipCleanup: true,
        });

        expect(result2.success).toBe(true);
        expect(result2.labelsDeleted).toBe(0);

        const labels = await db
          .select()
          .from(labelsTable)
          .where(eq(labelsTable.projectFileId, testFileId));

        expect(labels).toHaveLength(2);
      });
    });

    describe("Error Handling", () => {
      it("should return error for empty content", async () => {
        const result = await syncLabelsFromGitLabFile(testFileId, "");

        expect(result.success).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].error).toContain("empty");
      });

      it("should return error for content with no labels", async () => {
        const content = "# Just comments\n# No labels";

        const result = await syncLabelsFromGitLabFile(testFileId, content);

        expect(result.success).toBe(false);
        expect(result.errors[0].error).toContain("No labels found");
      });

      it("should return error for duplicate labels", async () => {
        const content =
          'label start:\n    "First"\nlabel start:\n    "Second"\n    return';

        const result = await syncLabelsFromGitLabFile(testFileId, content);

        expect(result.success).toBe(false);
        expect(result.errors[0].error).toContain("Duplicate labels");
      });

      it("should return error for SETTINGS file type", async () => {
        await db
          .update(projectFiles)
          .set({ fileType: "SETTINGS" })
          .where(eq(projectFiles.id, testFileId));

        const content = 'label start:\n    "Content"\n    return';

        const result = await syncLabelsFromGitLabFile(testFileId, content);

        expect(result.success).toBe(false);
        expect(result.errors.length).toBeGreaterThanOrEqual(1);
        expect(result.errors[0].error).toContain("Invalid file type");
      });
    });

    describe("Atomic Transactions", () => {
      it("should rollback entire transaction on error", async () => {
        const validContent = 'label start:\n    "Valid"\n    return';

        const result1 = await syncLabelsFromGitLabFile(
          testFileId,
          validContent
        );

        expect(result1.success).toBe(true);
        expect(result1.labelsCreated).toBe(1);

        const labelsBefore = await db
          .select()
          .from(labelsTable)
          .where(eq(labelsTable.projectFileId, testFileId));

        const result2 = await syncLabelsFromGitLabFile(testFileId, "");

        expect(result2.success).toBe(false);

        const labelsAfter = await db
          .select()
          .from(labelsTable)
          .where(eq(labelsTable.projectFileId, testFileId));

        expect(labelsAfter).toHaveLength(labelsBefore.length);
      });
    });

    describe("Sync State Tracking", () => {
      it("should create sync state record on sync", async () => {
        const content = 'label start:\n    "Content"\n    return';

        await syncLabelsFromGitLabFile(testFileId, content);

        const syncStates = await db
          .select()
          .from(projectFileSyncState)
          .where(eq(projectFileSyncState.projectFileId, testFileId));

        expect(syncStates.length).toBeGreaterThanOrEqual(1);

        const latestState = syncStates[0];
        expect(latestState.status).toBe("SYNCED");
        expect(latestState.rpyLabelCount).toBe(1);
        expect(latestState.dbLabelCount).toBe(1);
      });

      it("should mark sync as failed on error", async () => {
        const content =
          'label start:\n    "First"\nlabel start:\n    "Second"\n    return';

        const result = await syncLabelsFromGitLabFile(testFileId, content);

        expect(result.success).toBe(false);

        const syncStates = await db
          .select()
          .from(projectFileSyncState)
          .where(eq(projectFileSyncState.projectFileId, testFileId));

        expect(syncStates.length).toBeGreaterThanOrEqual(1);

        const latestState = syncStates[0];
        expect(latestState.status).toBe("CONFLICT");
        expect(latestState.errorMessage).not.toBeNull();
      });

      it("should update projectFiles contentHash on successful sync", async () => {
        const content = 'label start:\n    "Content"\n    return';

        await syncLabelsFromGitLabFile(testFileId, content);

        const [file] = await db
          .select()
          .from(projectFiles)
          .where(eq(projectFiles.id, testFileId))
          .limit(1);

        const expectedHash = calculateContentHash(content);
        expect(file?.contentHash).toBe(expectedHash);
      });
    });

    describe("Edge Cases", () => {
      it("should handle single label file", async () => {
        const content = 'label start:\n    "Only label"\n    return';

        const result = await syncLabelsFromGitLabFile(testFileId, content);

        expect(result.success).toBe(true);
        expect(result.labelsCreated).toBe(1);
      });

      it("should handle label with no dialogue", async () => {
        const content = "label start:\n    return";

        const result = await syncLabelsFromGitLabFile(testFileId, content);

        expect(result.success).toBe(true);
        expect(result.labelsCreated).toBe(1);
        expect(result.linesProcessed).toBe(0);
      });

      it("should handle file not found error", async () => {
        const fakeFileId = "99999999-9999-9999-9999-999999999999";
        const content = 'label start:\n    "Content"\n    return';

        const result = await syncLabelsFromGitLabFile(fakeFileId, content);

        expect(result.success).toBe(false);
        expect(result.errors.length).toBeGreaterThanOrEqual(1);
      });
    });
  });
});
