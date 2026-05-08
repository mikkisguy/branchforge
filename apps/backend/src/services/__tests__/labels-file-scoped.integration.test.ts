/**
 * Labels Service - File Scoped Integration Tests
 *
 * Tests for file-scoped label creation functionality.
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
  projectFiles,
} from "../../db/schema/index.js";
import type {
  NewUser,
  NewProject,
  NewProjectFile,
} from "../../db/schema/index.js";
import { eq, inArray } from "drizzle-orm";
import { createLabel } from "../labels.service.js";
import { testEmail, testUuid } from "../../utils/test-ids.js";
import { calculateContentHash } from "../../lib/hash.js";
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
} from "../../middleware/error-handler.middleware.js";

describe("LabelsService - File Scoped (Integration)", () => {
  let db: ReturnType<typeof getDb>;

  beforeAll(async () => {
    db = getDb();
  });

  // Test fixtures
  const testUserId = testUuid("03000000", 1);
  const otherUserId = testUuid("03000000", 2);

  const testUser: NewUser = {
    id: testUserId,
    email: testEmail("labels-file-scoped", "owner"),
    passwordHash: "hashed_password",
    role: "OWNER",
  };

  const otherUser: NewUser = {
    id: otherUserId,
    email: testEmail("labels-file-scoped", "other"),
    passwordHash: "hashed_password",
    role: "OWNER",
  };

  const testProject: NewProject = {
    id: testUuid("13000000", 1),
    userId: testUserId,
    name: "Test Project",
    description: "A project for testing file-scoped labels",
    maxMeterDelta: 10,
    source: "ZIP",
  };

  // Helper to clean up all test data in reverse dependency order
  async function cleanupTestData() {
    // Delete in reverse dependency order to handle foreign key constraints
    // First, fetch all project IDs owned by the test users
    const userProjects = await db
      .select({ id: projects.id })
      .from(projects)
      .where(inArray(projects.userId, [testUserId, otherUserId]));

    const projectIds = userProjects.map((p) => p.id);

    // Delete all labels and files for those projects
    if (projectIds.length > 0) {
      await db.delete(labels).where(inArray(labels.projectId, projectIds));
      await db
        .delete(projectFiles)
        .where(inArray(projectFiles.projectId, projectIds));
    }

    // Then delete all projects (including any created during tests)
    await Promise.all([
      db.delete(projects).where(eq(projects.userId, testUserId)),
      db.delete(projects).where(eq(projects.userId, otherUserId)),
    ]);

    // Finally delete users
    await Promise.all([
      db.delete(users).where(eq(users.id, testUserId)),
      db.delete(users).where(eq(users.id, otherUserId)),
    ]);
  }

  // Helper to set up test data
  async function setupTestData() {
    // Insert users
    await db.insert(users).values([testUser, otherUser]);

    // Insert project
    await db.insert(projects).values(testProject);
  }

  beforeEach(async () => {
    await cleanupTestData();
    await setupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe("createLabel with file-scoped parameters", () => {
    describe("projectFileId parameter", () => {
      it("should create a label associated with a project file", async () => {
        // Create a project file
        const projectFile: NewProjectFile = {
          id: testUuid("13000005", 1),
          projectId: testProject.id!,
          filePath: "labels/act_i.rpy",
          fileType: "STORY",
          content: 'label start:\n    "Hello World"',
          source: "ZIP",
          contentHash: calculateContentHash('label start:\n    "Hello World"'),
        };

        await db.insert(projectFiles).values(projectFile);

        // Create a label with projectFileId
        const result = await createLabel(testUserId, {
          projectId: testProject.id!,
          title: "New Label in File",
          labelNumber: 1,
          projectFileId: projectFile.id!,
        });

        expect(result.id).toBeDefined();
        expect(result.title).toBe("New Label in File");
        expect(result.projectFileId).toBe(projectFile.id);
        expect(result.fileName).toBe("act_i.rpy");
      });

      it("should throw NotFoundError when projectFileId does not exist", async () => {
        const nonExistentFileId = testUuid("13000005", 999999);

        await expect(
          createLabel(testUserId, {
            projectId: testProject.id!,
            title: "Label with Non-existent File",
            labelNumber: 1,
            projectFileId: nonExistentFileId,
          })
        ).rejects.toThrow(NotFoundError);
      });

      it("should throw ForbiddenError when project file belongs to different project", async () => {
        // Create a file in a different project
        const otherProject: NewProject = {
          id: testUuid("13000000", 2),
          userId: otherUserId,
          name: "Other Project",
          source: "ZIP",
        };

        await db.insert(projects).values(otherProject);

        const otherProjectFile: NewProjectFile = {
          id: testUuid("13000005", 1),
          projectId: otherProject.id!,
          filePath: "labels/other.rpy",
          fileType: "STORY",
          content: 'label start:\n    "Other"',
          source: "ZIP",
          contentHash: calculateContentHash('label start:\n    "Other"'),
        };

        await db.insert(projectFiles).values(otherProjectFile);

        // Try to create a label in testProject with a file from otherProject
        await expect(
          createLabel(testUserId, {
            projectId: testProject.id!,
            title: "Label with Wrong File",
            labelNumber: 1,
            projectFileId: otherProjectFile.id!,
          })
        ).rejects.toThrow(ForbiddenError);
      });

      it("should throw ForbiddenError when user is not project owner", async () => {
        const projectFile: NewProjectFile = {
          id: testUuid("13000005", 1),
          projectId: testProject.id!,
          filePath: "labels/act_i.rpy",
          fileType: "STORY",
          content: 'label start:\n    "Hello"',
          source: "ZIP",
          contentHash: calculateContentHash('label start:\n    "Hello"'),
        };

        await db.insert(projectFiles).values(projectFile);

        // Try to create a label as otherUser (who doesn't own testProject)
        await expect(
          createLabel(otherUserId, {
            projectId: testProject.id!,
            title: "Unauthorized Label",
            labelNumber: 1,
            projectFileId: projectFile.id!,
          })
        ).rejects.toThrow(ForbiddenError);
      });
    });

    describe("afterLabelId parameter", () => {
      it("should create a label positioned after another label in the same file", async () => {
        // Create a project file
        const projectFile: NewProjectFile = {
          id: testUuid("13000005", 1),
          projectId: testProject.id!,
          filePath: "labels/act_i.rpy",
          fileType: "STORY",
          content: 'label start:\n    "Hello"',
          source: "ZIP",
          contentHash: calculateContentHash('label start:\n    "Hello"'),
        };

        await db.insert(projectFiles).values(projectFile);

        // Create first label
        const firstLabel = await createLabel(testUserId, {
          projectId: testProject.id!,
          title: "First Label",
          labelNumber: 1,
          projectFileId: projectFile.id!,
        });

        // Create second label after first label
        const secondLabel = await createLabel(testUserId, {
          projectId: testProject.id!,
          title: "Second Label",
          labelNumber: 2,
          projectFileId: projectFile.id!,
          afterLabelId: firstLabel.id,
        });

        // Verify positions
        const [firstLabelDb] = await db
          .select()
          .from(labels)
          .where(eq(labels.id, firstLabel.id))
          .limit(1);

        const [secondLabelDb] = await db
          .select()
          .from(labels)
          .where(eq(labels.id, secondLabel.id))
          .limit(1);

        expect(firstLabelDb.labelPosition).toBe(0);
        expect(secondLabelDb.labelPosition).toBe(1);
      });

      it("should create a label at the end when afterLabelId is null", async () => {
        // Create a project file
        const projectFile: NewProjectFile = {
          id: testUuid("13000005", 1),
          projectId: testProject.id!,
          filePath: "labels/act_i.rpy",
          fileType: "STORY",
          content: 'label start:\n    "Hello"',
          source: "ZIP",
          contentHash: calculateContentHash('label start:\n    "Hello"'),
        };

        await db.insert(projectFiles).values(projectFile);

        // Create first label
        const firstLabel = await createLabel(testUserId, {
          projectId: testProject.id!,
          title: "First Label",
          labelNumber: 1,
          projectFileId: projectFile.id!,
        });

        // Create second label with afterLabelId: null (should go to end)
        const secondLabel = await createLabel(testUserId, {
          projectId: testProject.id!,
          title: "Second Label",
          labelNumber: 2,
          projectFileId: projectFile.id!,
          afterLabelId: null,
        });

        // Verify positions: labels are appended in creation order,
        // so firstLabelDb.labelPosition === 0 and secondLabelDb.labelPosition === 1
        const [firstLabelDb] = await db
          .select()
          .from(labels)
          .where(eq(labels.id, firstLabel.id))
          .limit(1);

        const [secondLabelDb] = await db
          .select()
          .from(labels)
          .where(eq(labels.id, secondLabel.id))
          .limit(1);

        expect(firstLabelDb.labelPosition).toBe(0);
        expect(secondLabelDb.labelPosition).toBe(1);
      });

      it("should throw NotFoundError when afterLabelId does not exist", async () => {
        const projectFile: NewProjectFile = {
          id: testUuid("13000005", 1),
          projectId: testProject.id!,
          filePath: "labels/act_i.rpy",
          fileType: "STORY",
          content: 'label start:\n    "Hello"',
          source: "ZIP",
          contentHash: calculateContentHash('label start:\n    "Hello"'),
        };

        await db.insert(projectFiles).values(projectFile);

        const nonExistentLabelId = testUuid("13000002", 999999);

        await expect(
          createLabel(testUserId, {
            projectId: testProject.id!,
            title: "Label with Non-existent After Label",
            labelNumber: 1,
            projectFileId: projectFile.id!,
            afterLabelId: nonExistentLabelId,
          })
        ).rejects.toThrow(NotFoundError);
      });

      it("should throw ValidationError when afterLabelId is in a different file", async () => {
        // Create two project files
        const file1: NewProjectFile = {
          id: testUuid("13000005", 1),
          projectId: testProject.id!,
          filePath: "labels/file1.rpy",
          fileType: "STORY",
          content: 'label start:\n    "File 1"',
          source: "ZIP",
          contentHash: calculateContentHash('label start:\n    "File 1"'),
        };

        const file2: NewProjectFile = {
          id: testUuid("13000005", 2),
          projectId: testProject.id!,
          filePath: "labels/file2.rpy",
          fileType: "STORY",
          content: 'label start:\n    "File 2"',
          source: "ZIP",
          contentHash: calculateContentHash('label start:\n    "File 2"'),
        };

        await db.insert(projectFiles).values([file1, file2]);

        // Create a label in file1
        const labelInFile1 = await createLabel(testUserId, {
          projectId: testProject.id!,
          title: "Label in File 1",
          labelNumber: 1,
          projectFileId: file1.id!,
        });

        // Try to create a label in file2 after the label in file1
        await expect(
          createLabel(testUserId, {
            projectId: testProject.id!,
            title: "Label in File 2",
            labelNumber: 2,
            projectFileId: file2.id!,
            afterLabelId: labelInFile1.id,
          })
        ).rejects.toThrow(ValidationError);
      });
    });

    describe("label name collision handling", () => {
      it("should append counter suffix when label name collision occurs", async () => {
        const projectFile: NewProjectFile = {
          id: testUuid("13000005", 1),
          projectId: testProject.id!,
          filePath: "labels/act_i.rpy",
          fileType: "STORY",
          content: 'label start:\n    "Hello"',
          source: "ZIP",
          contentHash: calculateContentHash('label start:\n    "Hello"'),
        };

        await db.insert(projectFiles).values(projectFile);

        // Create first label with title "My Label"
        const firstLabel = await createLabel(testUserId, {
          projectId: testProject.id!,
          title: "My Label",
          labelNumber: 1,
          projectFileId: projectFile.id!,
        });

        // Create second label with same title
        const secondLabel = await createLabel(testUserId, {
          projectId: testProject.id!,
          title: "My Label",
          labelNumber: 2,
          projectFileId: projectFile.id!,
        });

        // Verify counter suffix was added
        expect(firstLabel.title).toBe("My Label");
        expect(secondLabel.title).toBe("My Label_2");
      });

      it("should increment counter suffix for multiple collisions", async () => {
        const projectFile: NewProjectFile = {
          id: testUuid("13000005", 1),
          projectId: testProject.id!,
          filePath: "labels/act_i.rpy",
          fileType: "STORY",
          content: 'label start:\n    "Hello"',
          source: "ZIP",
          contentHash: calculateContentHash('label start:\n    "Hello"'),
        };

        await db.insert(projectFiles).values(projectFile);

        // Create first label
        const label1 = await createLabel(testUserId, {
          projectId: testProject.id!,
          title: "Collision Label",
          labelNumber: 1,
          projectFileId: projectFile.id!,
        });

        // Create second label with same title
        const label2 = await createLabel(testUserId, {
          projectId: testProject.id!,
          title: "Collision Label",
          labelNumber: 2,
          projectFileId: projectFile.id!,
        });

        // Create third label with same title
        const label3 = await createLabel(testUserId, {
          projectId: testProject.id!,
          title: "Collision Label",
          labelNumber: 3,
          projectFileId: projectFile.id!,
        });

        expect(label1.title).toBe("Collision Label");
        expect(label2.title).toBe("Collision Label_2");
        expect(label3.title).toBe("Collision Label_3");
      });

      it("should only check for collisions within the same file", async () => {
        // Create two files
        const file1: NewProjectFile = {
          id: testUuid("13000005", 1),
          projectId: testProject.id!,
          filePath: "labels/file1.rpy",
          fileType: "STORY",
          content: 'label start:\n    "File 1"',
          source: "ZIP",
          contentHash: calculateContentHash('label start:\n    "File 1"'),
        };

        const file2: NewProjectFile = {
          id: testUuid("13000005", 2),
          projectId: testProject.id!,
          filePath: "labels/file2.rpy",
          fileType: "STORY",
          content: 'label start:\n    "File 2"',
          source: "ZIP",
          contentHash: calculateContentHash('label start:\n    "File 2"'),
        };

        await db.insert(projectFiles).values([file1, file2]);

        // Create label in file1
        const label1 = await createLabel(testUserId, {
          projectId: testProject.id!,
          title: "Same Title",
          labelNumber: 1,
          projectFileId: file1.id!,
        });

        // Create label in file2 with same title (no collision expected)
        const label2 = await createLabel(testUserId, {
          projectId: testProject.id!,
          title: "Same Title",
          labelNumber: 2,
          projectFileId: file2.id!,
        });

        expect(label1.title).toBe("Same Title");
        expect(label2.title).toBe("Same Title");
      });
    });

    describe("RPY content updates", () => {
      it("should insert label into RPY content when creating file-scoped label", async () => {
        const initialContent = 'label start:\n    "Hello World"\n    return';
        const projectFile: NewProjectFile = {
          id: testUuid("13000005", 1),
          projectId: testProject.id!,
          filePath: "labels/act_i.rpy",
          fileType: "STORY",
          content: initialContent,
          source: "ZIP",
          contentHash: calculateContentHash(initialContent),
        };

        await db.insert(projectFiles).values(projectFile);

        // Create a label
        await createLabel(testUserId, {
          projectId: testProject.id!,
          title: "New Label",
          labelNumber: 1,
          projectFileId: projectFile.id!,
        });

        // Verify the file content was updated
        const [updatedFile] = await db
          .select()
          .from(projectFiles)
          .where(eq(projectFiles.id, projectFile.id!))
          .limit(1);

        expect(updatedFile.content).toContain("label new_label:");
      });

      it("should update contentHash when modifying RPY content", async () => {
        const initialContent = 'label start:\n    "Hello"';
        const initialHash = calculateContentHash(initialContent);
        const projectFile: NewProjectFile = {
          id: testUuid("13000005", 1),
          projectId: testProject.id!,
          filePath: "labels/act_i.rpy",
          fileType: "STORY",
          content: initialContent,
          source: "ZIP",
          contentHash: initialHash,
        };

        await db.insert(projectFiles).values(projectFile);

        // Create a label
        await createLabel(testUserId, {
          projectId: testProject.id!,
          title: "New Label",
          labelNumber: 1,
          projectFileId: projectFile.id!,
        });

        // Verify the contentHash was updated
        const [updatedFile] = await db
          .select()
          .from(projectFiles)
          .where(eq(projectFiles.id, projectFile.id!))
          .limit(1);

        expect(updatedFile.contentHash).not.toBe(initialHash);
      });
    });
  });

  describe("transaction safety", () => {
    it("should create label with non-standard RPY content", async () => {
      // This test verifies that label creation succeeds with non-standard RPY content
      // The parser handles this content gracefully, allowing the label to be created
      const nonStandardContent = "invalid rpy content {{{";
      const projectFile: NewProjectFile = {
        id: testUuid("13000005", 1),
        projectId: testProject.id!,
        filePath: "labels/act_i.rpy",
        fileType: "STORY",
        content: nonStandardContent,
        source: "ZIP",
        contentHash: calculateContentHash(nonStandardContent),
      };

      await db.insert(projectFiles).values(projectFile);

      const result = await createLabel(testUserId, {
        projectId: testProject.id!,
        title: "Test Label",
        labelNumber: 1,
        projectFileId: projectFile.id!,
      });

      expect(result.id).toBeDefined();

      // Verify the label was actually created
      const [label] = await db
        .select()
        .from(labels)
        .where(eq(labels.id, result.id))
        .limit(1);

      expect(label).toBeDefined();
    });
  });
});
