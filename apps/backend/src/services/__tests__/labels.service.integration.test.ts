/**
 * Labels Service Integration Tests
 *
 * Tests for the labels service against a real database.
 * These tests cover complex queries with joins that are difficult to mock.
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
  projectUsers,
  labels,
  labelLines,
  characters,
  routeConfigs,
  projectFiles,
  type NewUser,
  type NewProject,
  type NewLabel,
  type NewLabelLine,
  type NewCharacter,
  type NewRouteConfig,
  type NewProjectFile,
} from "../../db/schema/index.js";
import { eq, inArray } from "drizzle-orm";
import {
  listLabels,
  getLabel,
  createLabel,
  updateLabel,
  deleteLabel,
} from "../labels.service.js";
import { testEmail, testUuid } from "../../utils/test-ids.js";
import { calculateContentHash } from "../../lib/hash.js";

describe("LabelsService (Integration)", () => {
  let db: ReturnType<typeof getDb>;

  beforeAll(async () => {
    db = getDb();
  });

  // Test fixtures
  const testUserId = testUuid("03000000", 1);
  const otherUserId = testUuid("03000000", 2);
  const thirdUserId = testUuid("03000000", 3);

  const testUser: NewUser = {
    id: testUserId,
    email: testEmail("labels-service", "owner"),
    passwordHash: "hashed_password",
    role: "OWNER",
  };

  const otherUser: NewUser = {
    id: otherUserId,
    email: testEmail("labels-service", "other"),
    passwordHash: "hashed_password",
    role: "OWNER",
  };

  const ownedProject: NewProject = {
    id: testUuid("13000000", 1),
    userId: testUserId,
    name: "Owned Project",
    description: "A project owned by the user",
    maxStatDelta: 10,
    source: "ZIP",
  };

  const sharedProject: NewProject = {
    id: testUuid("13000000", 2),
    userId: otherUserId,
    name: "Shared Project",
    description: "A project shared with the user",
    maxStatDelta: 15,
    source: "ZIP",
  };

  const routeConfig1: NewRouteConfig = {
    id: testUuid("13000001", 1),
    projectId: ownedProject.id!,
    routeKey: "common",
    routeName: "Common Route",
    jumpPrefix: "common_",
    sortOrder: 0,
    isShared: true,
  };

  const routeConfig2: NewRouteConfig = {
    id: testUuid("13000001", 2),
    projectId: ownedProject.id!,
    routeKey: "eileen",
    routeName: "Eileen Route",
    jumpPrefix: "a_",
    sortOrder: 1,
    isShared: false,
  };

  const defaultProjectFile: NewProjectFile = {
    id: testUuid("13000001", 3),
    projectId: ownedProject.id!,
    source: "ZIP",
    filePath: "labels/test.rpy",
    fileType: "STORY",
    content: 'label start:\n    "Hello"',
    contentHash: calculateContentHash('label start:\n    "Hello"'),
  };

  const sharedProjectFile: NewProjectFile = {
    id: testUuid("13000001", 4),
    projectId: sharedProject.id!,
    source: "ZIP",
    filePath: "labels/shared.rpy",
    fileType: "STORY",
    content: 'label start:\n    "Shared"',
    contentHash: calculateContentHash('label start:\n    "Shared"'),
  };

  // Helper to clean up all test data in reverse dependency order
  async function cleanupTestData() {
    const testUserIds = [testUserId, otherUserId, thirdUserId];
    const projectIds = [ownedProject.id!, sharedProject.id!];

    // Delete in reverse dependency order
    await db
      .delete(labelLines)
      .where(
        inArray(
          labelLines.labelId,
          db
            .select({ id: labels.id })
            .from(labels)
            .where(inArray(labels.projectId, projectIds))
        )
      );
    await db.delete(labels).where(inArray(labels.projectId, projectIds));
    await db
      .delete(characters)
      .where(inArray(characters.projectId, projectIds));
    await db
      .delete(routeConfigs)
      .where(inArray(routeConfigs.projectId, projectIds));
    await db
      .delete(projectFiles)
      .where(inArray(projectFiles.projectId, projectIds));
    await db
      .delete(projectUsers)
      .where(inArray(projectUsers.userId, testUserIds));
    await db.delete(projects).where(inArray(projects.id, projectIds));
    await db.delete(users).where(inArray(users.id, testUserIds));
  }

  // Helper to set up test data
  async function setupTestData() {
    // Insert users
    await db.insert(users).values([testUser, otherUser]);

    // Insert projects
    await db.insert(projects).values([ownedProject, sharedProject]);

    // Insert route configs
    await db.insert(routeConfigs).values([routeConfig1, routeConfig2]);

    // Insert project files
    await db
      .insert(projectFiles)
      .values([defaultProjectFile, sharedProjectFile]);
  }

  beforeEach(async () => {
    await cleanupTestData();
    await setupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe("listLabels", () => {
    it("should return empty array when project has no labels", async () => {
      const result = await listLabels(ownedProject.id!, testUserId);
      expect(result).toEqual([]);
    });

    it("should return list of labels for a project", async () => {
      const testLabel: NewLabel = {
        id: testUuid("13000002", 1),
        projectId: ownedProject.id!,
        projectFileId: defaultProjectFile.id!,
        title: "chapter1_label1",
        groupType: "act",
        groupValue: "I",
        labelNumber: 1,
        sequenceOrder: 0,
        route: "common",
        visibility: "EXCLUSIVE",
        status: "DRAFT",
        conditions: {},
        effects: {},
        createdBy: testUserId,
        updatedBy: testUserId,
      };

      await db.insert(labels).values(testLabel);

      const result = await listLabels(ownedProject.id!, testUserId);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: testLabel.id,
        projectId: ownedProject.id,
        title: "chapter1_label1",
        groupType: "act",
        groupValue: "I",
        labelNumber: 1,
        sequenceOrder: 0,
        routeKey: "common",
        status: "DRAFT",
        visibility: "EXCLUSIVE",
      });
      expect(typeof result[0].createdAt).toBe("string");
      expect(typeof result[0].updatedAt).toBe("string");
    });

    it("should return empty array when user has no access to project", async () => {
      const testLabel: NewLabel = {
        id: testUuid("13000002", 1),
        projectId: ownedProject.id!,
        projectFileId: defaultProjectFile.id!,
        title: "secret_label",
        labelNumber: 1,
        sequenceOrder: 0,
        visibility: "EXCLUSIVE",
        status: "DRAFT",
        conditions: {},
        effects: {},
        createdBy: testUserId,
        updatedBy: testUserId,
      };

      await db.insert(labels).values(testLabel);

      // Third user has no access to the project
      const result = await listLabels(ownedProject.id!, thirdUserId);
      expect(result).toEqual([]);
    });

    it("should return labels ordered by sequenceOrder and labelNumber", async () => {
      const label1: NewLabel = {
        id: testUuid("13000002", 1),
        projectId: ownedProject.id!,
        projectFileId: defaultProjectFile.id!,
        title: "label_2",
        labelNumber: 2,
        sequenceOrder: 1,
        visibility: "EXCLUSIVE",
        status: "DRAFT",
        conditions: {},
        effects: {},
        createdBy: testUserId,
        updatedBy: testUserId,
      };

      const label2: NewLabel = {
        id: testUuid("13000002", 2),
        projectId: ownedProject.id!,
        projectFileId: defaultProjectFile.id!,
        title: "label_1",
        labelNumber: 1,
        sequenceOrder: 0,
        visibility: "EXCLUSIVE",
        status: "DRAFT",
        conditions: {},
        effects: {},
        createdBy: testUserId,
        updatedBy: testUserId,
      };

      await db.insert(labels).values([label1, label2]);

      const result = await listLabels(ownedProject.id!, testUserId);

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe("label_1");
      expect(result[1].title).toBe("label_2");
    });

    it("should filter labels by routeKey", async () => {
      const label1: NewLabel = {
        id: testUuid("13000002", 1),
        projectId: ownedProject.id!,
        projectFileId: defaultProjectFile.id!,
        title: "common_label",
        route: "common",
        labelNumber: 1,
        sequenceOrder: 0,
        visibility: "EXCLUSIVE",
        status: "DRAFT",
        conditions: {},
        effects: {},
        createdBy: testUserId,
        updatedBy: testUserId,
      };

      const label2: NewLabel = {
        id: testUuid("13000002", 2),
        projectId: ownedProject.id!,
        projectFileId: defaultProjectFile.id!,
        title: "eileen_label",
        route: "eileen",
        labelNumber: 1,
        sequenceOrder: 0,
        visibility: "EXCLUSIVE",
        status: "DRAFT",
        conditions: {},
        effects: {},
        createdBy: testUserId,
        updatedBy: testUserId,
      };

      await db.insert(labels).values([label1, label2]);

      const result = await listLabels(ownedProject.id!, testUserId, {
        routeKey: "common",
      });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("common_label");
    });

    it("should filter labels by status", async () => {
      const label1: NewLabel = {
        id: testUuid("13000002", 1),
        projectId: ownedProject.id!,
        projectFileId: defaultProjectFile.id!,
        title: "draft_label",
        labelNumber: 1,
        sequenceOrder: 0,
        visibility: "EXCLUSIVE",
        status: "DRAFT",
        conditions: {},
        effects: {},
        createdBy: testUserId,
        updatedBy: testUserId,
      };

      const label2: NewLabel = {
        id: testUuid("13000002", 2),
        projectId: ownedProject.id!,
        projectFileId: defaultProjectFile.id!,
        title: "review_label",
        labelNumber: 2,
        sequenceOrder: 1,
        visibility: "EXCLUSIVE",
        status: "REVIEW",
        conditions: {},
        effects: {},
        createdBy: testUserId,
        updatedBy: testUserId,
      };

      await db.insert(labels).values([label1, label2]);

      const result = await listLabels(ownedProject.id!, testUserId, {
        status: "DRAFT",
      });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("draft_label");
    });

    it("should exclude soft-deleted labels", async () => {
      const label1: NewLabel = {
        id: testUuid("13000002", 1),
        projectId: ownedProject.id!,
        projectFileId: defaultProjectFile.id!,
        title: "active_label",
        labelNumber: 1,
        sequenceOrder: 0,
        visibility: "EXCLUSIVE",
        status: "DRAFT",
        conditions: {},
        effects: {},
        createdBy: testUserId,
        updatedBy: testUserId,
      };

      const label2: NewLabel = {
        id: testUuid("13000002", 2),
        projectId: ownedProject.id!,
        projectFileId: defaultProjectFile.id!,
        title: "deleted_label",
        labelNumber: 2,
        sequenceOrder: 1,
        visibility: "EXCLUSIVE",
        status: "DRAFT",
        conditions: {},
        effects: {},
        deletedAt: new Date(),
        createdBy: testUserId,
        updatedBy: testUserId,
      };

      await db.insert(labels).values([label1, label2]);

      const result = await listLabels(ownedProject.id!, testUserId);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("active_label");
    });

    it("should return labels for shared project", async () => {
      const testLabel: NewLabel = {
        id: testUuid("13000002", 1),
        projectId: sharedProject.id!,
        projectFileId: sharedProjectFile.id!,
        title: "shared_label",
        labelNumber: 1,
        sequenceOrder: 0,
        visibility: "EXCLUSIVE",
        status: "DRAFT",
        conditions: {},
        effects: {},
        createdBy: otherUserId,
        updatedBy: otherUserId,
      };

      await db.insert(labels).values(testLabel);

      // Share project with test user
      await db.insert(projectUsers).values({
        projectId: sharedProject.id!,
        userId: testUserId,
        role: "READER",
      });

      const result = await listLabels(sharedProject.id!, testUserId);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("shared_label");
    });

    describe("file association", () => {
      it("should return labels with fileName when associated with a project file", async () => {
        // Create a project file
        const projectFile: NewProjectFile = {
          id: testUuid("13000005", 1),
          projectId: ownedProject.id!,
          filePath: "labels/act_i.rpy",
          fileType: "STORY",
          content: 'label start:\n    "Hello World"',
          source: "ZIP",
          contentHash: "abc123",
        };

        await db.insert(projectFiles).values(projectFile);

        // Create a label associated with the file
        const testLabel: NewLabel = {
          id: testUuid("13000002", 1),
          projectId: ownedProject.id!,
          projectFileId: projectFile.id!,
          title: "act1_label1",
          labelNumber: 1,
          sequenceOrder: 0,
          visibility: "EXCLUSIVE",
          status: "DRAFT",
          conditions: {},
          effects: {},
          createdBy: testUserId,
          updatedBy: testUserId,
        };

        await db.insert(labels).values(testLabel);

        const result = await listLabels(ownedProject.id!, testUserId);

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          id: testLabel.id,
          projectFileId: projectFile.id,
          fileName: "act_i.rpy",
        });
      });

      it("should extract basename from nested file path", async () => {
        // Create a project file with nested path
        const projectFile: NewProjectFile = {
          id: testUuid("13000005", 1),
          projectId: ownedProject.id!,
          filePath: "labels/chapter1/scene_01.rpy",
          fileType: "STORY",
          content: 'label start:\n    "Nested file"',
          source: "ZIP",
          contentHash: "def456",
        };

        await db.insert(projectFiles).values(projectFile);

        // Create a label associated with the file
        const testLabel: NewLabel = {
          id: testUuid("13000002", 1),
          projectId: ownedProject.id!,
          projectFileId: projectFile.id!,
          title: "chapter1_scene1",
          labelNumber: 1,
          sequenceOrder: 0,
          visibility: "EXCLUSIVE",
          status: "DRAFT",
          conditions: {},
          effects: {},
          createdBy: testUserId,
          updatedBy: testUserId,
        };

        await db.insert(labels).values(testLabel);

        const result = await listLabels(ownedProject.id!, testUserId);

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          projectFileId: projectFile.id,
          fileName: "scene_01.rpy",
        });
      });
    });
  });

  describe("getLabel", () => {
    it("should return label with lines and characters when found", async () => {
      // Create a character for the label
      const character: NewCharacter = {
        id: testUuid("13000003", 1),
        projectId: ownedProject.id!,
        name: "Eileen",
        displayName: "Eileen",
        renpyTag: "a",
        color: "#FF5733",
      };

      await db.insert(characters).values(character);

      // Create a label
      const label: NewLabel = {
        id: testUuid("13000002", 1),
        projectId: ownedProject.id!,
        projectFileId: defaultProjectFile.id!,
        title: "test_label",
        labelNumber: 1,
        sequenceOrder: 0,
        visibility: "EXCLUSIVE",
        status: "DRAFT",
        conditions: {},
        effects: {},
        createdBy: testUserId,
        updatedBy: testUserId,
      };

      await db.insert(labels).values(label);

      // Create a label line
      const line: NewLabelLine = {
        id: testUuid("13000004", 1),
        labelId: label.id!,
        sequence: 1,
        content: "Hello world!",
        contentType: "DIALOGUE",
        speakerId: character.id!,
        visualType: "GENERATED",
      };

      await db.insert(labelLines).values(line);

      const result = await getLabel(label.id!, testUserId);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(label.id);
      expect(result?.title).toBe("test_label");
      expect(result?.lines).toHaveLength(1);
      expect(result?.lines[0].content).toBe("Hello world!");
      expect(result?.lines[0].speakerName).toBe("Eileen");
      expect(result?.lines[0].speakerTag).toBe("a");
      expect(result?.characters).toHaveLength(1);
      expect(result?.characters[0].name).toBe("Eileen");
      expect(result?.characters[0].displayName).toBe("Eileen");
      expect(result?.characters[0].renpyTag).toBe("a");
    });

    it("should dedupe characters with multiple speaking lines", async () => {
      // Create two characters for the label
      const character1: NewCharacter = {
        id: testUuid("13000003", 1),
        projectId: ownedProject.id!,
        name: "Eileen",
        displayName: "Eileen",
        renpyTag: "a",
        color: "#FF5733",
      };

      const character2: NewCharacter = {
        id: testUuid("13000003", 2),
        projectId: ownedProject.id!,
        name: "Ben",
        displayName: "Ben",
        renpyTag: "b",
        color: "#33FF57",
      };

      await db.insert(characters).values([character1, character2]);

      // Create a label
      const label: NewLabel = {
        id: testUuid("13000002", 1),
        projectId: ownedProject.id!,
        projectFileId: defaultProjectFile.id!,
        title: "test_label",
        labelNumber: 1,
        sequenceOrder: 0,
        visibility: "EXCLUSIVE",
        status: "DRAFT",
        conditions: {},
        effects: {},
        createdBy: testUserId,
        updatedBy: testUserId,
      };

      await db.insert(labels).values(label);

      // Create label lines with one character appearing multiple times
      const line1: NewLabelLine = {
        id: testUuid("13000004", 1),
        labelId: label.id!,
        sequence: 1,
        content: "Hello from Eileen!",
        contentType: "DIALOGUE",
        speakerId: character1.id!,
        visualType: "GENERATED",
      };

      const line2: NewLabelLine = {
        id: testUuid("13000004", 2),
        labelId: label.id!,
        sequence: 2,
        content: "Hi Eileen!",
        contentType: "DIALOGUE",
        speakerId: character2.id!,
        visualType: "GENERATED",
      };

      const line3: NewLabelLine = {
        id: testUuid("13000004", 3),
        labelId: label.id!,
        sequence: 3,
        content: "Eileen again!",
        contentType: "DIALOGUE",
        speakerId: character1.id!,
        visualType: "GENERATED",
      };

      await db.insert(labelLines).values([line1, line2, line3]);

      const result = await getLabel(label.id!, testUserId);

      // Sanity check: verify lines were NOT deduped (should have 3 lines)
      expect(result?.lines).toHaveLength(3);

      // Should return exactly 2 unique characters despite Eileen appearing twice
      expect(result?.characters).toHaveLength(2);

      // Verify both characters are present with correct properties
      const eileenChar = result?.characters.find((c) => c.renpyTag === "a");
      const benChar = result?.characters.find((c) => c.renpyTag === "b");

      expect(eileenChar).toBeDefined();
      expect(eileenChar?.name).toBe("Eileen");
      expect(eileenChar?.displayName).toBe("Eileen");
      expect(eileenChar?.renpyTag).toBe("a");

      expect(benChar).toBeDefined();
      expect(benChar?.name).toBe("Ben");
      expect(benChar?.displayName).toBe("Ben");
      expect(benChar?.renpyTag).toBe("b");
    });

    it("should return null when label not found", async () => {
      const result = await getLabel(testUuid("13000002", 999999), testUserId);
      expect(result).toBeNull();
    });

    it("should return null when user does not have access to label", async () => {
      const label: NewLabel = {
        id: testUuid("13000002", 1),
        projectId: ownedProject.id!,
        projectFileId: defaultProjectFile.id!,
        title: "private_label",
        labelNumber: 1,
        sequenceOrder: 0,
        visibility: "EXCLUSIVE",
        status: "DRAFT",
        conditions: {},
        effects: {},
        createdBy: testUserId,
        updatedBy: testUserId,
      };

      await db.insert(labels).values(label);

      // Third user has no access
      const result = await getLabel(label.id!, thirdUserId);
      expect(result).toBeNull();
    });

    it("should return label with empty lines array when no lines exist", async () => {
      const label: NewLabel = {
        id: testUuid("13000002", 1),
        projectId: ownedProject.id!,
        projectFileId: defaultProjectFile.id!,
        title: "empty_label",
        labelNumber: 1,
        sequenceOrder: 0,
        visibility: "EXCLUSIVE",
        status: "DRAFT",
        conditions: {},
        effects: {},
        createdBy: testUserId,
        updatedBy: testUserId,
      };

      await db.insert(labels).values(label);

      const result = await getLabel(label.id!, testUserId);

      expect(result).not.toBeNull();
      expect(result?.lines).toEqual([]);
      expect(result?.characters).toEqual([]);
    });

    it("should return null for soft-deleted label", async () => {
      const label: NewLabel = {
        id: testUuid("13000002", 1),
        projectId: ownedProject.id!,
        projectFileId: defaultProjectFile.id!,
        title: "deleted_label",
        labelNumber: 1,
        sequenceOrder: 0,
        visibility: "EXCLUSIVE",
        status: "DRAFT",
        conditions: {},
        effects: {},
        deletedAt: new Date(),
        createdBy: testUserId,
        updatedBy: testUserId,
      };

      await db.insert(labels).values(label);

      const result = await getLabel(label.id!, testUserId);
      expect(result).toBeNull();
    });

    it("should exclude soft-deleted lines from results", async () => {
      const character: NewCharacter = {
        id: testUuid("13000003", 1),
        projectId: ownedProject.id!,
        name: "Eileen",
        displayName: "Eileen",
        renpyTag: "a",
        color: "#FF5733",
      };

      await db.insert(characters).values(character);

      const label: NewLabel = {
        id: testUuid("13000002", 1),
        projectId: ownedProject.id!,
        projectFileId: defaultProjectFile.id!,
        title: "test_label",
        labelNumber: 1,
        sequenceOrder: 0,
        visibility: "EXCLUSIVE",
        status: "DRAFT",
        conditions: {},
        effects: {},
        createdBy: testUserId,
        updatedBy: testUserId,
      };

      await db.insert(labels).values(label);

      const activeLine: NewLabelLine = {
        id: testUuid("13000004", 1),
        labelId: label.id!,
        sequence: 1,
        content: "Active line",
        contentType: "DIALOGUE",
        speakerId: character.id!,
        visualType: "GENERATED",
      };

      const deletedLine: NewLabelLine = {
        id: testUuid("13000004", 2),
        labelId: label.id!,
        sequence: 2,
        content: "Deleted line",
        contentType: "DIALOGUE",
        speakerId: character.id!,
        visualType: "GENERATED",
        deletedAt: new Date(),
      };

      await db.insert(labelLines).values([activeLine, deletedLine]);

      const result = await getLabel(label.id!, testUserId);

      expect(result?.lines).toHaveLength(1);
      expect(result?.lines[0].content).toBe("Active line");
    });

    it("should return null speaker information when speakerId is null", async () => {
      const label: NewLabel = {
        id: testUuid("13000002", 1),
        projectId: ownedProject.id!,
        projectFileId: defaultProjectFile.id!,
        title: "test_label",
        labelNumber: 1,
        sequenceOrder: 0,
        visibility: "EXCLUSIVE",
        status: "DRAFT",
        conditions: {},
        effects: {},
        createdBy: testUserId,
        updatedBy: testUserId,
      };

      await db.insert(labels).values(label);

      const line: NewLabelLine = {
        id: testUuid("13000004", 1),
        labelId: label.id!,
        sequence: 1,
        content: "Narration text",
        contentType: "NARRATION",
        visualType: "BLACK",
      };

      await db.insert(labelLines).values(line);

      const result = await getLabel(label.id!, testUserId);

      expect(result?.lines).toHaveLength(1);
      expect(result?.lines[0].speakerId).toBeNull();
      expect(result?.lines[0].speakerName).toBeNull();
      expect(result?.lines[0].speakerTag).toBeNull();
    });

    it("should return fileName when label has a project file association", async () => {
      // Create a project file
      const testFile: NewProjectFile = {
        id: testUuid("15000000", 1),
        projectId: ownedProject.id!,
        source: "GITLAB",
        filePath: "labels/act_i.rpy",
        fileType: "STORY",
        content: "init python:\n    pass",
        contentHash: calculateContentHash("init python:\n    pass"),
      };

      await db.insert(projectFiles).values(testFile);

      // Create a label with projectFileId
      const label: NewLabel = {
        id: testUuid("13000002", 1),
        projectId: ownedProject.id!,
        projectFileId: testFile.id!,
        title: "test_label",
        labelNumber: 1,
        sequenceOrder: 0,
        visibility: "EXCLUSIVE",
        status: "DRAFT",
        conditions: {},
        effects: {},
        createdBy: testUserId,
        updatedBy: testUserId,
      };

      await db.insert(labels).values(label);

      const result = await getLabel(label.id!, testUserId);

      expect(result).not.toBeNull();
      expect(result?.projectFileId).toBe(testFile.id);
      expect(result?.fileName).toBe("act_i.rpy");
    });
  });

  describe("createLabel", () => {
    let createLabelFileId: string;

    beforeEach(async () => {
      const file: NewProjectFile = {
        id: testUuid("13000099", 1),
        projectId: ownedProject.id!,
        source: "ZIP",
        filePath: "labels/create_test.rpy",
        fileType: "STORY",
        content: 'label start:\n    "Hello"',
        contentHash: "create-test-hash",
      };
      await db.insert(projectFiles).values(file);
      createLabelFileId = file.id!;
    });

    it("should create a label with valid data", async () => {
      const result = await createLabel(testUserId, {
        projectId: ownedProject.id!,
        projectFileId: createLabelFileId,
        title: "New Label",
        route: "common",
        groupType: "act",
        groupValue: "I",
        labelNumber: 1,
        sequenceOrder: 0,
      });

      expect(result.id).toBeDefined();
      expect(result.title).toBe("New Label");
      expect(result.routeKey).toBe("common");
      expect(result.groupType).toBe("act");
      expect(result.groupValue).toBe("I");
      expect(result.labelNumber).toBe(1);
      expect(result.sequenceOrder).toBe(0);
      expect(result.status).toBe("DRAFT");
      expect(result.visibility).toBe("EXCLUSIVE");
    });

    it("should throw NotFoundError when project does not exist", async () => {
      await expect(
        createLabel(testUserId, {
          projectId: testUuid("13000000", 999999),
          title: "Test Label",
          labelNumber: 1,
          projectFileId: createLabelFileId,
        })
      ).rejects.toThrow("Project");
    });

    it("should throw ForbiddenError when user is not project owner", async () => {
      await expect(
        createLabel(thirdUserId, {
          projectId: ownedProject.id!,
          projectFileId: createLabelFileId,
          title: "Test Label",
          labelNumber: 1,
        })
      ).rejects.toThrow("You do not have access to this project");
    });

    it("should throw ForbiddenError when projectFileId belongs to a different project", async () => {
      await expect(
        createLabel(testUserId, {
          projectId: ownedProject.id!,
          projectFileId: sharedProjectFile.id!,
          title: "Cross-project Label",
          labelNumber: 1,
        })
      ).rejects.toThrow("Project file does not belong");
    });

    it("should coerce route to null when route does not exist in route_configs", async () => {
      const result = await createLabel(testUserId, {
        projectId: ownedProject.id!,
        projectFileId: createLabelFileId,
        title: "Test Label",
        route: "nonexistent_route",
        labelNumber: 1,
      });

      expect(result.routeKey).toBeNull();
    });

    it("should set default values for optional fields", async () => {
      const result = await createLabel(testUserId, {
        projectId: ownedProject.id!,
        projectFileId: createLabelFileId,
        title: "Minimal Label",
        labelNumber: 1,
      });

      expect(result.title).toBe("Minimal Label");
      expect(result.sequenceOrder).toBe(0);
      expect(result.status).toBe("DRAFT");
      expect(result.visibility).toBe("EXCLUSIVE");
      expect(result.groupType).toBeNull();
      expect(result.groupValue).toBeNull();
    });
  });

  describe("updateLabel", () => {
    it("should update label title", async () => {
      const label: NewLabel = {
        id: testUuid("13000002", 1),
        projectId: ownedProject.id!,
        projectFileId: defaultProjectFile.id!,
        title: "Old Title",
        labelNumber: 1,
        sequenceOrder: 0,
        visibility: "EXCLUSIVE",
        status: "DRAFT",
        conditions: {},
        effects: {},
        createdBy: testUserId,
        updatedBy: testUserId,
      };

      await db.insert(labels).values(label);

      const result = await updateLabel(label.id!, testUserId, {
        title: "New Title",
      });

      expect(result.title).toBe("New Title");
    });

    it("should update label status", async () => {
      const label: NewLabel = {
        id: testUuid("13000002", 1),
        projectId: ownedProject.id!,
        projectFileId: defaultProjectFile.id!,
        title: "Test Label",
        labelNumber: 1,
        sequenceOrder: 0,
        visibility: "EXCLUSIVE",
        status: "DRAFT",
        conditions: {},
        effects: {},
        createdBy: testUserId,
        updatedBy: testUserId,
      };

      await db.insert(labels).values(label);

      const result = await updateLabel(label.id!, testUserId, {
        status: "REVIEW",
      });

      expect(result.status).toBe("REVIEW");
    });

    it("should throw NotFoundError when label does not exist", async () => {
      await expect(
        updateLabel(testUuid("13000002", 999999), testUserId, {
          title: "New Title",
        })
      ).rejects.toThrow("Label");
    });

    it("should throw ForbiddenError when user is not project owner", async () => {
      const label: NewLabel = {
        id: testUuid("13000002", 1),
        projectId: ownedProject.id!,
        projectFileId: defaultProjectFile.id!,
        title: "Test Label",
        labelNumber: 1,
        sequenceOrder: 0,
        visibility: "EXCLUSIVE",
        status: "DRAFT",
        conditions: {},
        effects: {},
        createdBy: testUserId,
        updatedBy: testUserId,
      };

      await db.insert(labels).values(label);

      await expect(
        updateLabel(label.id!, thirdUserId, { title: "New Title" })
      ).rejects.toThrow("Insufficient permissions");
    });

    it("should coerce route to null when route does not exist in route_configs", async () => {
      const label: NewLabel = {
        id: testUuid("13000002", 1),
        projectId: ownedProject.id!,
        projectFileId: defaultProjectFile.id!,
        title: "Test Label",
        labelNumber: 1,
        sequenceOrder: 0,
        visibility: "EXCLUSIVE",
        status: "DRAFT",
        conditions: {},
        effects: {},
        createdBy: testUserId,
        updatedBy: testUserId,
      };

      await db.insert(labels).values(label);

      const result = await updateLabel(label.id!, testUserId, {
        route: "nonexistent_route",
      });

      expect(result.routeKey).toBeNull();
    });

    it("should return fileName when updated label has a project file association", async () => {
      // Create a project file
      const projectFile: NewProjectFile = {
        id: testUuid("13000005", 11),
        projectId: ownedProject.id!,
        filePath: "labels/scene_01.rpy",
        fileType: "STORY",
        content: 'label start:\n    "Hello"',
        source: "ZIP",
        contentHash: calculateContentHash('label start:\n    "Hello"'),
      };

      await db.insert(projectFiles).values(projectFile);

      // Create a label associated with the file
      const label: NewLabel = {
        id: testUuid("13000002", 100),
        projectId: ownedProject.id!,
        projectFileId: projectFile.id!,
        title: "Original Title",
        labelNumber: 1,
        sequenceOrder: 0,
        visibility: "EXCLUSIVE",
        status: "DRAFT",
        conditions: {},
        effects: {},
        createdBy: testUserId,
        updatedBy: testUserId,
      };

      await db.insert(labels).values(label);

      // Update the label title
      const result = await updateLabel(label.id!, testUserId, {
        title: "Updated Title",
      });

      expect(result.title).toBe("Updated Title");
      expect(result.projectFileId).toBe(projectFile.id);
      expect(result.fileName).toBe("scene_01.rpy");
    });
  });

  describe("deleteLabel", () => {
    it("should soft delete a label", async () => {
      const label: NewLabel = {
        id: testUuid("13000002", 1),
        projectId: ownedProject.id!,
        projectFileId: defaultProjectFile.id!,
        title: "Test Label",
        labelNumber: 1,
        sequenceOrder: 0,
        visibility: "EXCLUSIVE",
        status: "DRAFT",
        conditions: {},
        effects: {},
        createdBy: testUserId,
        updatedBy: testUserId,
      };

      await db.insert(labels).values(label);

      await deleteLabel(label.id!, testUserId);

      // Verify label is soft deleted
      const [deletedLabel] = await db
        .select()
        .from(labels)
        .where(eq(labels.id, label.id!))
        .limit(1);

      expect(deletedLabel.deletedAt).not.toBeNull();
    });

    it("should soft delete associated label lines", async () => {
      const label: NewLabel = {
        id: testUuid("13000002", 1),
        projectId: ownedProject.id!,
        projectFileId: defaultProjectFile.id!,
        title: "Test Label",
        labelNumber: 1,
        sequenceOrder: 0,
        visibility: "EXCLUSIVE",
        status: "DRAFT",
        conditions: {},
        effects: {},
        createdBy: testUserId,
        updatedBy: testUserId,
      };

      await db.insert(labels).values(label);

      const line: NewLabelLine = {
        id: testUuid("13000004", 1),
        labelId: label.id!,
        sequence: 1,
        content: "Test content",
        contentType: "DIALOGUE",
        visualType: "GENERATED",
      };

      await db.insert(labelLines).values(line);

      await deleteLabel(label.id!, testUserId);

      // Verify line is soft deleted
      const [deletedLine] = await db
        .select()
        .from(labelLines)
        .where(eq(labelLines.id, line.id!))
        .limit(1);

      expect(deletedLine.deletedAt).not.toBeNull();
    });

    it("should throw NotFoundError when label does not exist", async () => {
      await expect(
        deleteLabel(testUuid("13000002", 999999), testUserId)
      ).rejects.toThrow("Label");
    });

    it("should throw ForbiddenError when user is not project owner", async () => {
      const label: NewLabel = {
        id: testUuid("13000002", 1),
        projectId: ownedProject.id!,
        projectFileId: defaultProjectFile.id!,
        title: "Test Label",
        labelNumber: 1,
        sequenceOrder: 0,
        visibility: "EXCLUSIVE",
        status: "DRAFT",
        conditions: {},
        effects: {},
        createdBy: testUserId,
        updatedBy: testUserId,
      };

      await db.insert(labels).values(label);

      await expect(deleteLabel(label.id!, thirdUserId)).rejects.toThrow(
        "Insufficient permissions"
      );
    });

    it("should only delete non-deleted label lines", async () => {
      const label: NewLabel = {
        id: testUuid("13000002", 1),
        projectId: ownedProject.id!,
        projectFileId: defaultProjectFile.id!,
        title: "Test Label",
        labelNumber: 1,
        sequenceOrder: 0,
        visibility: "EXCLUSIVE",
        status: "DRAFT",
        conditions: {},
        effects: {},
        createdBy: testUserId,
        updatedBy: testUserId,
      };

      await db.insert(labels).values(label);

      const activeLine: NewLabelLine = {
        id: testUuid("13000004", 1),
        labelId: label.id!,
        sequence: 1,
        content: "Active line",
        contentType: "DIALOGUE",
        visualType: "GENERATED",
      };

      const alreadyDeletedLine: NewLabelLine = {
        id: testUuid("13000004", 2),
        labelId: label.id!,
        sequence: 2,
        content: "Already deleted",
        contentType: "DIALOGUE",
        visualType: "GENERATED",
        deletedAt: new Date(),
      };

      await db.insert(labelLines).values([activeLine, alreadyDeletedLine]);

      await deleteLabel(label.id!, testUserId);

      // Verify only active line was deleted
      const [activeResult] = await db
        .select()
        .from(labelLines)
        .where(eq(labelLines.id, activeLine.id!))
        .limit(1);

      const [deletedResult] = await db
        .select()
        .from(labelLines)
        .where(eq(labelLines.id, alreadyDeletedLine.id!))
        .limit(1);

      expect(activeResult.deletedAt).not.toBeNull();
      expect(deletedResult.deletedAt).not.toBeNull();
    });
  });
});
