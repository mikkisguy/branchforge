/**
 * Scenes Service Integration Tests
 *
 * Tests for the scenes service against a real database.
 * These tests cover complex authorization queries involving joins between
 * scenes, projects, and projectUsers tables.
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
  scenes as scenesTable,
  characters,
  sceneLines,
  sceneCharacters,
} from "../../db/schema/index.js";
import { eq } from "drizzle-orm";
import { testEmail, testUuid } from "../../utils/test-ids.js";
import {
  authorizeSceneAccess,
  listScenes,
  getScene,
} from "../scenes.service.js";
import type {
  NewUser,
  NewProject,
  NewScene,
  NewCharacter,
  NewSceneLine,
} from "../../db/schema/index.js";

describe("ScenesService (Integration)", () => {
  let db: ReturnType<typeof getDb>;

  beforeAll(async () => {
    db = getDb();
  });

  // Test fixtures with hardcoded UUIDs
  const testUserId = testUuid("05000000", 1);
  const otherUserId = testUuid("05000000", 2);
  const thirdUserId = testUuid("05000000", 3);

  const testUser: NewUser = {
    id: testUserId,
    email: testEmail("scenes-service", "owner"),
    passwordHash: "hashed_password",
    role: "OWNER",
  };

  const otherUser: NewUser = {
    id: otherUserId,
    email: testEmail("scenes-service", "other"),
    passwordHash: "hashed_password",
    role: "OWNER",
  };

  const thirdUser: NewUser = {
    id: thirdUserId,
    email: testEmail("scenes-service", "third"),
    passwordHash: "hashed_password",
    role: "READER",
  };

  const ownedProject: NewProject = {
    id: testUuid("15000000", 1),
    userId: testUserId,
    name: "Owned Project",
    description: "A project owned by the user",
    maxMeterDelta: 10,
  };

  const sharedProject: NewProject = {
    id: testUuid("15000000", 2),
    userId: otherUserId,
    name: "Shared Project",
    description: "A project shared with the user",
    maxMeterDelta: 15,
  };

  const ownedScene: NewScene = {
    id: testUuid("25000000", 1),
    projectId: ownedProject.id!,
    title: "chapter1_scene1",
    groupType: "act",
    groupValue: "I",
    sceneNumber: 1,
    sequenceOrder: 0,
    route: "EILEEN",
    status: "DRAFT",
    prerequisites: {},
    effects: {},
  };

  const sharedScene: NewScene = {
    id: testUuid("25000000", 2),
    projectId: sharedProject.id!,
    title: "chapter1_scene2",
    groupType: "act",
    groupValue: "I",
    sceneNumber: 2,
    sequenceOrder: 1,
    route: "LUCAS",
    status: "DRAFT",
    prerequisites: {},
    effects: {},
  };

  const testCharacter: NewCharacter = {
    id: testUuid("35000000", 1),
    projectId: ownedProject.id!,
    name: "Eileen",
    displayName: "Eileen",
    renpyTag: "a",
    routeAffiliation: "EILEEN",
    isLoveInterest: true,
    color: "#FF5733",
  };

  // Helper to clean up all test data
  async function cleanupTestData() {
    await db
      .delete(sceneCharacters)
      .where(eq(sceneCharacters.sceneId, ownedScene.id!));
    await db
      .delete(sceneCharacters)
      .where(eq(sceneCharacters.sceneId, sharedScene.id!));
    await db.delete(sceneLines).where(eq(sceneLines.sceneId, ownedScene.id!));
    await db.delete(sceneLines).where(eq(sceneLines.sceneId, sharedScene.id!));
    await db.delete(scenesTable).where(eq(scenesTable.id, ownedScene.id!));
    await db.delete(scenesTable).where(eq(scenesTable.id, sharedScene.id!));
    await db.delete(characters).where(eq(characters.id, testCharacter.id!));
    await db.delete(projectUsers).where(eq(projectUsers.userId, testUserId));
    await db.delete(projectUsers).where(eq(projectUsers.userId, otherUserId));
    await db.delete(projectUsers).where(eq(projectUsers.userId, thirdUserId));
    await db.delete(projects).where(eq(projects.id, ownedProject.id!));
    await db.delete(projects).where(eq(projects.id, sharedProject.id!));
    await db.delete(users).where(eq(users.id, testUserId));
    await db.delete(users).where(eq(users.id, otherUserId));
    await db.delete(users).where(eq(users.id, thirdUserId));
  }

  // Helper to set up test data
  async function setupTestData() {
    // Insert users
    await db.insert(users).values([testUser, otherUser]);

    // Insert projects
    await db.insert(projects).values([ownedProject, sharedProject]);

    // Insert scenes
    await db.insert(scenesTable).values([ownedScene, sharedScene]);
  }

  beforeEach(async () => {
    await cleanupTestData();
    await setupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe("authorizeSceneAccess", () => {
    it("should return true when user owns the project containing the scene", async () => {
      const authorized = await authorizeSceneAccess(ownedScene.id!, testUserId);

      expect(authorized).toBe(true);
    });

    it("should return false when scene does not exist", async () => {
      const nonExistentSceneId = testUuid("25000000", 999999999999);
      const authorized = await authorizeSceneAccess(
        nonExistentSceneId,
        testUserId,
      );

      expect(authorized).toBe(false);
    });

    it("should return false when user does not have access to the project", async () => {
      // Third user has no access to either project
      await db.insert(users).values(thirdUser);

      const authorized = await authorizeSceneAccess(
        ownedScene.id!,
        thirdUserId,
      );

      expect(authorized).toBe(false);
    });

    it("should return true when user has shared access via projectUsers", async () => {
      // Share the other user's project with test user
      await db.insert(projectUsers).values({
        projectId: sharedProject.id!,
        userId: testUserId,
        role: "READER",
      });

      const authorized = await authorizeSceneAccess(
        sharedScene.id!,
        testUserId,
      );

      expect(authorized).toBe(true);
    });

    it("should return true for owner even when also shared as READER", async () => {
      // Share the owned project with the same user (edge case)
      await db.insert(projectUsers).values({
        projectId: ownedProject.id!,
        userId: testUserId,
        role: "READER",
      });

      const authorized = await authorizeSceneAccess(ownedScene.id!, testUserId);

      expect(authorized).toBe(true);
    });

    it("should prioritize owner access over shared access", async () => {
      // Owner should have access regardless of projectUsers entry
      await db.insert(projectUsers).values({
        projectId: ownedProject.id!,
        userId: testUserId,
        role: "TESTER",
      });

      const authorized = await authorizeSceneAccess(ownedScene.id!, testUserId);

      expect(authorized).toBe(true);
    });
  });

  describe("listScenes", () => {
    it("should return empty array when project has no scenes", async () => {
      // Create a project with no scenes
      const emptyProject: NewProject = {
        id: testUuid("15000000", 3),
        userId: testUserId,
        name: "Empty Project",
        maxMeterDelta: 10,
      };
      await db.insert(projects).values(emptyProject);

      const scenes = await listScenes(emptyProject.id!, testUserId);

      expect(scenes).toEqual([]);

      // Cleanup
      await db.delete(projects).where(eq(projects.id, emptyProject.id!));
    });

    it("should return list of scenes for owned project", async () => {
      const scenes = await listScenes(ownedProject.id!, testUserId);

      expect(scenes).toHaveLength(1);
      expect(scenes[0]).toMatchObject({
        id: ownedScene.id!,
        projectId: ownedProject.id!,
        title: "chapter1_scene1",
        groupType: "act",
        groupValue: "I",
        sceneNumber: 1,
        sequenceOrder: 0,
        routeKey: "EILEEN",
        status: "DRAFT",
      });
      expect(typeof scenes[0].createdAt).toBe("string");
      expect(typeof scenes[0].updatedAt).toBe("string");
    });

    it("should return list of scenes for shared project", async () => {
      // Share the other user's project with test user
      await db.insert(projectUsers).values({
        projectId: sharedProject.id!,
        userId: testUserId,
        role: "READER",
      });

      const scenes = await listScenes(sharedProject.id!, testUserId);

      expect(scenes).toHaveLength(1);
      expect(scenes[0]).toMatchObject({
        id: sharedScene.id!,
        projectId: sharedProject.id!,
        title: "chapter1_scene2",
        routeKey: "LUCAS",
      });
    });

    it("should return empty array when user has no access to project", async () => {
      await db.insert(users).values(thirdUser);

      const scenes = await listScenes(ownedProject.id!, thirdUserId);

      expect(scenes).toEqual([]);
    });

    it("should filter scenes by route", async () => {
      // Add a second scene with different route
      const secondScene: NewScene = {
        id: testUuid("25000000", 3),
        projectId: ownedProject.id!,
        title: "chapter1_scene2",
        groupType: "act",
        groupValue: "I",
        sceneNumber: 2,
        sequenceOrder: 1,
        route: "LUCAS",
        status: "DRAFT",
        prerequisites: {},
        effects: {},
      };
      await db.insert(scenesTable).values(secondScene);

      const scenes = await listScenes(ownedProject.id!, testUserId, {
        routeKey: "EILEEN",
      });

      expect(scenes).toHaveLength(1);
      expect(scenes[0].id).toBe(ownedScene.id);
      expect(scenes[0].routeKey).toBe("EILEEN");

      // Cleanup
      await db.delete(scenesTable).where(eq(scenesTable.id, secondScene.id!));
    });

    it("should filter scenes by status", async () => {
      // Add a scene with different status
      const reviewScene: NewScene = {
        id: testUuid("25000000", 4),
        projectId: ownedProject.id!,
        title: "chapter1_scene3",
        groupType: "act",
        groupValue: "I",
        sceneNumber: 3,
        sequenceOrder: 2,
        route: "EILEEN",
        status: "REVIEW",
        prerequisites: {},
        effects: {},
      };
      await db.insert(scenesTable).values(reviewScene);

      const scenes = await listScenes(ownedProject.id!, testUserId, {
        status: "DRAFT",
      });

      expect(scenes).toHaveLength(1);
      expect(scenes[0].id).toBe(ownedScene.id);
      expect(scenes[0].status).toBe("DRAFT");

      // Cleanup
      await db.delete(scenesTable).where(eq(scenesTable.id, reviewScene.id!));
    });
  });

  describe("getScene", () => {
    it("should return scene with empty arrays when no lines or characters exist", async () => {
      const scene = await getScene(ownedScene.id!, testUserId);

      expect(scene).not.toBeNull();
      expect(scene?.id).toBe(ownedScene.id);
      expect(scene?.title).toBe("chapter1_scene1");
      expect(scene?.lines).toEqual([]);
      expect(scene?.characters).toEqual([]);
    });

    it("should return null when scene does not exist", async () => {
      const nonExistentSceneId = testUuid("25000000", 999999999999);
      const scene = await getScene(nonExistentSceneId, testUserId);

      expect(scene).toBeNull();
    });

    it("should return null when user has no access to scene", async () => {
      await db.insert(users).values(thirdUser);

      const scene = await getScene(ownedScene.id!, thirdUserId);

      expect(scene).toBeNull();
    });

    it("should return scene with lines and characters", async () => {
      // Add a character
      await db.insert(characters).values(testCharacter);

      // Add scene lines
      const testLine: NewSceneLine = {
        id: testUuid("45000000", 1),
        sceneId: ownedScene.id!,
        sequence: 1,
        contentType: "DIALOGUE",
        content: "Hello world!",
        speakerId: testCharacter.id!,
        visualType: "GENERATED",
      };
      await db.insert(sceneLines).values(testLine);

      // Add scene character
      await db.insert(sceneCharacters).values({
        sceneId: ownedScene.id!,
        characterId: testCharacter.id!,
        role: "PRIMARY",
      });

      const scene = await getScene(ownedScene.id!, testUserId);

      expect(scene).not.toBeNull();
      expect(scene?.lines).toHaveLength(1);
      expect(scene?.lines[0]).toMatchObject({
        content: "Hello world!",
        contentType: "DIALOGUE",
        speakerId: testCharacter.id,
        speakerName: "Eileen",
        speakerTag: "a",
      });
      expect(scene?.characters).toHaveLength(1);
      expect(scene?.characters[0]).toMatchObject({
        id: testCharacter.id!,
        name: "Eileen",
        displayName: "Eileen",
        role: "PRIMARY",
      });
    });

    it("should return scene for user with shared access", async () => {
      // Share the other user's project with test user
      await db.insert(projectUsers).values({
        projectId: sharedProject.id!,
        userId: testUserId,
        role: "READER",
      });

      const scene = await getScene(sharedScene.id!, testUserId);

      expect(scene).not.toBeNull();
      expect(scene?.id).toBe(sharedScene.id);
      expect(scene?.title).toBe("chapter1_scene2");
    });
  });
});

