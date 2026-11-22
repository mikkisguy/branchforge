/**
 * Variables Service Integration Tests
 *
 * Tests for the variables service against a real database.
 * These tests cover CRUD operations with authorization checks.
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
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import { getDb } from "../../db/index.js";
import {
  users,
  projects,
  projectFiles,
  variables,
  type NewUser,
  type NewProject,
  type NewVariable,
} from "../../db/schema/index.js";
import { eq, inArray, sql } from "drizzle-orm";
import {
  listVariables,
  getVariable,
  createVariable,
  updateVariable,
  deleteVariable,
  listVariableReferences,
} from "../variables.service.js";
import { testEmail, testUuid } from "../../utils/test-ids.js";
import { updateFileContent } from "../projects.service.js";
import { calculateContentHash } from "../../lib/hash.js";
import { variablesRoutes } from "../../routes/variables.routes.js";
import { globalErrorHandler } from "../../middleware/error-handler.middleware.js";

describe("VariablesService (Integration)", () => {
  let db: ReturnType<typeof getDb>;

  beforeAll(async () => {
    db = getDb();
  });

  // Test fixtures
  const testUserId = testUuid("04000000", 1);
  const otherUserId = testUuid("04000000", 2);

  const testUser: NewUser = {
    id: testUserId,
    email: testEmail("variables", "owner"),
    passwordHash: "hashed_password",
    role: "OWNER",
  };

  const otherUser: NewUser = {
    id: otherUserId,
    email: testEmail("variables", "other"),
    passwordHash: "hashed_password",
    role: "OWNER",
  };

  const ownedProject: NewProject = {
    id: testUuid("14000000", 1),
    userId: testUserId,
    name: "Owned Project",
    description: "A project owned by the user",
    maxStatDelta: 10,
    source: "ZIP",
  };

  const otherProject: NewProject = {
    id: testUuid("14000000", 2),
    userId: otherUserId,
    name: "Other Project",
    description: "A project owned by another user",
    maxStatDelta: 10,
    source: "ZIP",
  };

  const testVariable1: NewVariable = {
    id: testUuid("24000000", 1),
    projectId: ownedProject.id!,
    key: "met_eileen",
    description: "Player met Eileen",
    category: "characters",
  };

  const testVariable2: NewVariable = {
    id: testUuid("24000000", 2),
    projectId: ownedProject.id!,
    key: "lucas_route_unlocked",
    description: "Lucas route is available",
    category: "routes",
  };

  const otherVariable: NewVariable = {
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

    // Delete variables for test projects
    await db.delete(variables).where(inArray(variables.projectId, projectIds));

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

    // Insert variables
    await db
      .insert(variables)
      .values([testVariable1, testVariable2, otherVariable]);
  }

  beforeEach(async () => {
    await cleanupTestData();
    await setupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  // ============================================================================
  // listVariables
  // ============================================================================

  describe("listVariables", () => {
    it("should return empty array when project has no variables", async () => {
      // Create a new project with no variables
      const newProjectId = testUuid("14000000", 99);
      await db.insert(projects).values({
        id: newProjectId,
        userId: testUserId,
        name: "Empty Project",
        maxStatDelta: 10,
        source: "ZIP",
      });

      const result = await listVariables(newProjectId, testUserId);

      expect(result).toEqual([]);

      // Clean up the empty project
      await db.delete(projects).where(eq(projects.id, newProjectId));
    });

    it("should return all variables for owned project", async () => {
      const result = await listVariables(ownedProject.id!, testUserId);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: testVariable1.id!,
        projectId: ownedProject.id!,
        key: "met_eileen",
        description: "Player met Eileen",
        category: "characters",
      });
      expect(result[1]).toMatchObject({
        id: testVariable2.id!,
        key: "lucas_route_unlocked",
        category: "routes",
      });
      expect(result[0].createdAt).toBeInstanceOf(Date);
    });

    it("should order by category then key", async () => {
      // Add a variable that should appear first alphabetically in same category
      await db.insert(variables).values({
        id: testUuid("24000000", 4),
        projectId: ownedProject.id!,
        key: "avery_met", // Alphabetically before "met_eileen"
        description: "Met Avery",
        category: "characters",
      });

      const result = await listVariables(ownedProject.id!, testUserId);

      // "characters" category comes before "routes" alphabetically
      // Within "characters", "avery_met" comes before "met_eileen"
      expect(result[0].key).toBe("avery_met");
      expect(result[1].key).toBe("met_eileen");
      expect(result[2].key).toBe("lucas_route_unlocked");
    });

    it("should throw NotFoundError when user does not own project", async () => {
      await expect(
        listVariables(ownedProject.id!, otherUserId)
      ).rejects.toThrow("Project");
    });

    it("should throw NotFoundError when project does not exist", async () => {
      const nonExistentProjectId = testUuid("14000000", 999999999999);

      await expect(
        listVariables(nonExistentProjectId, testUserId)
      ).rejects.toThrow("Project");
    });

    it("should return variables with null category and description", async () => {
      // Add a variable with null category and description
      const nullVarId = testUuid("24000000", 5);
      await db.insert(variables).values({
        id: nullVarId,
        projectId: ownedProject.id!,
        key: "no_category",
        description: null,
        category: null,
      });

      const result = await listVariables(ownedProject.id!, testUserId);
      const nullVar = result.find((v) => v.key === "no_category");

      expect(nullVar).toBeDefined();
      expect(nullVar?.category).toBeNull();
      expect(nullVar?.description).toBeNull();
    });
  });

  // ============================================================================
  // getVariable
  // ============================================================================

  describe("getVariable", () => {
    it("should return variable when user has access", async () => {
      const result = await getVariable(testVariable1.id!, testUserId);

      expect(result).not.toBeNull();
      expect(result).toMatchObject({
        id: testVariable1.id!,
        projectId: ownedProject.id!,
        key: "met_eileen",
        description: "Player met Eileen",
        category: "characters",
      });
      expect(result?.createdAt).toBeInstanceOf(Date);
    });

    it("should return null when variable does not exist", async () => {
      const nonExistentId = testUuid("24000000", 999999999999);
      const result = await getVariable(nonExistentId, testUserId);

      expect(result).toBeNull();
    });

    it("should return null when user does not have access", async () => {
      const result = await getVariable(testVariable1.id!, otherUserId);

      expect(result).toBeNull();
    });

    it("should return variable with null fields", async () => {
      const nullVarId = testUuid("24000000", 6);
      await db.insert(variables).values({
        id: nullVarId,
        projectId: ownedProject.id!,
        key: "null_fields",
        description: null,
        category: null,
      });

      const result = await getVariable(nullVarId, testUserId);

      expect(result).not.toBeNull();
      expect(result?.category).toBeNull();
      expect(result?.description).toBeNull();
    });
  });

  // ============================================================================
  // createVariable
  // ============================================================================

  describe("createVariable", () => {
    it("should create variable with all fields", async () => {
      const body = {
        key: "new_variable",
        description: "A new variable",
        category: "test",
      };

      const result = await createVariable(testUserId, ownedProject.id!, body);

      expect(result).toMatchObject({
        projectId: ownedProject.id!,
        key: "new_variable",
        description: "A new variable",
        category: "test",
      });
      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeInstanceOf(Date);

      // Verify it was actually created in the database
      const [dbVariable] = await db
        .select()
        .from(variables)
        .where(eq(variables.id, result.id))
        .limit(1);
      expect(dbVariable).toBeDefined();
      expect(dbVariable.key).toBe("new_variable");
    });

    it("should create variable with optional fields omitted", async () => {
      const body = {
        key: "minimal_variable",
      };

      const result = await createVariable(testUserId, ownedProject.id!, body);

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
        createVariable(otherUserId, ownedProject.id!, body)
      ).rejects.toThrow("Project");
    });

    it("should throw NotFoundError when project does not exist", async () => {
      const body = {
        key: "no_project_variable",
      };
      const nonExistentProjectId = testUuid("14000000", 999999999999);

      await expect(
        createVariable(testUserId, nonExistentProjectId, body)
      ).rejects.toThrow("Project");
    });

    it("should throw ConflictError when key already exists for project", async () => {
      const body = {
        key: "met_eileen", // Already exists
      };

      await expect(
        createVariable(testUserId, ownedProject.id!, body)
      ).rejects.toThrow("Variable key already exists for this project");
    });

    it("should allow same key in different projects", async () => {
      const body = {
        key: "met_eileen", // Same key as in ownedProject
      };

      const result = await createVariable(otherUserId, otherProject.id!, body);

      expect(result.key).toBe("met_eileen");
      expect(result.projectId).toBe(otherProject.id!);
    });
  });

  // ============================================================================
  // updateVariable
  // ============================================================================

  describe("updateVariable", () => {
    it("should update description", async () => {
      const body = {
        description: "Updated description",
      };

      const result = await updateVariable(testVariable1.id!, testUserId, body);

      expect(result.description).toBe("Updated description");
      expect(result.key).toBe("met_eileen");
    });

    it("should update category", async () => {
      const body = {
        category: "updated_category",
      };

      const result = await updateVariable(testVariable1.id!, testUserId, body);

      expect(result.category).toBe("updated_category");
    });

    it("should update all fields", async () => {
      const body = {
        description: "Fully updated description",
        category: "updated",
      };

      const result = await updateVariable(testVariable1.id!, testUserId, body);

      expect(result).toMatchObject(body);
    });

    it("should update to null values", async () => {
      const body = {
        description: null,
        category: null,
      };

      const result = await updateVariable(testVariable1.id!, testUserId, body);

      expect(result.description).toBeNull();
      expect(result.category).toBeNull();
    });

    it("should throw NotFoundError when variable does not exist", async () => {
      const body = {
        description: "updated",
      };
      const nonExistentId = testUuid("24000000", 999999999999);

      await expect(
        updateVariable(nonExistentId, testUserId, body)
      ).rejects.toThrow("Variable");
    });

    it("should ignore key updates", async () => {
      const body: {
        description: string;
        key: string;
      } = {
        description: "updated",
        key: "new_key",
      };

      let result: Awaited<ReturnType<typeof updateVariable>> | null = null;
      let updateError: unknown = null;

      try {
        result = await updateVariable(testVariable1.id!, testUserId, body);
      } catch (error) {
        updateError = error;
      }

      if (updateError) {
        expect(updateError).toBeInstanceOf(Error);
      } else {
        expect(result?.key).toBe(testVariable1.key);

        const [dbVariable] = await db
          .select()
          .from(variables)
          .where(eq(variables.id, testVariable1.id!))
          .limit(1);

        expect(dbVariable?.key).toBe(testVariable1.key);
      }
    });

    it("should throw NotFoundError when user does not have access", async () => {
      const body = {
        description: "updated",
      };

      await expect(
        updateVariable(testVariable1.id!, otherUserId, body)
      ).rejects.toThrow("Variable");
    });

    it("should throw ValidationError when no fields provided", async () => {
      const body = {};

      await expect(
        updateVariable(testVariable1.id!, testUserId, body)
      ).rejects.toThrow("No valid fields provided for update");
    });
  });

  // ============================================================================
  // deleteVariable
  // ============================================================================

  describe("deleteVariable", () => {
    const fileId = testUuid("34000000", 1);
    const filePath = "game/chapter.rpy";
    const unusedContent =
      "label chapter:\n    if persistent.met_eileen:\n        pass\n";
    const referencedContent =
      unusedContent + "    elif met_eileen:\n        $ met_eileen = True\n";

    async function addScript(content: string) {
      await db.insert(projectFiles).values({
        id: fileId,
        projectId: ownedProject.id!,
        source: "ZIP",
        fileType: "STORY",
        filePath,
        content,
        contentHash: calculateContentHash(content),
      });
    }

    it("blocks a direct DELETE after the preview becomes stale and leaves the source and defaults intact", async () => {
      await addScript(unusedContent);
      await db
        .update(variables)
        .set({ authoredDefault: true })
        .where(eq(variables.id, testVariable1.id!));

      const app = Fastify();
      app.register(cookie);
      app.register(session, {
        secret: "test-session-secret-at-least-32-characters",
        cookie: { secure: false },
      });
      app.setErrorHandler(globalErrorHandler);
      app.register(variablesRoutes);
      app.post("/test-login", async (request, reply) => {
        request.session.user = {
          id: testUserId,
          email: testUser.email,
          role: "OWNER",
        };
        return reply.status(204).send();
      });

      try {
        const login = await app.inject({ method: "POST", url: "/test-login" });
        const cookies = { [login.cookies[0].name]: login.cookies[0].value };
        const url = `/variables/${testVariable1.id}`;
        const preview = await app.inject({ url: `${url}/references`, cookies });
        expect(preview.statusCode).toBe(200);
        expect(preview.json()).toEqual({ references: [] });

        await updateFileContent(fileId, testUserId, referencedContent);
        const before = {
          files: await db
            .select()
            .from(projectFiles)
            .where(eq(projectFiles.id, fileId)),
          variables: await db
            .select()
            .from(variables)
            .where(eq(variables.projectId, ownedProject.id!)),
        };
        const rejected = await app.inject({ method: "DELETE", url, cookies });
        expect(rejected.statusCode).toBe(409);
        expect(rejected.json()).toMatchObject({
          reason: "VARIABLE_IN_USE",
          references: [
            { fileId, filePath, line: 4, kind: "condition" },
            { fileId, filePath, line: 5, kind: "assignment" },
          ],
        });
        expect(
          await db
            .select()
            .from(projectFiles)
            .where(eq(projectFiles.id, fileId))
        ).toEqual(before.files);
        expect(
          await db
            .select()
            .from(variables)
            .where(eq(variables.projectId, ownedProject.id!))
        ).toEqual(before.variables);

        await updateFileContent(fileId, testUserId, unusedContent);
        const [resolvedFile] = await db
          .select()
          .from(projectFiles)
          .where(eq(projectFiles.id, fileId));
        const deleted = await app.inject({ method: "DELETE", url, cookies });
        expect(deleted.statusCode).toBe(204);
        expect(await getVariable(testVariable1.id!, testUserId)).toBeNull();
        expect(await getVariable(testVariable2.id!, testUserId)).not.toBeNull();
        expect(
          await db
            .select()
            .from(projectFiles)
            .where(eq(projectFiles.id, fileId))
        ).toEqual([resolvedFile]);
      } finally {
        await app.close();
      }
    });

    it("waits for a file-only source writer before deciding whether to delete", async () => {
      await addScript(unusedContent);
      const fileLocked = Promise.withResolvers<void>();
      const releaseWriter = Promise.withResolvers<void>();
      const writer = db.transaction(async (tx) => {
        await tx
          .select({ id: projectFiles.id })
          .from(projectFiles)
          .where(eq(projectFiles.id, fileId))
          .for("update");
        fileLocked.resolve();
        await releaseWriter.promise;
        await tx
          .update(projectFiles)
          .set({
            content: referencedContent,
            contentHash: calculateContentHash(referencedContent),
          })
          .where(eq(projectFiles.id, fileId));
      });
      await Promise.race([fileLocked.promise, writer]);
      const deletion = deleteVariable(testVariable1.id!, testUserId);
      const result = expect(deletion).rejects.toMatchObject({
        reason: "VARIABLE_IN_USE",
      });
      try {
        await vi.waitFor(
          async () => {
            const { rows } = await db.execute(sql`
            select 1 from pg_stat_activity
            where datname = current_database() and wait_event_type = 'Lock'
              and query like 'select%from "project_files"%for update'
          `);
            expect(rows).toHaveLength(1);
          },
          { timeout: 5000 }
        );
      } finally {
        releaseWriter.resolve();
        await Promise.all([writer, result]);
      }
    });

    it("rejects reference lookup for another project's variable", async () => {
      await expect(
        listVariableReferences(testVariable1.id!, otherUserId)
      ).rejects.toThrow("Variable");
    });

    it("finds references across active project files and skips deleted files", async () => {
      await addScript(referencedContent);
      const settingsId = testUuid("34000000", 2);
      const content =
        'screen other():\n    if met_eileen == False:\n        text "Optional"';
      await db.insert(projectFiles).values([
        {
          id: settingsId,
          projectId: ownedProject.id!,
          source: "ZIP",
          fileType: "SETTINGS",
          filePath: "game/settings.rpy",
          content,
          contentHash: calculateContentHash(content),
        },
        {
          projectId: ownedProject.id!,
          source: "GITLAB",
          fileType: "STORY",
          filePath: "game/removed.rpy",
          content,
          contentHash: calculateContentHash(content),
          deletedAt: new Date(),
        },
      ]);

      const references = await listVariableReferences(
        testVariable1.id!,
        testUserId
      );
      expect(references).toEqual([
        { fileId, filePath, line: 4, kind: "condition" },
        { fileId, filePath, line: 5, kind: "assignment" },
        {
          fileId: settingsId,
          filePath: "game/settings.rpy",
          line: 2,
          kind: "condition",
        },
      ]);
    });

    it("should delete variable", async () => {
      const result = await deleteVariable(testVariable1.id!, testUserId);

      expect(result).toBe(true);

      // Verify it was actually deleted
      const [dbVariable] = await db
        .select()
        .from(variables)
        .where(eq(variables.id, testVariable1.id!))
        .limit(1);
      expect(dbVariable).toBeUndefined();
    });

    it("should throw NotFoundError when variable does not exist", async () => {
      const nonExistentId = testUuid("24000000", 999999999999);

      await expect(deleteVariable(nonExistentId, testUserId)).rejects.toThrow(
        "Variable"
      );
    });

    it("should throw NotFoundError when user does not have access", async () => {
      await expect(
        deleteVariable(testVariable1.id!, otherUserId)
      ).rejects.toThrow("Variable");
    });

    it("should return true after successful deletion", async () => {
      // Create a variable specifically for deletion test
      const deleteTestId = testUuid("24000000", 7);
      await db.insert(variables).values({
        id: deleteTestId,
        projectId: ownedProject.id!,
        key: "to_delete",
        description: "This will be deleted",
        category: null,
      });

      const result = await deleteVariable(deleteTestId, testUserId);

      expect(result).toBe(true);
    });
  });
});
