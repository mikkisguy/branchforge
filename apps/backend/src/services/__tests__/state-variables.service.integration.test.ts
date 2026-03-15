/**
 * State Variables Service Integration Tests
 *
 * Tests for the state variables service against a real database.
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
  stateVariables,
  type NewUser,
  type NewProject,
  type NewStateVariable,
} from "../../db/schema/index.js";
import { eq, and, inArray } from "drizzle-orm";
import {
  listStateVariables,
  getStateVariable,
  createStateVariable,
  updateStateVariable,
  deleteStateVariable,
} from "../state_variables.service.js";
import { testEmail, testUuid } from "../../utils/test-ids.js";

describe("StateVariablesService (Integration)", () => {
  let db: ReturnType<typeof getDb>;

  beforeAll(async () => {
    db = getDb();
  });

  // Test fixtures
  const testUserId = testUuid("04000000", 1);
  const otherUserId = testUuid("04000000", 2);

  const testUser: NewUser = {
    id: testUserId,
    email: testEmail("state-variables", "owner"),
    passwordHash: "hashed_password",
    role: "OWNER",
  };

  const otherUser: NewUser = {
    id: otherUserId,
    email: testEmail("state-variables", "other"),
    passwordHash: "hashed_password",
    role: "OWNER",
  };

  const ownedProject: NewProject = {
    id: testUuid("14000000", 1),
    userId: testUserId,
    name: "Owned Project",
    description: "A project owned by the user",
    maxMeterDelta: 10,
  };

  const otherProject: NewProject = {
    id: testUuid("14000000", 2),
    userId: otherUserId,
    name: "Other Project",
    description: "A project owned by another user",
    maxMeterDelta: 10,
  };

  const testStateVariable1: NewStateVariable = {
    id: testUuid("24000000", 1),
    projectId: ownedProject.id!,
    key: "met_eileen",
    description: "Player met Eileen",
    category: "characters",
  };

  const testStateVariable2: NewStateVariable = {
    id: testUuid("24000000", 2),
    projectId: ownedProject.id!,
    key: "lucas_route_unlocked",
    description: "Lucas route is available",
    category: "routes",
  };

  const otherStateVariable: NewStateVariable = {
    id: testUuid("24000000", 3),
    projectId: otherProject.id!,
    key: "other_variable",
    description: "Variable in other project",
    category: null,
  };

  // Helper to clean up all test data
  async function cleanupTestData() {
    const testUserIds = [testUserId, otherUserId];
    const projectIds = [ownedProject.id!, otherProject.id!];

    // Delete state variables for test projects
    await db
      .delete(stateVariables)
      .where(inArray(stateVariables.projectId, projectIds));

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

    // Insert state variables
    await db
      .insert(stateVariables)
      .values([testStateVariable1, testStateVariable2, otherStateVariable]);
  }

  beforeEach(async () => {
    await cleanupTestData();
    await setupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  // ============================================================================
  // listStateVariables
  // ============================================================================

  describe("listStateVariables", () => {
    it("should return empty array when project has no state variables", async () => {
      // Create a new project with no state variables
      const newProjectId = testUuid("14000000", 99);
      await db.insert(projects).values({
        id: newProjectId,
        userId: testUserId,
        name: "Empty Project",
        maxMeterDelta: 10,
      });

      const result = await listStateVariables(newProjectId, testUserId);

      expect(result).toEqual([]);

      // Clean up the empty project
      await db.delete(projects).where(eq(projects.id, newProjectId));
    });

    it("should return all state variables for owned project", async () => {
      const result = await listStateVariables(ownedProject.id!, testUserId);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: testStateVariable1.id!,
        projectId: ownedProject.id!,
        key: "met_eileen",
        description: "Player met Eileen",
        category: "characters",
      });
      expect(result[1]).toMatchObject({
        id: testStateVariable2.id!,
        key: "lucas_route_unlocked",
        category: "routes",
      });
      expect(result[0].createdAt).toBeInstanceOf(Date);
    });

    it("should order by category then key", async () => {
      // Add a variable that should appear first alphabetically in same category
      await db.insert(stateVariables).values({
        id: testUuid("24000000", 4),
        projectId: ownedProject.id!,
        key: "avery_met", // Alphabetically before "met_eileen"
        description: "Met Avery",
        category: "characters",
      });

      const result = await listStateVariables(ownedProject.id!, testUserId);

      // "characters" category comes before "routes" alphabetically
      // Within "characters", "avery_met" comes before "met_eileen"
      expect(result[0].key).toBe("avery_met");
      expect(result[1].key).toBe("met_eileen");
      expect(result[2].key).toBe("lucas_route_unlocked");
    });

    it("should throw NotFoundError when user does not own project", async () => {
      await expect(
        listStateVariables(ownedProject.id!, otherUserId)
      ).rejects.toThrow("Project");
    });

    it("should throw NotFoundError when project does not exist", async () => {
      const nonExistentProjectId = testUuid("14000000", 999999999999);

      await expect(
        listStateVariables(nonExistentProjectId, testUserId)
      ).rejects.toThrow("Project");
    });

    it("should return state variables with null category and description", async () => {
      // Add a state variable with null category and description
      const nullVarId = testUuid("24000000", 5);
      await db.insert(stateVariables).values({
        id: nullVarId,
        projectId: ownedProject.id!,
        key: "no_category",
        description: null,
        category: null,
      });

      const result = await listStateVariables(ownedProject.id!, testUserId);
      const nullVar = result.find((v) => v.key === "no_category");

      expect(nullVar).toBeDefined();
      expect(nullVar?.category).toBeNull();
      expect(nullVar?.description).toBeNull();
    });
  });

  // ============================================================================
  // getStateVariable
  // ============================================================================

  describe("getStateVariable", () => {
    it("should return state variable when user has access", async () => {
      const result = await getStateVariable(testStateVariable1.id!, testUserId);

      expect(result).not.toBeNull();
      expect(result).toMatchObject({
        id: testStateVariable1.id!,
        projectId: ownedProject.id!,
        key: "met_eileen",
        description: "Player met Eileen",
        category: "characters",
      });
      expect(result?.createdAt).toBeInstanceOf(Date);
    });

    it("should return null when state variable does not exist", async () => {
      const nonExistentId = testUuid("24000000", 999999999999);
      const result = await getStateVariable(nonExistentId, testUserId);

      expect(result).toBeNull();
    });

    it("should return null when user does not have access", async () => {
      const result = await getStateVariable(
        testStateVariable1.id!,
        otherUserId
      );

      expect(result).toBeNull();
    });

    it("should return state variable with null fields", async () => {
      const nullVarId = testUuid("24000000", 6);
      await db.insert(stateVariables).values({
        id: nullVarId,
        projectId: ownedProject.id!,
        key: "null_fields",
        description: null,
        category: null,
      });

      const result = await getStateVariable(nullVarId, testUserId);

      expect(result).not.toBeNull();
      expect(result?.category).toBeNull();
      expect(result?.description).toBeNull();
    });
  });

  // ============================================================================
  // createStateVariable
  // ============================================================================

  describe("createStateVariable", () => {
    it("should create state variable with all fields", async () => {
      const body = {
        key: "new_variable",
        description: "A new state variable",
        category: "test",
      };

      const result = await createStateVariable(
        testUserId,
        ownedProject.id!,
        body
      );

      expect(result).toMatchObject({
        projectId: ownedProject.id!,
        key: "new_variable",
        description: "A new state variable",
        category: "test",
      });
      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeInstanceOf(Date);

      // Verify it was actually created in the database
      const [dbVariable] = await db
        .select()
        .from(stateVariables)
        .where(eq(stateVariables.id, result.id))
        .limit(1);
      expect(dbVariable).toBeDefined();
      expect(dbVariable.key).toBe("new_variable");
    });

    it("should create state variable with optional fields omitted", async () => {
      const body = {
        key: "minimal_variable",
      };

      const result = await createStateVariable(
        testUserId,
        ownedProject.id!,
        body
      );

      expect(result).toMatchObject({
        key: "minimal_variable",
        description: null,
        category: null,
      });
    });

    it("should throw NotFoundError when user does not own project", async () => {
      const body = {
        key: "unauthorized_variable",
      };

      await expect(
        createStateVariable(otherUserId, ownedProject.id!, body)
      ).rejects.toThrow("Project");
    });

    it("should throw NotFoundError when project does not exist", async () => {
      const body = {
        key: "no_project_variable",
      };
      const nonExistentProjectId = testUuid("14000000", 999999999999);

      await expect(
        createStateVariable(testUserId, nonExistentProjectId, body)
      ).rejects.toThrow("Project");
    });

    it("should throw ConflictError when key already exists for project", async () => {
      const body = {
        key: "met_eileen", // Already exists
      };

      await expect(
        createStateVariable(testUserId, ownedProject.id!, body)
      ).rejects.toThrow("Failed query");
    });

    it("should allow same key in different projects", async () => {
      const body = {
        key: "met_eileen", // Same key as in ownedProject
      };

      const result = await createStateVariable(
        otherUserId,
        otherProject.id!,
        body
      );

      expect(result.key).toBe("met_eileen");
      expect(result.projectId).toBe(otherProject.id!);
    });
  });

  // ============================================================================
  // updateStateVariable
  // ============================================================================

  describe("updateStateVariable", () => {
    it("should update key", async () => {
      const body = {
        key: "updated_key",
      };

      const result = await updateStateVariable(
        testStateVariable1.id!,
        testUserId,
        body
      );

      expect(result.key).toBe("updated_key");
      expect(result.description).toBe("Player met Eileen");
      expect(result.category).toBe("characters");
    });

    it("should update description", async () => {
      const body = {
        description: "Updated description",
      };

      const result = await updateStateVariable(
        testStateVariable1.id!,
        testUserId,
        body
      );

      expect(result.description).toBe("Updated description");
      expect(result.key).toBe("met_eileen");
    });

    it("should update category", async () => {
      const body = {
        category: "updated_category",
      };

      const result = await updateStateVariable(
        testStateVariable1.id!,
        testUserId,
        body
      );

      expect(result.category).toBe("updated_category");
    });

    it("should update all fields", async () => {
      const body = {
        key: "fully_updated",
        description: "Fully updated description",
        category: "updated",
      };

      const result = await updateStateVariable(
        testStateVariable1.id!,
        testUserId,
        body
      );

      expect(result).toMatchObject(body);
    });

    it("should update to null values", async () => {
      const body = {
        description: null,
        category: null,
      };

      const result = await updateStateVariable(
        testStateVariable1.id!,
        testUserId,
        body
      );

      expect(result.description).toBeNull();
      expect(result.category).toBeNull();
    });

    it("should throw NotFoundError when state variable does not exist", async () => {
      const body = {
        key: "updated",
      };
      const nonExistentId = testUuid("24000000", 999999999999);

      await expect(
        updateStateVariable(nonExistentId, testUserId, body)
      ).rejects.toThrow("State Variable");
    });

    it("should throw NotFoundError when user does not have access", async () => {
      const body = {
        key: "updated",
      };

      await expect(
        updateStateVariable(testStateVariable1.id!, otherUserId, body)
      ).rejects.toThrow("State Variable");
    });

    it("should throw ValidationError when no fields provided", async () => {
      const body = {};

      await expect(
        updateStateVariable(testStateVariable1.id!, testUserId, body)
      ).rejects.toThrow("No valid fields provided for update");
    });

    it("should throw ConflictError when key already exists", async () => {
      const body = {
        key: "lucas_route_unlocked", // Already exists in same project
      };

      await expect(
        updateStateVariable(testStateVariable1.id!, testUserId, body)
      ).rejects.toThrow("Failed query");
    });

    it("should allow updating to same key in different projects", async () => {
      // This verifies that the unique constraint is on (projectId, key)
      // and not just on key globally
      const body = {
        key: "lucas_route_unlocked", // Exists in ownedProject
      };

      // otherStateVariable is in otherProject, so this should work
      const result = await updateStateVariable(
        otherStateVariable.id!,
        otherUserId,
        body
      );

      expect(result.key).toBe("lucas_route_unlocked");
    });
  });

  // ============================================================================
  // deleteStateVariable
  // ============================================================================

  describe("deleteStateVariable", () => {
    it("should delete state variable", async () => {
      const result = await deleteStateVariable(
        testStateVariable1.id!,
        testUserId
      );

      expect(result).toBe(true);

      // Verify it was actually deleted
      const [dbVariable] = await db
        .select()
        .from(stateVariables)
        .where(eq(stateVariables.id, testStateVariable1.id!))
        .limit(1);
      expect(dbVariable).toBeUndefined();
    });

    it("should throw NotFoundError when state variable does not exist", async () => {
      const nonExistentId = testUuid("24000000", 999999999999);

      await expect(
        deleteStateVariable(nonExistentId, testUserId)
      ).rejects.toThrow("State Variable");
    });

    it("should throw NotFoundError when user does not have access", async () => {
      await expect(
        deleteStateVariable(testStateVariable1.id!, otherUserId)
      ).rejects.toThrow("State Variable");
    });

    it("should return true after successful deletion", async () => {
      // Create a variable specifically for deletion test
      const deleteTestId = testUuid("24000000", 7);
      await db.insert(stateVariables).values({
        id: deleteTestId,
        projectId: ownedProject.id!,
        key: "to_delete",
        description: "This will be deleted",
        category: null,
      });

      const result = await deleteStateVariable(deleteTestId, testUserId);

      expect(result).toBe(true);
    });
  });
});
