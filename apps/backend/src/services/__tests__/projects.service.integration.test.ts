/**
 * Projects Service Integration Tests
 *
 * Tests for the projects service against a real database.
 * These tests cover complex queries that are difficult to mock.
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
  type NewUser,
  type NewProject,
} from "../../db/schema/index.js";
import { eq, and, inArray } from "drizzle-orm";
import {
  listProjects,
  getProject,
  createProject,
} from "../projects.service.js";
import { testEmail, testUuid } from "../../utils/test-ids.js";

describe("ProjectsService (Integration)", () => {
  let db: ReturnType<typeof getDb>;

  beforeAll(async () => {
    db = getDb();
  });

  // Test fixtures
  const testUserId = testUuid("02000000", 1);
  const otherUserId = testUuid("02000000", 2);
  const thirdUserId = testUuid("02000000", 3);

  const testUser: NewUser = {
    id: testUserId,
    email: testEmail("projects-service", "owner"),
    passwordHash: "hashed_password",
    role: "OWNER",
  };

  const otherUser: NewUser = {
    id: otherUserId,
    email: testEmail("projects-service", "other"),
    passwordHash: "hashed_password",
    role: "OWNER",
  };

  const thirdUser: NewUser = {
    id: thirdUserId,
    email: testEmail("projects-service", "third"),
    passwordHash: "hashed_password",
    role: "READER",
  };

  const ownedProject: NewProject = {
    id: testUuid("12000000", 1),
    userId: testUserId,
    name: "Owned Project",
    description: "A project owned by the user",
    maxMeterDelta: 10,
  };

  const sharedProject: NewProject = {
    id: testUuid("12000000", 2),
    userId: otherUserId,
    name: "Shared Project",
    description: "A project shared with the user",
    maxMeterDelta: 15,
  };

  // Helper to clean up all test data including additional users created during tests
  // Cleans up ALL projects owned by test users, not just the fixture projects
  async function cleanupTestData() {
    const testUserIds = [testUserId, otherUserId, thirdUserId];

    // Delete all projectUsers entries for test users
    await db
      .delete(projectUsers)
      .where(inArray(projectUsers.userId, testUserIds));

    // Delete ALL projects owned by test users (covers fixture projects + any created during tests)
    await db.delete(projects).where(inArray(projects.userId, testUserIds));

    // Delete the test users
    await db.delete(users).where(inArray(users.id, testUserIds));
  }

  // Helper to set up test data
  async function setupTestData() {
    // Insert users
    await db.insert(users).values([testUser, otherUser]);

    // Insert projects
    await db.insert(projects).values([ownedProject, sharedProject]);
  }

  beforeEach(async () => {
    await cleanupTestData();
    await setupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe("listProjects", () => {
    const ownedProjectId: string = ownedProject.id!;
    const sharedProjectId: string = sharedProject.id!;

    it("should return empty array when user has no projects", async () => {
      // Clean up the test data to have no projects
      await cleanupTestData();

      // Create only the user, no projects
      await db.insert(users).values(testUser);

      const projects = await listProjects(testUserId);

      expect(projects).toEqual([]);
    });

    it("should return list of user-owned projects", async () => {
      const projects = await listProjects(testUserId);

      expect(projects).toHaveLength(1);
      expect(projects[0]).toMatchObject({
        id: ownedProjectId,
        name: "Owned Project",
        description: "A project owned by the user",
        maxMeterDelta: 10,
      });
      expect(projects[0].createdAt).toBeInstanceOf(Date);
      expect(projects[0].updatedAt).toBeInstanceOf(Date);
    });

    it("should return both owned and shared projects", async () => {
      // Share the other user's project with test user
      await db.insert(projectUsers).values({
        projectId: sharedProjectId,
        userId: testUserId,
        role: "READER",
      });

      const projects = await listProjects(testUserId);

      expect(projects).toHaveLength(2);

      const projectNames = projects.map((p) => p.name);
      expect(projectNames).toContain("Owned Project");
      expect(projectNames).toContain("Shared Project");

      // Verify visibility is set correctly
      const owned = projects.find((p) => p.id === ownedProjectId);
      const shared = projects.find((p) => p.id === sharedProjectId);

      expect(owned?.visibility).toBe("OWNER");
      expect(shared?.visibility).toBe("READER");
    });

    it("should not duplicate projects that are both owned and shared", async () => {
      // Share the owned project with the same user (edge case)
      await db.insert(projectUsers).values({
        projectId: ownedProjectId,
        userId: testUserId,
        role: "READER",
      });

      const projects = await listProjects(testUserId);

      // Should still only have one project (the owned one)
      expect(projects).toHaveLength(1);
      expect(projects[0].id).toBe(ownedProjectId);
      expect(projects[0].visibility).toBe("OWNER"); // Should prioritize owner role
    });

    it("should return only shared projects when user owns none", async () => {
      // Create third user who only has shared access
      await db.insert(users).values(thirdUser);

      // Share owned project with third user
      await db.insert(projectUsers).values({
        projectId: ownedProjectId,
        userId: thirdUserId,
        role: "READER",
      });

      const projects = await listProjects(thirdUserId);

      expect(projects).toHaveLength(1);
      expect(projects[0].id).toBe(ownedProjectId);
      expect(projects[0].visibility).toBe("READER");
    });
  });

  describe("getProject", () => {
    it("should return null when project does not exist", async () => {
      const nonExistentProjectId = testUuid("12000000", 999999999999);
      const project = await getProject(nonExistentProjectId, testUserId);

      expect(project).toBeNull();
    });

    it("should return project when user is the owner", async () => {
      const project = await getProject(ownedProject.id!, testUserId);

      expect(project).not.toBeNull();
      expect(project).toMatchObject({
        id: ownedProject.id,
        name: "Owned Project",
        description: "A project owned by the user",
        maxMeterDelta: 10,
        visibility: "OWNER",
      });
      expect(project?.createdAt).toBeInstanceOf(Date);
      expect(project?.updatedAt).toBeInstanceOf(Date);
    });

    it("should return project when user has shared access", async () => {
      // Share the other user's project with test user
      await db.insert(projectUsers).values({
        projectId: sharedProject.id!,
        userId: testUserId,
        role: "READER",
      });

      const project = await getProject(sharedProject.id!, testUserId);

      expect(project).not.toBeNull();
      expect(project).toMatchObject({
        id: sharedProject.id,
        name: "Shared Project",
        description: "A project shared with the user",
        maxMeterDelta: 15,
        visibility: "READER",
      });
    });

    it("should return null when user does not have access to project", async () => {
      // Third user has no access to either project
      await db.insert(users).values(thirdUser);

      const project = await getProject(ownedProject.id!, thirdUserId);

      expect(project).toBeNull();
    });

    it("should prioritize owner access over shared access", async () => {
      // Share the owned project with the same user (edge case)
      await db.insert(projectUsers).values({
        projectId: ownedProject.id!,
        userId: testUserId,
        role: "TESTER",
      });

      const project = await getProject(ownedProject.id!, testUserId);

      expect(project).not.toBeNull();
      expect(project?.visibility).toBe("OWNER");
    });

    it("should return correct visibility for shared project with different roles", async () => {
      // Test with READER role
      await db.insert(projectUsers).values({
        projectId: sharedProject.id!,
        userId: testUserId,
        role: "READER",
      });

      let project = await getProject(sharedProject.id!, testUserId);
      expect(project?.visibility).toBe("READER");

      // Update to TESTER role
      await db
        .delete(projectUsers)
        .where(
          and(
            eq(projectUsers.projectId, sharedProject.id!),
            eq(projectUsers.userId, testUserId)
          )
        );
      await db.insert(projectUsers).values({
        projectId: sharedProject.id!,
        userId: testUserId,
        role: "TESTER",
      });

      project = await getProject(sharedProject.id!, testUserId);
      expect(project?.visibility).toBe("TESTER");
    });
  });

  describe("createProject", () => {
    const createdProjectIds: string[] = [];

    afterEach(async () => {
      for (const id of createdProjectIds) {
        await db.delete(projects).where(eq(projects.id, id));
      }
      createdProjectIds.length = 0;
    });

    it("should create project with valid data", async () => {
      const newProjectData = {
        name: "New Test Project",
        description: "A newly created test project",
        maxMeterDelta: 15,
      };

      const project = await createProject(testUserId, newProjectData);
      createdProjectIds.push(project.id);

      expect(project).toMatchObject({
        name: "New Test Project",
        description: "A newly created test project",
        maxMeterDelta: 15,
        visibility: "OWNER",
      });
      expect(project.id).toBeDefined();
      expect(project.createdAt).toBeInstanceOf(Date);
      expect(project.updatedAt).toBeInstanceOf(Date);

      // Verify project was actually created in database
      const [dbProject] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, project.id))
        .limit(1);
      expect(dbProject).toBeDefined();
      expect(dbProject.name).toBe("New Test Project");
      expect(dbProject.userId).toBe(testUserId);
    });

    it("should create project with minimal data", async () => {
      const minimalProjectData = {
        name: "Minimal Project",
      };

      const project = await createProject(testUserId, minimalProjectData);
      createdProjectIds.push(project.id);

      expect(project).toMatchObject({
        name: "Minimal Project",
        maxMeterDelta: 10, // Default value
        visibility: "OWNER",
      });
      expect(project.description).toBeUndefined();
    });

    it("should create project with custom maxMeterDelta", async () => {
      const customProjectData = {
        name: "Custom Delta Project",
        maxMeterDelta: 25,
      };

      const project = await createProject(testUserId, customProjectData);
      createdProjectIds.push(project.id);

      expect(project.maxMeterDelta).toBe(25);
    });

    it("should assign correct userId to created project", async () => {
      const projectData = {
        name: "User Assignment Test",
      };

      const project = await createProject(otherUserId, projectData);
      createdProjectIds.push(project.id);

      // Verify the project has the correct userId
      const [dbProject] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, project.id))
        .limit(1);

      expect(dbProject.userId).toBe(otherUserId);
    });

    it("should set createdAt and updatedAt timestamps", async () => {
      const projectData = {
        name: "Timestamp Test",
      };

      const beforeCreate = new Date();
      const project = await createProject(testUserId, projectData);
      createdProjectIds.push(project.id);
      const afterCreate = new Date();

      expect(project.createdAt).toBeInstanceOf(Date);
      expect(project.updatedAt).toBeInstanceOf(Date);
      expect(project.createdAt.getTime()).toBeGreaterThanOrEqual(
        beforeCreate.getTime()
      );
      expect(project.createdAt.getTime()).toBeLessThanOrEqual(
        afterCreate.getTime()
      );
      expect(project.updatedAt.getTime()).toBeGreaterThanOrEqual(
        beforeCreate.getTime()
      );
      expect(project.updatedAt.getTime()).toBeLessThanOrEqual(
        afterCreate.getTime()
      );
    });
  });
});
