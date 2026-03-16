/**
 * Ren'Py Definitions Service Integration Tests
 *
 * Tests for the Ren'Py definitions service against a real database.
 * These tests cover CRUD operations with authorization checks.
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
  renpyDefinitions,
  type NewUser,
  type NewProject,
  type NewRenpyDefinition,
} from "../../db/schema/index.js";
import { eq, inArray } from "drizzle-orm";
import {
  listRenpyDefinitions,
  getRenpyDefinition,
  createRenpyDefinition,
  updateRenpyDefinition,
  deleteRenpyDefinition,
} from "../renpy-definitions.service.js";
import { testEmail, testUuid } from "../../utils/test-ids.js";

describe("RenpyDefinitionsService (Integration)", () => {
  let db: ReturnType<typeof getDb>;

  beforeAll(async () => {
    db = getDb();
  });

  // Test fixtures
  const testUserId = testUuid("05000000", 1);
  const otherUserId = testUuid("05000000", 2);

  const testUser: NewUser = {
    id: testUserId,
    email: testEmail("renpy-definitions", "owner"),
    passwordHash: "hashed_password",
    role: "OWNER",
  };

  const otherUser: NewUser = {
    id: otherUserId,
    email: testEmail("renpy-definitions", "other"),
    passwordHash: "hashed_password",
    role: "OWNER",
  };

  const ownedProject: NewProject = {
    id: testUuid("15000000", 1),
    userId: testUserId,
    name: "Owned Project",
    description: "A project owned by the user",
    maxMeterDelta: 10,
  };

  const otherProject: NewProject = {
    id: testUuid("15000000", 2),
    userId: otherUserId,
    name: "Other Project",
    description: "A project owned by another user",
    maxMeterDelta: 10,
  };

  const testDefinition1: NewRenpyDefinition = {
    id: testUuid("25000000", 1),
    projectId: ownedProject.id!,
    category: "CHARACTER",
    sortOrder: 0,
    tag: "eileen",
    displayName: "Eileen",
    definitionCode: 'define a = Character("Eileen")',
    referenceTag: "a",
  };

  const testDefinition2: NewRenpyDefinition = {
    id: testUuid("25000000", 2),
    projectId: ownedProject.id!,
    category: "TRANSFORM",
    sortOrder: 1,
    tag: "fade_in",
    displayName: "Fade In",
    definitionCode: "transform fade_in:\n    alpha 0.0\n    linear 0.5 alpha 1.0",
    referenceTag: null,
  };

  const testDefinition3: NewRenpyDefinition = {
    id: testUuid("25000000", 3),
    projectId: ownedProject.id!,
    category: "IMAGE",
    sortOrder: 0,
    tag: "bg_forest",
    displayName: "Forest Background",
    definitionCode: "image bg forest = 'forest.jpg'",
    referenceTag: null,
  };

  const otherDefinition: NewRenpyDefinition = {
    id: testUuid("25000000", 4),
    projectId: otherProject.id!,
    category: "CHARACTER",
    sortOrder: 0,
    tag: "other_char",
    displayName: "Other Character",
    definitionCode: 'define o = Character("Other")',
    referenceTag: "o",
  };

  // Helper to clean up all test data
  async function cleanupTestData() {
    const testUserIds = [testUserId, otherUserId];
    const projectIds = [ownedProject.id!, otherProject.id!];

    // Delete renpy definitions for test projects
    await db
      .delete(renpyDefinitions)
      .where(inArray(renpyDefinitions.projectId, projectIds));

    // Delete projects
    await db.delete(projects).where(inArray(projects.id, projectIds));

    // Delete users
    await db.delete(users).where(inArray(users.id, testUserIds));
  }

  // Helper to set up test data
  async function setupTestData() {
    // Insert users
    await db.insert(users).values([testUser, otherUser]);

    // Insert projects
    await db.insert(projects).values([ownedProject, otherProject]);

    // Insert renpy definitions
    await db
      .insert(renpyDefinitions)
      .values([
        testDefinition1,
        testDefinition2,
        testDefinition3,
        otherDefinition,
      ]);
  }

  beforeEach(async () => {
    await cleanupTestData();
    await setupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  // ============================================================================
  // listRenpyDefinitions
  // ============================================================================

  describe("listRenpyDefinitions", () => {
    it("should return empty array when project has no definitions", async () => {
      // Create a new project with no definitions
      const newProjectId = testUuid("15000000", 99);
      await db.insert(projects).values({
        id: newProjectId,
        userId: testUserId,
        name: "Empty Project",
        maxMeterDelta: 10,
      });

      const result = await listRenpyDefinitions(newProjectId, testUserId);

      expect(result).toEqual([]);

      // Clean up the empty project
      await db.delete(projects).where(eq(projects.id, newProjectId));
    });

    it("should return all definitions for owned project", async () => {
      const result = await listRenpyDefinitions(ownedProject.id!, testUserId);

      expect(result).toHaveLength(3);
      expect(result[0]).toMatchObject({
        id: testDefinition1.id!,
        projectId: ownedProject.id!,
        category: "CHARACTER",
        tag: "eileen",
        displayName: "Eileen",
        definitionCode: 'define a = Character("Eileen")',
        referenceTag: "a",
        sortOrder: 0,
      });
      expect(result[0].createdAt).toBeInstanceOf(Date);
      expect(result[0].updatedAt).toBeInstanceOf(Date);
    });

    it("should order by category then sortOrder", async () => {
      const result = await listRenpyDefinitions(ownedProject.id!, testUserId);

      // CHARACTER comes first (enum ordinal 0)
      expect(result[0].category).toBe("CHARACTER");
      expect(result[0].tag).toBe("eileen");

      // TRANSFORM comes second (enum ordinal 1)
      expect(result[1].category).toBe("TRANSFORM");
      expect(result[1].tag).toBe("fade_in");

      // IMAGE comes third (enum ordinal 2)
      expect(result[2].category).toBe("IMAGE");
      expect(result[2].tag).toBe("bg_forest");
    });

    it("should throw NotFoundError when user does not own project", async () => {
      await expect(
        listRenpyDefinitions(ownedProject.id!, otherUserId)
      ).rejects.toThrow("Project");
    });

    it("should throw NotFoundError when project does not exist", async () => {
      const nonExistentProjectId = testUuid("15000000", 999999999999);

      await expect(
        listRenpyDefinitions(nonExistentProjectId, testUserId)
      ).rejects.toThrow("Project");
    });

    it("should return definitions with null referenceTag", async () => {
      const result = await listRenpyDefinitions(ownedProject.id!, testUserId);

      const transformDef = result.find((d) => d.tag === "fade_in");
      expect(transformDef?.referenceTag).toBeNull();

      const imageDef = result.find((d) => d.tag === "bg_forest");
      expect(imageDef?.referenceTag).toBeNull();
    });
  });

  // ============================================================================
  // getRenpyDefinition
  // ============================================================================

  describe("getRenpyDefinition", () => {
    it("should return definition when user has access", async () => {
      const result = await getRenpyDefinition(
        testDefinition1.id!,
        testUserId
      );

      expect(result).not.toBeNull();
      expect(result).toMatchObject({
        id: testDefinition1.id!,
        projectId: ownedProject.id!,
        category: "CHARACTER",
        tag: "eileen",
        displayName: "Eileen",
        definitionCode: 'define a = Character("Eileen")',
        referenceTag: "a",
        sortOrder: 0,
      });
      expect(result?.createdAt).toBeInstanceOf(Date);
      expect(result?.updatedAt).toBeInstanceOf(Date);
    });

    it("should return null when definition does not exist", async () => {
      const nonExistentId = testUuid("25000000", 999999999999);
      const result = await getRenpyDefinition(nonExistentId, testUserId);

      expect(result).toBeNull();
    });

    it("should return null when user does not have access", async () => {
      const result = await getRenpyDefinition(
        testDefinition1.id!,
        otherUserId
      );

      expect(result).toBeNull();
    });

    it("should return definition with null referenceTag", async () => {
      const result = await getRenpyDefinition(
        testDefinition2.id!,
        testUserId
      );

      expect(result).not.toBeNull();
      expect(result?.referenceTag).toBeNull();
    });
  });

  // ============================================================================
  // createRenpyDefinition
  // ============================================================================

  describe("createRenpyDefinition", () => {
    it("should create definition with all fields", async () => {
      const body = {
        category: "INIT" as const,
        tag: "init_python",
        displayName: "Init Python Block",
        definitionCode: "init python:\n    pass",
        referenceTag: null,
        sortOrder: 0,
      };

      const result = await createRenpyDefinition(
        testUserId,
        ownedProject.id!,
        body
      );

      expect(result).toMatchObject({
        projectId: ownedProject.id!,
        category: "INIT",
        tag: "init_python",
        displayName: "Init Python Block",
        definitionCode: "init python:\n    pass",
        referenceTag: null,
        sortOrder: 0,
      });
      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);

      // Verify it was actually created in the database
      const [dbDefinition] = await db
        .select()
        .from(renpyDefinitions)
        .where(eq(renpyDefinitions.id, result.id))
        .limit(1);
      expect(dbDefinition).toBeDefined();
      expect(dbDefinition.tag).toBe("init_python");
    });

    it("should create definition with optional sortOrder omitted", async () => {
      const body = {
        category: "IMAGE" as const,
        tag: "bg_beach",
        displayName: "Beach Background",
        definitionCode: "image bg beach = 'beach.jpg'",
      };

      const result = await createRenpyDefinition(
        testUserId,
        ownedProject.id!,
        body
      );

      expect(result.sortOrder).toBe(0); // Default value
    });

    it("should throw NotFoundError when user does not own project", async () => {
      const body = {
        category: "CHARACTER" as const,
        tag: "unauthorized",
        displayName: "Unauthorized",
        definitionCode: "define u = Character('Unauthorized')",
      };

      await expect(
        createRenpyDefinition(otherUserId, ownedProject.id!, body)
      ).rejects.toThrow("Project");
    });

    it("should throw NotFoundError when project does not exist", async () => {
      const body = {
        category: "CHARACTER" as const,
        tag: "no_project",
        displayName: "No Project",
        definitionCode: "define n = Character('None')",
      };
      const nonExistentProjectId = testUuid("15000000", 999999999999);

      await expect(
        createRenpyDefinition(testUserId, nonExistentProjectId, body)
      ).rejects.toThrow("Project");
    });

    it("should throw ConflictError when tag already exists for project", async () => {
      const body = {
        category: "CHARACTER" as const,
        tag: "eileen", // Already exists
        displayName: "Duplicate Eileen",
        definitionCode: 'define a2 = Character("Eileen2")',
      };

      await expect(
        createRenpyDefinition(testUserId, ownedProject.id!, body)
      ).rejects.toThrow("Failed query");
    });

    it("should allow same tag in different projects", async () => {
      const body = {
        category: "CHARACTER" as const,
        tag: "eileen", // Same tag as in ownedProject
        displayName: "Other Eileen",
        definitionCode: 'define a = Character("Eileen")',
      };

      const result = await createRenpyDefinition(
        otherUserId,
        otherProject.id!,
        body
      );

      expect(result.tag).toBe("eileen");
      expect(result.projectId).toBe(otherProject.id!);
    });

    it("should accept all valid category values", async () => {
      const categories: Array<"CHARACTER" | "TRANSFORM" | "IMAGE" | "INIT"> = [
        "CHARACTER",
        "TRANSFORM",
        "IMAGE",
        "INIT",
      ];

      for (const category of categories) {
        const body = {
          category,
          tag: `test_${category.toLowerCase()}`,
          displayName: `${category} Test`,
          definitionCode: `# ${category} definition`,
        };

        const result = await createRenpyDefinition(
          testUserId,
          ownedProject.id!,
          body
        );

        expect(result.category).toBe(category);
      }
    });
  });

  // ============================================================================
  // updateRenpyDefinition
  // ============================================================================

  describe("updateRenpyDefinition", () => {
    it("should update tag", async () => {
      const body = {
        tag: "updated_eileen",
      };

      const result = await updateRenpyDefinition(
        testDefinition1.id!,
        testUserId,
        body
      );

      expect(result.tag).toBe("updated_eileen");
      expect(result.displayName).toBe("Eileen");
      expect(result.category).toBe("CHARACTER");
    });

    it("should update displayName", async () => {
      const body = {
        displayName: "Updated Eileen",
      };

      const result = await updateRenpyDefinition(
        testDefinition1.id!,
        testUserId,
        body
      );

      expect(result.displayName).toBe("Updated Eileen");
      expect(result.tag).toBe("eileen");
    });

    it("should update definitionCode", async () => {
      const body = {
        definitionCode: 'define aub = Character("Eileen", color="#c8c8ff")',
      };

      const result = await updateRenpyDefinition(
        testDefinition1.id!,
        testUserId,
        body
      );

      expect(result.definitionCode).toBe(
        'define aub = Character("Eileen", color="#c8c8ff")'
      );
    });

    it("should update category", async () => {
      const body = {
        category: "IMAGE" as const,
      };

      const result = await updateRenpyDefinition(
        testDefinition1.id!,
        testUserId,
        body
      );

      expect(result.category).toBe("IMAGE");
    });

    it("should update sortOrder", async () => {
      const body = {
        sortOrder: 5,
      };

      const result = await updateRenpyDefinition(
        testDefinition1.id!,
        testUserId,
        body
      );

      expect(result.sortOrder).toBe(5);
    });

    it("should update referenceTag to null", async () => {
      const body = {
        referenceTag: null,
      };

      const result = await updateRenpyDefinition(
        testDefinition1.id!,
        testUserId,
        body
      );

      expect(result.referenceTag).toBeNull();
    });

    it("should update referenceTag to a value", async () => {
      const body = {
        referenceTag: "aub",
      };

      const result = await updateRenpyDefinition(
        testDefinition2.id!, // Currently has null referenceTag
        testUserId,
        body
      );

      expect(result.referenceTag).toBe("aub");
    });

    it("should update all fields", async () => {
      const body = {
        category: "INIT" as const,
        tag: "fully_updated",
        displayName: "Fully Updated",
        definitionCode: "# Fully updated code",
        referenceTag: "fu" as const,
        sortOrder: 10,
      };

      const result = await updateRenpyDefinition(
        testDefinition1.id!,
        testUserId,
        body
      );

      expect(result).toMatchObject(body);
    });

    it("should throw NotFoundError when definition does not exist", async () => {
      const body = {
        tag: "updated",
      };
      const nonExistentId = testUuid("25000000", 999999999999);

      await expect(
        updateRenpyDefinition(nonExistentId, testUserId, body)
      ).rejects.toThrow("Ren'Py Definition");
    });

    it("should throw NotFoundError when user does not have access", async () => {
      const body = {
        tag: "updated",
      };

      await expect(
        updateRenpyDefinition(testDefinition1.id!, otherUserId, body)
      ).rejects.toThrow("Ren'Py Definition");
    });

    it("should throw ValidationError when no fields provided", async () => {
      const body = {};

      await expect(
        updateRenpyDefinition(testDefinition1.id!, testUserId, body)
      ).rejects.toThrow("No valid fields provided for update");
    });

    it("should throw ConflictError when tag already exists", async () => {
      const body = {
        tag: "bg_forest", // Already exists in same project
      };

      await expect(
        updateRenpyDefinition(testDefinition1.id!, testUserId, body)
      ).rejects.toThrow("Failed query");
    });

    it("should allow updating to same tag in different projects", async () => {
      const body = {
        tag: "eileen", // Exists in ownedProject
      };

      const result = await updateRenpyDefinition(
        otherDefinition.id!,
        otherUserId,
        body
      );

      expect(result.tag).toBe("eileen");
    });

    it("should set updatedAt on update", async () => {
      const beforeUpdate = new Date();
      await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay

      const body = {
        displayName: "Updated with timestamp",
      };

      const result = await updateRenpyDefinition(
        testDefinition1.id!,
        testUserId,
        body
      );

      expect(new Date(result.updatedAt).getTime()).toBeGreaterThanOrEqual(
        beforeUpdate.getTime()
      );
    });
  });

  // ============================================================================
  // deleteRenpyDefinition
  // ============================================================================

  describe("deleteRenpyDefinition", () => {
    it("should delete definition", async () => {
      const result = await deleteRenpyDefinition(
        testDefinition1.id!,
        testUserId
      );

      expect(result).toBe(true);

      // Verify it was actually deleted
      const [dbDefinition] = await db
        .select()
        .from(renpyDefinitions)
        .where(eq(renpyDefinitions.id, testDefinition1.id!))
        .limit(1);
      expect(dbDefinition).toBeUndefined();
    });

    it("should throw NotFoundError when definition does not exist", async () => {
      const nonExistentId = testUuid("25000000", 999999999999);

      await expect(
        deleteRenpyDefinition(nonExistentId, testUserId)
      ).rejects.toThrow("Ren'Py Definition");
    });

    it("should throw NotFoundError when user does not have access", async () => {
      await expect(
        deleteRenpyDefinition(testDefinition1.id!, otherUserId)
      ).rejects.toThrow("Ren'Py Definition");
    });

    it("should return true after successful deletion", async () => {
      // Create a definition specifically for deletion test
      const deleteTestId = testUuid("25000000", 5);
      await db.insert(renpyDefinitions).values({
        id: deleteTestId,
        projectId: ownedProject.id!,
        category: "CHARACTER",
        sortOrder: 0,
        tag: "to_delete",
        displayName: "To Delete",
        definitionCode: 'define d = Character("Delete")',
        referenceTag: null,
      });

      const result = await deleteRenpyDefinition(deleteTestId, testUserId);

      expect(result).toBe(true);
    });
  });

  // ============================================================================
  // Cascade delete behavior
  // ============================================================================

  describe("Cascade delete", () => {
    it("should cascade delete definitions when project is deleted", async () => {
      // Create a new project with definitions
      const cascadeProjectId = testUuid("15000000", 98);
      await db.insert(projects).values({
        id: cascadeProjectId,
        userId: testUserId,
        name: "Cascade Test Project",
        maxMeterDelta: 10,
      });

      const cascadeDefId = testUuid("25000000", 6);
      await db.insert(renpyDefinitions).values({
        id: cascadeDefId,
        projectId: cascadeProjectId,
        category: "CHARACTER",
        sortOrder: 0,
        tag: "cascade_char",
        displayName: "Cascade Char",
        definitionCode: 'define c = Character("Cascade")',
        referenceTag: null,
      });

      // Verify definition exists
      const [beforeDelete] = await db
        .select()
        .from(renpyDefinitions)
        .where(eq(renpyDefinitions.id, cascadeDefId))
        .limit(1);
      expect(beforeDelete).toBeDefined();

      // Delete the project
      await db.delete(projects).where(eq(projects.id, cascadeProjectId));

      // Verify definition was cascade deleted
      const [afterDelete] = await db
        .select()
        .from(renpyDefinitions)
        .where(eq(renpyDefinitions.id, cascadeDefId))
        .limit(1);
      expect(afterDelete).toBeUndefined();
    });
  });
});
