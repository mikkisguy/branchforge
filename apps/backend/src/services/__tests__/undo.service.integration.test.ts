/**
 * Undo Service Integration Tests
 *
 * Tests for the undo/redo service against a real database.
 *
 * Prerequisites:
 * - DATABASE_URL_TEST environment variable must be set
 * - Test database must exist and have proper schema
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import { getDb } from "../../db/index.js";
import {
  users,
  projects,
  labels,
  labelDialogueVersions,
  type NewUser,
  type NewProject,
  type NewLabel,
} from "../../db/schema/index.js";
import { eq } from "drizzle-orm";
import {
  createDialogueSnapshot,
  getLabelVersions,
  restoreLabelVersion,
} from "../undo.service.js";
import { testEmail, testUuid } from "../../utils/test-ids.js";

describe("UndoService (Integration)", () => {
  let db: ReturnType<typeof getDb>;

  beforeAll(async () => {
    db = getDb();
  });

  // Test fixtures
  const testUserId = testUuid("03000000", 1);
  const testProjectId = testUuid("13000000", 1);
  const testLabelId = testUuid("13000002", 1);

  const testUser: NewUser = {
    id: testUserId,
    email: testEmail("undo-service", "user"),
    passwordHash: "hashed_password",
    role: "OWNER",
  };

  const testProject: NewProject = {
    id: testProjectId,
    userId: testUserId,
    name: "Test Project",
    description: "A project for undo service tests",
    maxMeterDelta: 10,
  };

  const testLabel: NewLabel = {
    id: testLabelId,
    projectId: testProjectId,
    title: "test_label",
    labelNumber: 1,
    sequenceOrder: 0,
    visibility: "EXCLUSIVE",
    status: "DRAFT",
    prerequisites: {},
    effects: {},
    createdBy: testUserId,
    updatedBy: testUserId,
  };

  const mockDialogue = [
    { speakerId: "char-1", text: "Hello" },
    { speakerId: null, text: "Narration" },
  ];

  const mockDialogue2 = [
    { speakerId: "char-1", text: "Goodbye" },
    { speakerId: null, text: "Different narration" },
  ];

  // Helper to clean up all test data (in correct order due to foreign keys)
  async function cleanupTestData() {
    await db
      .delete(labelDialogueVersions)
      .where(eq(labelDialogueVersions.labelId, testLabelId));
    await db.delete(labels).where(eq(labels.id, testLabelId));
    await db.delete(projects).where(eq(projects.id, testProjectId));
    await db.delete(users).where(eq(users.id, testUserId));
  }

  // Helper to set up test data
  async function setupTestData() {
    await db.insert(users).values(testUser);
    await db.insert(projects).values(testProject);
    await db.insert(labels).values(testLabel);
  }

  beforeEach(async () => {
    await cleanupTestData();
    await setupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe("createDialogueSnapshot", () => {
    it("should create a snapshot when content has changed", async () => {
      const result = await createDialogueSnapshot(
        testLabelId,
        mockDialogue,
        testUserId
      );

      expect(result).toBe(true);

      // Verify version was created
      const versions = await db
        .select()
        .from(labelDialogueVersions)
        .where(eq(labelDialogueVersions.labelId, testLabelId));

      expect(versions).toHaveLength(1);
      expect(versions[0].versionNumber).toBe(1);
      expect(versions[0].dialogueData).toEqual(mockDialogue);
      expect(versions[0].createdBy).toBe(testUserId);
    });

    it("should skip snapshot when content hash matches latest version", async () => {
      // Create first snapshot
      await createDialogueSnapshot(testLabelId, mockDialogue, testUserId);

      // Try to create same snapshot again
      const result = await createDialogueSnapshot(
        testLabelId,
        mockDialogue,
        testUserId
      );

      expect(result).toBe(false);

      // Verify only one version exists
      const versions = await db
        .select()
        .from(labelDialogueVersions)
        .where(eq(labelDialogueVersions.labelId, testLabelId));

      expect(versions).toHaveLength(1);
    });

    it("should create new snapshot when content differs", async () => {
      // Create first snapshot
      await createDialogueSnapshot(testLabelId, mockDialogue, testUserId);

      // Create second snapshot with different content
      const result = await createDialogueSnapshot(
        testLabelId,
        mockDialogue2,
        testUserId
      );

      expect(result).toBe(true);

      // Verify two versions exist
      const versions = await db
        .select()
        .from(labelDialogueVersions)
        .where(eq(labelDialogueVersions.labelId, testLabelId))
        .orderBy(labelDialogueVersions.versionNumber);

      expect(versions).toHaveLength(2);
      expect(versions[0].dialogueData).toEqual(mockDialogue);
      expect(versions[1].dialogueData).toEqual(mockDialogue2);
      expect(versions[1].versionNumber).toBe(2);
    });

    it("should delete old versions when exceeding max limit (10 versions)", async () => {
      // Create 10 versions (at max limit)
      for (let i = 0; i < 10; i++) {
        await createDialogueSnapshot(
          testLabelId,
          [{ speakerId: null, text: `Version ${i}` }],
          testUserId
        );
      }

      // Create 11th version (should trigger deletion of old versions)
      await createDialogueSnapshot(
        testLabelId,
        [{ speakerId: null, text: "Version 10" }],
        testUserId
      );

      // Verify only 10 versions exist (old ones deleted)
      const versions = await db
        .select()
        .from(labelDialogueVersions)
        .where(eq(labelDialogueVersions.labelId, testLabelId));

      expect(versions).toHaveLength(10);

      // Verify the oldest version has versionNumber 2 (1 was deleted)
      const versionNumbers = versions
        .map((v) => v.versionNumber)
        .sort((a, b) => a - b);
      expect(versionNumbers[0]).toBe(2);
      expect(versionNumbers[9]).toBe(11);
    });

    it("should increment version number correctly", async () => {
      // Create first version
      await createDialogueSnapshot(testLabelId, mockDialogue, testUserId);

      // Create second version
      await createDialogueSnapshot(testLabelId, mockDialogue2, testUserId);

      // Create third version
      await createDialogueSnapshot(
        testLabelId,
        [{ speakerId: null, text: "Third version" }],
        testUserId
      );

      const versions = await db
        .select()
        .from(labelDialogueVersions)
        .where(eq(labelDialogueVersions.labelId, testLabelId))
        .orderBy(labelDialogueVersions.versionNumber);

      expect(versions).toHaveLength(3);
      expect(versions[0].versionNumber).toBe(1);
      expect(versions[1].versionNumber).toBe(2);
      expect(versions[2].versionNumber).toBe(3);
    });
  });

  describe("getLabelVersions", () => {
    it("should return empty array when no versions exist", async () => {
      const versions = await getLabelVersions(testLabelId);

      expect(versions).toEqual([]);
    });

    it("should return versions ordered by creation date (newest first)", async () => {
      // Create three versions with a small delay to ensure different timestamps
      await createDialogueSnapshot(
        testLabelId,
        [{ speakerId: null, text: "First" }],
        testUserId
      );
      await new Promise((resolve) => setTimeout(resolve, 10));
      await createDialogueSnapshot(
        testLabelId,
        [{ speakerId: null, text: "Second" }],
        testUserId
      );
      await new Promise((resolve) => setTimeout(resolve, 10));
      await createDialogueSnapshot(
        testLabelId,
        [{ speakerId: null, text: "Third" }],
        testUserId
      );

      const versions = await getLabelVersions(testLabelId);

      expect(versions).toHaveLength(3);
      // Should be ordered newest first (by createdAt, then versionNumber)
      expect(versions[0].versionNumber).toBe(3);
      expect(versions[1].versionNumber).toBe(2);
      expect(versions[2].versionNumber).toBe(1);
    });

    it("should include version metadata", async () => {
      await createDialogueSnapshot(testLabelId, mockDialogue, testUserId);

      const versions = await getLabelVersions(testLabelId);

      expect(versions).toHaveLength(1);
      expect(versions[0]).toMatchObject({
        id: expect.any(String),
        versionNumber: 1,
        contentHash: expect.any(String),
        createdAt: expect.any(Date),
      });
      expect("dialogueData" in versions[0]).toBe(false); // Should not include full data
    });
  });

  describe("restoreLabelVersion", () => {
    it("should restore dialogue data from version", async () => {
      await createDialogueSnapshot(testLabelId, mockDialogue, testUserId);

      const versions = await getLabelVersions(testLabelId);
      const versionId = versions[0].id;

      const dialogue = await restoreLabelVersion(versionId);

      expect(dialogue).toEqual(mockDialogue);
    });

    it("should throw error when version not found", async () => {
      // Use a valid UUID format that won't exist in the database
      await expect(
        restoreLabelVersion("00000000-0000-4000-8000-000000000000")
      ).rejects.toThrow("Version not found");
    });

    it("should restore correct dialogue from multiple versions", async () => {
      // Create multiple versions
      await createDialogueSnapshot(testLabelId, mockDialogue, testUserId);
      await createDialogueSnapshot(testLabelId, mockDialogue2, testUserId);

      const versions = await getLabelVersions(testLabelId);

      // Restore first version
      const dialogue1 = await restoreLabelVersion(versions[1].id);
      expect(dialogue1).toEqual(mockDialogue);

      // Restore second version
      const dialogue2 = await restoreLabelVersion(versions[0].id);
      expect(dialogue2).toEqual(mockDialogue2);
    });

    it("should restore empty dialogue array", async () => {
      const emptyDialogue: Array<{ speakerId: string | null; text: string }> =
        [];
      await createDialogueSnapshot(testLabelId, emptyDialogue, testUserId);

      const versions = await getLabelVersions(testLabelId);
      const dialogue = await restoreLabelVersion(versions[0].id);

      expect(dialogue).toEqual([]);
    });
  });
});
