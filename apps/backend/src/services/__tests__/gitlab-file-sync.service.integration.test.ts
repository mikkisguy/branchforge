/**
 * GitLab File Sync Service Integration Tests
 *
 * Tests for reliable sync between gitlab_files and scenes/scene_lines.
 *
 * Prerequisites:
 * - DATABASE_URL_TEST environment variable must be set
 * - Test database must exist and have proper schema
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from "vitest";
import { getDb } from "../../db/index.js";
import {
  users,
  projects,
  scenes as scenesTable,
  sceneLines,
  gitlabFiles,
  gitlabFileSyncState,
} from "../../db/schema/index.js";
import { eq } from "drizzle-orm";
import {
  syncScenesFromGitLabFile,
  calculateContentHash,
  validateRPYContent,
  validateFileType,
  checkInProgressSync,
  checkContentAlreadySynced,
  createSyncState,
  completeSyncState,
  type SyncScenesResult,
} from "../gitlab-file-sync.service.js";
import {
  parseRPYFileWithLabels,
  type ParsedRPYFileWithLabels,
} from "../rpy-parser.service.js";

describe("GitLabFileSyncService (Integration)", () => {
  let db: ReturnType<typeof getDb>;

  beforeAll(async () => {
    db = getDb();
  });

  // Test fixtures with hardcoded UUIDs
  const testUserId = "00000000-0000-0000-0000-000000000001";
  const testProjectId = "10000000-0000-0000-0000-000000000001";
  const testGitlabFileId = "50000000-0000-0000-0000-000000000001";
  const testBranch = "main";

  const testUser = {
    id: testUserId,
    email: "owner@test.com",
    passwordHash: "hashed_password",
    role: "OWNER",
  };

  const testProject = {
    id: testProjectId,
    userId: testUserId,
    name: "Test Project",
    type: "PREQUEL",
    description: "A test project",
    maxMeterDelta: 10,
  };

  const testGitlabFile = {
    id: testGitlabFileId,
    projectId: testProjectId,
    filePath: "game/script.rpy",
    fileType: "STORY" as const,
    content: 'label start:\n    "Content"\n    return',
    contentHash: null,
  };

  // Helper to clean up all test data
  async function cleanupTestData() {
    await db.delete(gitlabFileSyncState).where(eq(gitlabFileSyncState.gitlabFileId, testGitlabFileId));
    await db.delete(sceneLines);
    await db.delete(scenesTable);
    // Delete and reinsert gitlab file to ensure clean state
    await db.delete(gitlabFiles).where(eq(gitlabFiles.id, testGitlabFileId));
    await db.delete(projects).where(eq(projects.id, testProjectId));
    await db.delete(users).where(eq(users.id, testUserId));
  }

  // Helper to set up test data
  async function setupTestData(includeGitlabFile = true) {
    await db.insert(users).values(testUser);
    await db.insert(projects).values(testProject);
    if (includeGitlabFile) {
      await db.insert(gitlabFiles).values(testGitlabFile);
    }
  }

  // Helper to clean up additional scenes
  async function cleanupAdditionalData(sceneIds: string[]) {
    for (const sceneId of sceneIds) {
      await db.delete(sceneLines).where(eq(sceneLines.sceneId, sceneId));
      await db.delete(scenesTable).where(eq(scenesTable.id, sceneId));
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
      const hash1 = calculateContentHash("label start:\n    'Hello'\n    return");
      const hash2 = calculateContentHash("label start:\n    'World'\n    return");

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
        "RPY content is empty",
      );
    });

    it("should throw error for whitespace-only content", () => {
      const content = "   \n  \n  ";
      const parsed = parseRPYFileWithLabels(content);

      expect(() => validateRPYContent(content, parsed)).toThrow(
        "RPY content is empty",
      );
    });

    it("should throw error for content with no labels", () => {
      const content = "# Just a comment\n# No labels here";
      const parsed = parseRPYFileWithLabels(content);

      expect(() => validateRPYContent(content, parsed)).toThrow(
        "No labels found in RPY content",
      );
    });

    it("should throw error for duplicate labels", () => {
      const content = 'label start:\n    "First"\nlabel start:\n    "Second"\n    return';
      const parsed = parseRPYFileWithLabels(content);

      expect(() => validateRPYContent(content, parsed)).toThrow(
        "Duplicate labels found",
      );
    });

    it("should detect case-insensitive duplicate labels", () => {
      const content = 'label start:\n    "First"\nlabel START:\n    "Second"\n    return';
      const parsed = parseRPYFileWithLabels(content);

      expect(() => validateRPYContent(content, parsed)).toThrow(
        "Duplicate labels found",
      );
    });
  });

  describe("validateFileType", () => {
    it("should pass for STORY type", () => {
      expect(() => validateFileType("STORY")).not.toThrow();
    });

    it("should throw error for SETTINGS type", () => {
      expect(() => validateFileType("SETTINGS")).toThrow(
        "Invalid file type for scene sync",
      );
    });
  });

  describe("checkInProgressSync", () => {
    it("should return false when no sync in progress", async () => {
      const hasInProgress = await checkInProgressSync(testGitlabFileId);
      expect(hasInProgress).toBe(false);
    });

    it("should return true when sync is in progress", async () => {
      await db.insert(gitlabFileSyncState).values({
        id: "60000000-0000-0000-0000-000000000001",
        gitlabFileId: testGitlabFileId,
        contentHash: "hash123",
        status: "in_progress",
        labelCount: 1,
        sceneCount: 0,
      });

      const hasInProgress = await checkInProgressSync(testGitlabFileId);
      expect(hasInProgress).toBe(true);

      await db
        .delete(gitlabFileSyncState)
        .where(eq(gitlabFileSyncState.gitlabFileId, testGitlabFileId));
    });

    it("should return false when sync is completed", async () => {
      await db.insert(gitlabFileSyncState).values({
        id: "60000000-0000-0000-0000-000000000001",
        gitlabFileId: testGitlabFileId,
        contentHash: "hash123",
        status: "completed",
        labelCount: 1,
        sceneCount: 1,
        completedAt: new Date(),
      });

      const hasInProgress = await checkInProgressSync(testGitlabFileId);
      expect(hasInProgress).toBe(false);

      await db
        .delete(gitlabFileSyncState)
        .where(eq(gitlabFileSyncState.gitlabFileId, testGitlabFileId));
    });
  });

  describe("checkContentAlreadySynced", () => {
    it("should return false when no sync has happened", async () => {
      const contentHash = "hash123";
      const alreadySynced = await checkContentAlreadySynced(
        testGitlabFileId,
        contentHash,
      );
      expect(alreadySynced).toBe(false);
    });

    it("should return false when only failed sync exists", async () => {
      const contentHash = "hash123";
      await db.insert(gitlabFileSyncState).values({
        id: "60000000-0000-0000-0000-000000000001",
        gitlabFileId: testGitlabFileId,
        contentHash,
        status: "failed",
        labelCount: 1,
        sceneCount: 0,
        completedAt: new Date(),
        errorMessage: "Test error",
      });

      const alreadySynced = await checkContentAlreadySynced(
        testGitlabFileId,
        contentHash,
      );
      expect(alreadySynced).toBe(false);

      await db
        .delete(gitlabFileSyncState)
        .where(eq(gitlabFileSyncState.gitlabFileId, testGitlabFileId));
    });

    it("should return true when content was already synced", async () => {
      const contentHash = "hash123";
      await db.insert(gitlabFileSyncState).values({
        id: "60000000-0000-0000-0000-000000000001",
        gitlabFileId: testGitlabFileId,
        contentHash,
        status: "completed",
        labelCount: 1,
        sceneCount: 1,
        completedAt: new Date(),
      });

      const alreadySynced = await checkContentAlreadySynced(
        testGitlabFileId,
        contentHash,
      );
      expect(alreadySynced).toBe(true);

      await db
        .delete(gitlabFileSyncState)
        .where(eq(gitlabFileSyncState.gitlabFileId, testGitlabFileId));
    });

    it("should return false for different content hash", async () => {
      await db.insert(gitlabFileSyncState).values({
        id: "60000000-0000-0000-0000-000000000001",
        gitlabFileId: testGitlabFileId,
        contentHash: "hash123",
        status: "completed",
        labelCount: 1,
        sceneCount: 1,
        completedAt: new Date(),
      });

      const alreadySynced = await checkContentAlreadySynced(
        testGitlabFileId,
        "differenthash",
      );
      expect(alreadySynced).toBe(false);

      await db
        .delete(gitlabFileSyncState)
        .where(eq(gitlabFileSyncState.gitlabFileId, testGitlabFileId));
    });
  });

  describe("createSyncState and completeSyncState", () => {
    it("should create sync state record", async () => {
      const contentHash = "hash123";
      const labelCount = 3;

      const syncStateId = await createSyncState(
        testGitlabFileId,
        contentHash,
        labelCount,
      );

      expect(syncStateId).toBeDefined();

      const [syncState] = await db
        .select()
        .from(gitlabFileSyncState)
        .where(eq(gitlabFileSyncState.id, syncStateId))
        .limit(1);

      expect(syncState).toBeDefined();
      expect(syncState.gitlabFileId).toBe(testGitlabFileId);
      expect(syncState.contentHash).toBe(contentHash);
      expect(syncState.status).toBe("in_progress");
      expect(syncState.labelCount).toBe(labelCount);
      expect(syncState.sceneCount).toBe(0);
      expect(syncState.completedAt).toBeNull();

      await db
        .delete(gitlabFileSyncState)
        .where(eq(gitlabFileSyncState.id, syncStateId));
    });

    it("should complete sync state successfully", async () => {
      const [syncState] = await db
        .insert(gitlabFileSyncState)
        .values({
          id: "60000000-0000-0000-0000-000000000001",
          gitlabFileId: testGitlabFileId,
          contentHash: "hash123",
          status: "in_progress",
          labelCount: 1,
          sceneCount: 0,
        })
        .returning();

      await completeSyncState(syncState.id, true, 5);

      const [updated] = await db
        .select()
        .from(gitlabFileSyncState)
        .where(eq(gitlabFileSyncState.id, syncState.id))
        .limit(1);

      expect(updated.status).toBe("completed");
      expect(updated.sceneCount).toBe(5);
      expect(updated.completedAt).not.toBeNull();
      expect(updated.errorMessage).toBeNull();

      await db
        .delete(gitlabFileSyncState)
        .where(eq(gitlabFileSyncState.id, syncState.id));
    });

    it("should complete sync state with failure", async () => {
      const [syncState] = await db
        .insert(gitlabFileSyncState)
        .values({
          id: "60000000-0000-0000-0000-000000000001",
          gitlabFileId: testGitlabFileId,
          contentHash: "hash123",
          status: "in_progress",
          labelCount: 1,
          sceneCount: 0,
        })
        .returning();

      await completeSyncState(
        syncState.id,
        false,
        undefined,
        "Sync failed",
      );

      const [updated] = await db
        .select()
        .from(gitlabFileSyncState)
        .where(eq(gitlabFileSyncState.id, syncState.id))
        .limit(1);

      expect(updated.status).toBe("failed");
      expect(updated.sceneCount).toBe(0);
      expect(updated.completedAt).not.toBeNull();
      expect(updated.errorMessage).toBe("Sync failed");

      await db
        .delete(gitlabFileSyncState)
        .where(eq(gitlabFileSyncState.id, syncState.id));
    });
  });

  describe("syncScenesFromGitLabFile - Happy Path", () => {
    it("should create scenes from RPY content", async () => {
      const content =
        'label start:\n    "First line"\n    "Second line"\n    return';

      const result = await syncScenesFromGitLabFile(testGitlabFileId, content);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(false);
      expect(result.scenesCreated).toBe(1);
      expect(result.scenesUpdated).toBe(0);
      expect(result.scenesDeleted).toBe(0);
      expect(result.linesProcessed).toBe(2);
      expect(result.errors).toHaveLength(0);

      // Verify scene was created
      const [scene] = await db
        .select()
        .from(scenesTable)
        .where(eq(scenesTable.labelName, "start"))
        .limit(1);

      expect(scene).toBeDefined();
      expect(scene?.title).toBe("start");
      expect(scene?.gitlabFileId).toBe(testGitlabFileId);
      expect(scene?.labelName).toBe("start");
      expect(scene?.labelPosition).toBe(0);

      // Verify lines were created
      const lines = await db
        .select()
        .from(sceneLines)
        .where(eq(sceneLines.sceneId, scene!.id));

      expect(lines).toHaveLength(2);
      expect(lines[0].content).toBe("First line");
      expect(lines[0].sequence).toBe(1);
      expect(lines[1].content).toBe("Second line");
      expect(lines[1].sequence).toBe(2);
    });

    it("should create multiple scenes from multiple labels", async () => {
      const content =
        'label start:\n    "Start"\n    return\nlabel chapter1:\n    "Chapter 1"\n    return';

      const result = await syncScenesFromGitLabFile(testGitlabFileId, content);

      expect(result.success).toBe(true);
      expect(result.scenesCreated).toBe(2);
      expect(result.scenesUpdated).toBe(0);

      // Verify both scenes were created
      const scenes = await db
        .select()
        .from(scenesTable)
        .where(eq(scenesTable.gitlabFileId, testGitlabFileId));

      expect(scenes).toHaveLength(2);
      expect(scenes.map((s) => s.labelName).sort()).toEqual(["chapter1", "start"]);
    });

    it("should update existing scenes", async () => {
      const content1 = 'label start:\n    "Original"\n    return';

      // First sync creates the scene
      const result1 = await syncScenesFromGitLabFile(
        testGitlabFileId,
        content1,
      );
      expect(result1.scenesCreated).toBe(1);

      // Get scene ID
      const [scene] = await db
        .select()
        .from(scenesTable)
        .where(eq(scenesTable.labelName, "start"))
        .limit(1);

      // Update content
      const content2 = 'label start:\n    "Updated"\n    "Second line"\n    return';

      const result2 = await syncScenesFromGitLabFile(
        testGitlabFileId,
        content2,
      );

      expect(result2.success).toBe(true);
      expect(result2.scenesCreated).toBe(0);
      expect(result2.scenesUpdated).toBe(1);
      expect(result2.linesProcessed).toBe(2);

      // Verify lines were updated
      const lines = await db
        .select()
        .from(sceneLines)
        .where(eq(sceneLines.sceneId, scene!.id));

      expect(lines).toHaveLength(2);
      expect(lines[0].content).toBe("Updated");
      expect(lines[1].content).toBe("Second line");
    });
  });

  describe("syncScenesFromGitLabFile - Idempotency", () => {
    it("should skip sync if content already synced", async () => {
      const content = 'label start:\n    "Content"\n    return';

      const result1 = await syncScenesFromGitLabFile(
        testGitlabFileId,
        content,
      );

      expect(result1.success).toBe(true);
      expect(result1.skipped).toBe(false);
      expect(result1.scenesCreated).toBe(1);

      // Second sync with same content should be skipped
      const result2 = await syncScenesFromGitLabFile(
        testGitlabFileId,
        content,
      );

      expect(result2.success).toBe(true);
      expect(result2.skipped).toBe(true);
      expect(result2.scenesCreated).toBe(0);
      expect(result2.scenesUpdated).toBe(0);
    });

    it("should sync if content changed", async () => {
      const content1 = 'label start:\n    "Original"\n    return';

      const result1 = await syncScenesFromGitLabFile(
        testGitlabFileId,
        content1,
      );

      expect(result1.success).toBe(true);
      expect(result1.skipped).toBe(false);

      const content2 = 'label start:\n    "Changed"\n    return';

      const result2 = await syncScenesFromGitLabFile(
        testGitlabFileId,
        content2,
      );

      expect(result2.success).toBe(true);
      expect(result2.skipped).toBe(false);
      expect(result2.scenesUpdated).toBe(1);
    });
  });

  describe("syncScenesFromGitLabFile - Concurrent Sync Prevention", () => {
    it("should return error when sync is already in progress", async () => {
      // Create an in-progress sync state
      await db.insert(gitlabFileSyncState).values({
        id: "60000000-0000-0000-0000-000000000001",
        gitlabFileId: testGitlabFileId,
        contentHash: "hash123",
        status: "in_progress",
        labelCount: 1,
        sceneCount: 0,
      });

      const content = 'label start:\n    "Content"\n    return';

      const result = await syncScenesFromGitLabFile(
        testGitlabFileId,
        content,
      );

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain("already in progress");

      await db
        .delete(gitlabFileSyncState)
        .where(eq(gitlabFileSyncState.gitlabFileId, testGitlabFileId));
    });
  });

  describe("syncScenesFromGitLabFile - Orphan Cleanup", () => {
    it("should delete scenes whose labels no longer exist", async () => {
      const content1 =
        'label start:\n    "Start"\n    return\nlabel chapter1:\n    "Chapter 1"\n    return';

      const result1 = await syncScenesFromGitLabFile(
        testGitlabFileId,
        content1,
      );

      expect(result1.scenesCreated).toBe(2);

      // Get scene IDs
      const scenes = await db
        .select()
        .from(scenesTable)
        .where(eq(scenesTable.gitlabFileId, testGitlabFileId));

      expect(scenes).toHaveLength(2);

      // Update content to remove chapter1 label
      const content2 = 'label start:\n    "Start"\n    return';

      const result2 = await syncScenesFromGitLabFile(
        testGitlabFileId,
        content2,
      );

      expect(result2.success).toBe(true);
      expect(result2.scenesDeleted).toBe(1);

      // Verify only one scene remains
      const remainingScenes = await db
        .select()
        .from(scenesTable)
        .where(eq(scenesTable.gitlabFileId, testGitlabFileId));

      expect(remainingScenes).toHaveLength(1);
      expect(remainingScenes[0].labelName).toBe("start");
    });

    it("should skip cleanup when skipCleanup option is true", async () => {
      const content1 =
        'label start:\n    "Start"\n    return\nlabel chapter1:\n    "Chapter 1"\n    return';

      const result1 = await syncScenesFromGitLabFile(
        testGitlabFileId,
        content1,
      );

      expect(result1.scenesCreated).toBe(2);

      // Update content to remove chapter1 label
      const content2 = 'label start:\n    "Start"\n    return';

      const result2 = await syncScenesFromGitLabFile(
        testGitlabFileId,
        content2,
        { skipCleanup: true },
      );

      expect(result2.success).toBe(true);
      expect(result2.scenesDeleted).toBe(0);

      // Both scenes should still exist
      const scenes = await db
        .select()
        .from(scenesTable)
        .where(eq(scenesTable.gitlabFileId, testGitlabFileId));

      expect(scenes).toHaveLength(2);
    });
  });

  describe("syncScenesFromGitLabFile - Error Handling", () => {
    it("should return error for empty content", async () => {
      const result = await syncScenesFromGitLabFile(
        testGitlabFileId,
        "",
      );

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain("empty");
    });

    it("should return error for content with no labels", async () => {
      const content = "# Just comments\n# No labels";

      const result = await syncScenesFromGitLabFile(
        testGitlabFileId,
        content,
      );

      expect(result.success).toBe(false);
      expect(result.errors[0].error).toContain("No labels found");
    });

    it("should return error for duplicate labels", async () => {
      const content = 'label start:\n    "First"\nlabel start:\n    "Second"\n    return';

      const result = await syncScenesFromGitLabFile(
        testGitlabFileId,
        content,
      );

      expect(result.success).toBe(false);
      expect(result.errors[0].error).toContain("Duplicate labels");
    });

    it("should return error for SETTINGS file type", async () => {
      // Update file to SETTINGS type
      await db
        .update(gitlabFiles)
        .set({ fileType: "SETTINGS" })
        .where(eq(gitlabFiles.id, testGitlabFileId));

      const content = 'label start:\n    "Content"\n    return';

      const result = await syncScenesFromGitLabFile(
        testGitlabFileId,
        content,
      );

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors[0].error).toContain("Invalid file type");
    });
  });

  describe("syncScenesFromGitLabFile - Atomic Transactions", () => {
    it("should rollback entire transaction on error", async () => {
      // Create a scenario where sync might fail partway through
      // by using invalid content that parses but has issues
      const validContent = 'label start:\n    "Valid"\n    return';

      // First sync should succeed
      const result1 = await syncScenesFromGitLabFile(
        testGitlabFileId,
        validContent,
      );

      expect(result1.success).toBe(true);
      expect(result1.scenesCreated).toBe(1);

      // Get the scene count
      const scenesBefore = await db
        .select()
        .from(scenesTable)
        .where(eq(scenesTable.gitlabFileId, testGitlabFileId));

      // Now try to sync with empty content (should fail)
      const result2 = await syncScenesFromGitLabFile(
        testGitlabFileId,
        "",
      );

      expect(result2.success).toBe(false);

      // Scenes should remain unchanged (transaction rolled back)
      const scenesAfter = await db
        .select()
        .from(scenesTable)
        .where(eq(scenesTable.gitlabFileId, testGitlabFileId));

      expect(scenesAfter).toHaveLength(scenesBefore.length);
    });
  });

  describe("syncScenesFromGitLabFile - Sync State Tracking", () => {
    it("should create sync state record on sync", async () => {
      const content = 'label start:\n    "Content"\n    return';

      await syncScenesFromGitLabFile(testGitlabFileId, content);

      const syncStates = await db
        .select()
        .from(gitlabFileSyncState)
        .where(eq(gitlabFileSyncState.gitlabFileId, testGitlabFileId));

      expect(syncStates.length).toBeGreaterThanOrEqual(1);

      const latestState = syncStates[0];
      expect(latestState.status).toBe("completed");
      expect(latestState.labelCount).toBe(1);
      expect(latestState.sceneCount).toBe(1);
    });

    it("should mark sync as failed on error", async () => {
      // Create a scenario where sync fails after sync state is created
      // Use invalid content that passes validation but causes other issues
      // Duplicate labels will fail validation after parsing and sync state creation
      const content = 'label start:\n    "First"\nlabel start:\n    "Second"\n    return';

      const result = await syncScenesFromGitLabFile(
        testGitlabFileId,
        content,
      );

      expect(result.success).toBe(false);

      const syncStates = await db
        .select()
        .from(gitlabFileSyncState)
        .where(eq(gitlabFileSyncState.gitlabFileId, testGitlabFileId));

      expect(syncStates.length).toBeGreaterThanOrEqual(1);

      const latestState = syncStates[0];
      expect(latestState.status).toBe("failed");
      expect(latestState.errorMessage).not.toBeNull();
    });
  });

  describe("syncScenesFromGitLabFile - Edge Cases", () => {
    it("should handle single label file", async () => {
      const content = 'label start:\n    "Only label"\n    return';

      const result = await syncScenesFromGitLabFile(
        testGitlabFileId,
        content,
      );

      expect(result.success).toBe(true);
      expect(result.scenesCreated).toBe(1);
    });

    it("should handle label with no dialogue", async () => {
      const content = "label start:\n    return";

      const result = await syncScenesFromGitLabFile(
        testGitlabFileId,
        content,
      );

      expect(result.success).toBe(true);
      expect(result.scenesCreated).toBe(1);
      expect(result.linesProcessed).toBe(0);
    });

    it("should handle file not found error", async () => {
      // Use a non-existent file ID
      const fakeFileId = "99999999-9999-9999-9999-999999999999";
      const content = 'label start:\n    "Content"\n    return';

      const result = await syncScenesFromGitLabFile(
        fakeFileId,
        content,
      );

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
    });
  });
});
