/**
 * GitLab File Sync Service Integration Tests
 *
 * Tests for reliable sync between project_files and labels/label_lines.
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
  projectFiles,
  projectFileSyncState,
} from "../../db/schema/index.js";
import { eq, isNull, and } from "drizzle-orm";
import {
  syncLabelsFromGitLabFile,
  validateRPYContent,
  validateFileType,
  checkInProgressSync,
  checkContentAlreadySynced,
  createSyncState,
  completeSyncState,
} from "../gitlab-file-sync.service.js";
import { parseRPYFileWithLabels } from "../rpy-parser.service.js";
import { calculateContentHash } from "../../lib/hash.js";
import { testEmail, testUuid } from "../../utils/test-ids.js";

describe("GitLabFileSyncService (Integration)", () => {
  let db: ReturnType<typeof getDb>;

  beforeAll(async () => {
    db = getDb();
  });

  // Test fixtures with hardcoded UUIDs
  const testUserId = testUuid("07000000", 1);
  const testProjectId = testUuid("17000000", 1);
  const testGitlabFileId = testUuid("57000000", 1);

  const testUser = {
    id: testUserId,
    email: testEmail("gitlab-file-sync-service", "owner"),
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

  const testGitlabFile = {
    id: testGitlabFileId,
    projectId: testProjectId,
    source: "GITLAB" as const,
    filePath: "game/script.rpy",
    fileType: "STORY" as const,
    content: 'label start:\n    "Content"\n    return',
    contentHash: "hash123",
  };

  // Helper to clean up all test data
  async function cleanupTestData() {
    await db
      .delete(projectFileSyncState)
      .where(eq(projectFileSyncState.projectFileId, testGitlabFileId));
    await db
      .delete(labelLines)
      .where(eq(labelLines.projectFileId, testGitlabFileId));
    await db
      .delete(labelsTable)
      .where(eq(labelsTable.projectFileId, testGitlabFileId));
    // Delete and re-insert gitlab file to ensure clean state
    await db.delete(projectFiles).where(eq(projectFiles.id, testGitlabFileId));
    await db.delete(projects).where(eq(projects.id, testProjectId));
    await db.delete(users).where(eq(users.id, testUserId));
  }

  // Helper to set up test data
  async function setupTestData(includeGitlabFile = true) {
    await db.insert(users).values(testUser);
    await db.insert(projects).values(testProject);
    if (includeGitlabFile) {
      await db.insert(projectFiles).values(testGitlabFile);
    }
  }

  // Helper to clean up additional labels
  async function _cleanupAdditionalData(labelIds: string[]) {
    for (const labelId of labelIds) {
      await db.delete(labelLines).where(eq(labelLines.labelId, labelId));
      await db.delete(labelsTable).where(eq(labelsTable.id, labelId));
    }
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanupTestData();
    await setupTestData(true);
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe("calculateContentHash", () => {
    it("should calculate consistent hash for same content", () => {
      const content = "label start:\n    'Hello'\n    return";
      const hash1 = calculateContentHash(content);
      const hash2 = calculateContentHash(content);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex chars
    });

    it("should calculate different hash for different content", () => {
      const hash1 = calculateContentHash(
        "label start:\n    'Hello'\n    return"
      );
      const hash2 = calculateContentHash(
        "label start:\n    'World'\n    return"
      );

      expect(hash1).not.toBe(hash2);
    });
  });

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

  describe("checkInProgressSync", () => {
    it("should return false when no sync in progress", async () => {
      const hasInProgress = await checkInProgressSync(testGitlabFileId);
      expect(hasInProgress).toBe(false);
    });

    it("should return true when sync is in progress", async () => {
      await db.insert(projectFileSyncState).values({
        id: testUuid("67000000", 1),
        projectFileId: testGitlabFileId,
        contentHash: "hash123",
        status: "MODIFIED_LOCAL",
        rpyLabelCount: 1,
        dbLabelCount: 0,
      });

      const hasInProgress = await checkInProgressSync(testGitlabFileId);
      expect(hasInProgress).toBe(true);

      await db
        .delete(projectFileSyncState)
        .where(eq(projectFileSyncState.projectFileId, testGitlabFileId));
    });

    it("should return false when sync is completed", async () => {
      await db.insert(projectFileSyncState).values({
        id: testUuid("67000000", 1),
        projectFileId: testGitlabFileId,
        contentHash: "hash123",
        status: "SYNCED",
        rpyLabelCount: 1,
        dbLabelCount: 1,
        completedAt: new Date(),
      });

      const hasInProgress = await checkInProgressSync(testGitlabFileId);
      expect(hasInProgress).toBe(false);

      await db
        .delete(projectFileSyncState)
        .where(eq(projectFileSyncState.projectFileId, testGitlabFileId));
    });
  });

  describe("checkContentAlreadySynced", () => {
    it("should return false when no sync has happened", async () => {
      const contentHash = "hash123";
      const alreadySynced = await checkContentAlreadySynced(
        testGitlabFileId,
        contentHash
      );
      expect(alreadySynced).toBe(false);
    });

    it("should return false when only failed sync exists", async () => {
      const contentHash = "hash123";
      await db.insert(projectFileSyncState).values({
        id: testUuid("67000000", 1),
        projectFileId: testGitlabFileId,
        contentHash,
        status: "CONFLICT",
        rpyLabelCount: 1,
        dbLabelCount: 0,
        completedAt: new Date(),
        errorMessage: "Test error",
      });

      const alreadySynced = await checkContentAlreadySynced(
        testGitlabFileId,
        contentHash
      );
      expect(alreadySynced).toBe(false);

      await db
        .delete(projectFileSyncState)
        .where(eq(projectFileSyncState.projectFileId, testGitlabFileId));
    });

    it("should return true when content was already synced", async () => {
      const contentHash = "hash123";
      await db.insert(projectFileSyncState).values({
        id: testUuid("67000000", 1),
        projectFileId: testGitlabFileId,
        contentHash,
        status: "SYNCED",
        rpyLabelCount: 1,
        dbLabelCount: 1,
        completedAt: new Date(),
      });

      const alreadySynced = await checkContentAlreadySynced(
        testGitlabFileId,
        contentHash
      );
      expect(alreadySynced).toBe(true);

      await db
        .delete(projectFileSyncState)
        .where(eq(projectFileSyncState.projectFileId, testGitlabFileId));
    });

    it("should return false for different content hash", async () => {
      await db.insert(projectFileSyncState).values({
        id: testUuid("67000000", 1),
        projectFileId: testGitlabFileId,
        contentHash: "hash123",
        status: "SYNCED",
        rpyLabelCount: 1,
        dbLabelCount: 1,
        completedAt: new Date(),
      });

      const alreadySynced = await checkContentAlreadySynced(
        testGitlabFileId,
        "differenthash"
      );
      expect(alreadySynced).toBe(false);

      await db
        .delete(projectFileSyncState)
        .where(eq(projectFileSyncState.projectFileId, testGitlabFileId));
    });
  });

  describe("createSyncState and completeSyncState", () => {
    it("should create sync state record", async () => {
      const contentHash = "hash123";
      const labelCount = 3;

      const syncStateId = await createSyncState(
        testGitlabFileId,
        contentHash,
        labelCount
      );

      expect(syncStateId).toBeDefined();

      const [syncState] = await db
        .select()
        .from(projectFileSyncState)
        .where(eq(projectFileSyncState.id, syncStateId))
        .limit(1);

      expect(syncState).toBeDefined();
      expect(syncState.projectFileId).toBe(testGitlabFileId);
      expect(syncState.contentHash).toBe(contentHash);
      expect(syncState.status).toBe("MODIFIED_LOCAL");
      expect(syncState.rpyLabelCount).toBe(labelCount);
      expect(syncState.dbLabelCount).toBe(0);
      expect(syncState.completedAt).toBeNull();

      await db
        .delete(projectFileSyncState)
        .where(eq(projectFileSyncState.id, syncStateId));
    });

    it("should complete sync state successfully", async () => {
      const [syncState] = await db
        .insert(projectFileSyncState)
        .values({
          id: testUuid("67000000", 1),
          projectFileId: testGitlabFileId,
          contentHash: "hash123",
          status: "MODIFIED_LOCAL",
          rpyLabelCount: 1,
          dbLabelCount: 0,
        })
        .returning();

      await completeSyncState(syncState.id, true, 5);

      const [updated] = await db
        .select()
        .from(projectFileSyncState)
        .where(eq(projectFileSyncState.id, syncState.id))
        .limit(1);

      expect(updated.status).toBe("SYNCED");
      expect(updated.dbLabelCount).toBe(5);
      expect(updated.completedAt).not.toBeNull();
      expect(updated.errorMessage).toBeNull();

      await db
        .delete(projectFileSyncState)
        .where(eq(projectFileSyncState.id, syncState.id));
    });

    it("should complete sync state with failure", async () => {
      const [syncState] = await db
        .insert(projectFileSyncState)
        .values({
          id: testUuid("67000000", 1),
          projectFileId: testGitlabFileId,
          contentHash: "hash123",
          status: "MODIFIED_LOCAL",
          rpyLabelCount: 1,
          dbLabelCount: 0,
        })
        .returning();

      await completeSyncState(syncState.id, false, undefined, "Sync failed");

      const [updated] = await db
        .select()
        .from(projectFileSyncState)
        .where(eq(projectFileSyncState.id, syncState.id))
        .limit(1);

      expect(updated.status).toBe("CONFLICT");
      expect(updated.dbLabelCount).toBe(0);
      expect(updated.completedAt).not.toBeNull();
      expect(updated.errorMessage).toBe("Sync failed");

      await db
        .delete(projectFileSyncState)
        .where(eq(projectFileSyncState.id, syncState.id));
    });
  });

  describe("syncLabelsFromGitLabFile - Happy Path", () => {
    it("should create labels from RPY content", async () => {
      const content =
        'label start:\n    "First line"\n    "Second line"\n    return';

      const result = await syncLabelsFromGitLabFile(testGitlabFileId, content);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(false);
      expect(result.labelsCreated).toBe(1);
      expect(result.labelsUpdated).toBe(0);
      expect(result.labelsDeleted).toBe(0);
      expect(result.linesProcessed).toBe(2);
      expect(result.errors).toHaveLength(0);

      // Verify label was created
      const [label] = await db
        .select()
        .from(labelsTable)
        .where(eq(labelsTable.labelName, "start"))
        .limit(1);

      expect(label).toBeDefined();
      expect(label?.title).toBe("start");
      expect(label?.projectFileId).toBe(testGitlabFileId);
      expect(label?.labelName).toBe("start");
      expect(label?.labelPosition).toBe(0);

      // Verify lines were created
      const lines = await db
        .select()
        .from(labelLines)
        .where(eq(labelLines.labelId, label!.id));

      expect(lines).toHaveLength(2);
      expect(lines[0].content).toBe("First line");
      expect(lines[0].sequence).toBe(1);
      expect(lines[1].content).toBe("Second line");
      expect(lines[1].sequence).toBe(2);
    });

    it("should create multiple labels from multiple labels", async () => {
      const content =
        'label start:\n    "Start"\n    return\nlabel chapter1:\n    "Chapter 1"\n    return';

      const result = await syncLabelsFromGitLabFile(testGitlabFileId, content);

      expect(result.success).toBe(true);
      expect(result.labelsCreated).toBe(2);
      expect(result.labelsUpdated).toBe(0);

      // Verify both labels were created
      const labels = await db
        .select()
        .from(labelsTable)
        .where(eq(labelsTable.projectFileId, testGitlabFileId));

      expect(labels).toHaveLength(2);
      expect(labels.map((s) => s.labelName).sort()).toEqual([
        "chapter1",
        "start",
      ]);
    });

    it("should update existing labels", async () => {
      const content1 = 'label start:\n    "Original"\n    return';

      // First sync creates the label
      const result1 = await syncLabelsFromGitLabFile(
        testGitlabFileId,
        content1
      );
      expect(result1.labelsCreated).toBe(1);

      // Get label ID
      const [label] = await db
        .select()
        .from(labelsTable)
        .where(eq(labelsTable.labelName, "start"))
        .limit(1);

      // Update content
      const content2 =
        'label start:\n    "Updated"\n    "Second line"\n    return';

      const result2 = await syncLabelsFromGitLabFile(
        testGitlabFileId,
        content2
      );

      expect(result2.success).toBe(true);
      expect(result2.labelsCreated).toBe(0);
      expect(result2.labelsUpdated).toBe(1);
      expect(result2.linesProcessed).toBe(2);

      // Verify lines were updated
      const lines = await db
        .select()
        .from(labelLines)
        .where(eq(labelLines.labelId, label!.id));

      expect(lines).toHaveLength(2);
      expect(lines[0].content).toBe("Updated");
      expect(lines[1].content).toBe("Second line");
    });
  });

  describe("syncLabelsFromGitLabFile - Idempotency", () => {
    it("should skip sync if content already synced", async () => {
      const content = 'label start:\n    "Content"\n    return';

      const result1 = await syncLabelsFromGitLabFile(testGitlabFileId, content);

      expect(result1.success).toBe(true);
      expect(result1.skipped).toBe(false);
      expect(result1.labelsCreated).toBe(1);

      // Second sync with same content should be skipped
      const result2 = await syncLabelsFromGitLabFile(testGitlabFileId, content);

      expect(result2.success).toBe(true);
      expect(result2.skipped).toBe(true);
      expect(result2.labelsCreated).toBe(0);
      expect(result2.labelsUpdated).toBe(0);
    });

    it("should sync if content changed", async () => {
      const content1 = 'label start:\n    "Original"\n    return';

      const result1 = await syncLabelsFromGitLabFile(
        testGitlabFileId,
        content1
      );

      expect(result1.success).toBe(true);
      expect(result1.skipped).toBe(false);

      const content2 = 'label start:\n    "Changed"\n    return';

      const result2 = await syncLabelsFromGitLabFile(
        testGitlabFileId,
        content2
      );

      expect(result2.success).toBe(true);
      expect(result2.skipped).toBe(false);
      expect(result2.labelsUpdated).toBe(1);
    });
  });

  describe("syncLabelsFromGitLabFile - Concurrent Sync Prevention", () => {
    it("should return error when sync is already in progress", async () => {
      // Create an in-progress sync state
      await db.insert(projectFileSyncState).values({
        id: testUuid("67000000", 1),
        projectFileId: testGitlabFileId,
        contentHash: "hash123",
        status: "MODIFIED_LOCAL",
        rpyLabelCount: 1,
        dbLabelCount: 0,
      });

      const content = 'label start:\n    "Content"\n    return';

      const result = await syncLabelsFromGitLabFile(testGitlabFileId, content);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain("already in progress");

      await db
        .delete(projectFileSyncState)
        .where(eq(projectFileSyncState.projectFileId, testGitlabFileId));
    });
  });

  describe("syncLabelsFromGitLabFile - Orphan Cleanup", () => {
    it("should delete labels whose labels no longer exist", async () => {
      const content1 =
        'label start:\n    "Start"\n    return\nlabel chapter1:\n    "Chapter 1"\n    return';

      const result1 = await syncLabelsFromGitLabFile(
        testGitlabFileId,
        content1
      );

      expect(result1.labelsCreated).toBe(2);

      // Get label IDs
      const labels = await db
        .select()
        .from(labelsTable)
        .where(eq(labelsTable.projectFileId, testGitlabFileId));

      expect(labels).toHaveLength(2);

      // Update content to remove chapter1 label
      const content2 = 'label start:\n    "Start"\n    return';

      const result2 = await syncLabelsFromGitLabFile(
        testGitlabFileId,
        content2
      );

      expect(result2.success).toBe(true);
      expect(result2.labelsDeleted).toBe(1);

      // Verify only one label remains
      const remainingLabels = await db
        .select()
        .from(labelsTable)
        .where(
          and(
            eq(labelsTable.projectFileId, testGitlabFileId),
            isNull(labelsTable.deletedAt)
          )
        );

      expect(remainingLabels).toHaveLength(1);
      expect(remainingLabels[0].labelName).toBe("start");
    });

    it("should skip cleanup when skipCleanup option is true", async () => {
      const content1 =
        'label start:\n    "Start"\n    return\nlabel chapter1:\n    "Chapter 1"\n    return';

      const result1 = await syncLabelsFromGitLabFile(
        testGitlabFileId,
        content1
      );

      expect(result1.labelsCreated).toBe(2);

      // Update content to remove chapter1 label
      const content2 = 'label start:\n    "Start"\n    return';

      const result2 = await syncLabelsFromGitLabFile(
        testGitlabFileId,
        content2,
        {
          skipCleanup: true,
        }
      );

      expect(result2.success).toBe(true);
      expect(result2.labelsDeleted).toBe(0);

      // Both labels should still exist
      const labels = await db
        .select()
        .from(labelsTable)
        .where(eq(labelsTable.projectFileId, testGitlabFileId));

      expect(labels).toHaveLength(2);
    });
  });

  describe("syncLabelsFromGitLabFile - Error Handling", () => {
    it("should return error for empty content", async () => {
      const result = await syncLabelsFromGitLabFile(testGitlabFileId, "");

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain("empty");
    });

    it("should return error for content with no labels", async () => {
      const content = "# Just comments\n# No labels";

      const result = await syncLabelsFromGitLabFile(testGitlabFileId, content);

      expect(result.success).toBe(false);
      expect(result.errors[0].error).toContain("No labels found");
    });

    it("should return error for duplicate labels", async () => {
      const content =
        'label start:\n    "First"\nlabel start:\n    "Second"\n    return';

      const result = await syncLabelsFromGitLabFile(testGitlabFileId, content);

      expect(result.success).toBe(false);
      expect(result.errors[0].error).toContain("Duplicate labels");
    });

    it("should return error for SETTINGS file type", async () => {
      // Update file to SETTINGS type
      await db
        .update(projectFiles)
        .set({ fileType: "SETTINGS" })
        .where(eq(projectFiles.id, testGitlabFileId));

      const content = 'label start:\n    "Content"\n    return';

      const result = await syncLabelsFromGitLabFile(testGitlabFileId, content);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors[0].error).toContain("Invalid file type");
    });
  });

  describe("syncLabelsFromGitLabFile - Atomic Transactions", () => {
    it("should rollback entire transaction on error", async () => {
      // Create a scenario where sync might fail partway through
      // by using invalid content that parses but has issues
      const validContent = 'label start:\n    "Valid"\n    return';

      // First sync should succeed
      const result1 = await syncLabelsFromGitLabFile(
        testGitlabFileId,
        validContent
      );

      expect(result1.success).toBe(true);
      expect(result1.labelsCreated).toBe(1);

      // Get the label count
      const labelsBefore = await db
        .select()
        .from(labelsTable)
        .where(eq(labelsTable.projectFileId, testGitlabFileId));

      // Now try to sync with empty content (should fail)
      const result2 = await syncLabelsFromGitLabFile(testGitlabFileId, "");

      expect(result2.success).toBe(false);

      // Labels should remain unchanged (transaction rolled back)
      const labelsAfter = await db
        .select()
        .from(labelsTable)
        .where(eq(labelsTable.projectFileId, testGitlabFileId));

      expect(labelsAfter).toHaveLength(labelsBefore.length);
    });
  });

  describe("syncLabelsFromGitLabFile - Sync State Tracking", () => {
    it("should create sync state record on sync", async () => {
      const content = 'label start:\n    "Content"\n    return';

      await syncLabelsFromGitLabFile(testGitlabFileId, content);

      const syncStates = await db
        .select()
        .from(projectFileSyncState)
        .where(eq(projectFileSyncState.projectFileId, testGitlabFileId));

      expect(syncStates.length).toBeGreaterThanOrEqual(1);

      const latestState = syncStates[0];
      expect(latestState.status).toBe("SYNCED");
      expect(latestState.rpyLabelCount).toBe(1);
      expect(latestState.dbLabelCount).toBe(1);
    });

    it("should mark sync as failed on error", async () => {
      // Create a scenario where sync fails after sync state is created
      // Use invalid content that passes validation but causes other issues
      // Duplicate labels will fail validation after parsing and sync state creation
      const content =
        'label start:\n    "First"\nlabel start:\n    "Second"\n    return';

      const result = await syncLabelsFromGitLabFile(testGitlabFileId, content);

      expect(result.success).toBe(false);

      const syncStates = await db
        .select()
        .from(projectFileSyncState)
        .where(eq(projectFileSyncState.projectFileId, testGitlabFileId));

      expect(syncStates.length).toBeGreaterThanOrEqual(1);

      const latestState = syncStates[0];
      expect(latestState.status).toBe("CONFLICT");
      expect(latestState.errorMessage).not.toBeNull();
    });
  });

  describe("syncLabelsFromGitLabFile - Edge Cases", () => {
    it("should handle single label file", async () => {
      const content = 'label start:\n    "Only label"\n    return';

      const result = await syncLabelsFromGitLabFile(testGitlabFileId, content);

      expect(result.success).toBe(true);
      expect(result.labelsCreated).toBe(1);
    });

    it("should handle label with no dialogue", async () => {
      const content = "label start:\n    return";

      const result = await syncLabelsFromGitLabFile(testGitlabFileId, content);

      expect(result.success).toBe(true);
      expect(result.labelsCreated).toBe(1);
      expect(result.linesProcessed).toBe(0);
    });

    it("should handle file not found error", async () => {
      // Use a non-existent file ID
      const fakeFileId = "99999999-9999-9999-9999-999999999999";
      const content = 'label start:\n    "Content"\n    return';

      const result = await syncLabelsFromGitLabFile(fakeFileId, content);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
    });
  });
});
