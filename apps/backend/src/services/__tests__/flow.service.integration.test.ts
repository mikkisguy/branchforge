/**
 * Flow Service Integration Tests
 *
 * Tests for the flow service against a real database.
 * Covers getFlowGraph, getFlowGraphLayout, saveFlowGraphLayout, deleteFlowGraphLayout.
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
  projectFiles,
  flowGraphLayouts,
  type NewUser,
  type NewProject,
  type NewLabel,
  type NewLabelLine,
  type NewProjectFile,
} from "../../db/schema/index.js";
import { eq, and, inArray } from "drizzle-orm";
import {
  getFlowGraph,
  getFlowGraphLayout,
  saveFlowGraphLayout,
  deleteFlowGraphLayout,
} from "../flow.service.js";
import { testEmail, testUuid } from "../../utils/test-ids.js";
import { calculateContentHash } from "../../lib/hash.js";

describe("FlowService (Integration)", () => {
  let db: ReturnType<typeof getDb>;

  beforeAll(async () => {
    db = getDb();
  });

  // ==========================================================================
  // Test fixtures
  // ==========================================================================

  const testUserId = testUuid("20000000", 1);
  const otherUserId = testUuid("20000000", 2);

  const testUser: NewUser = {
    id: testUserId,
    email: testEmail("flow-service", "owner"),
    passwordHash: "hashed_password",
    role: "OWNER",
  };

  const otherUser: NewUser = {
    id: otherUserId,
    email: testEmail("flow-service", "other"),
    passwordHash: "hashed_password",
    role: "OWNER",
  };

  const projectId = testUuid("21000000", 1);
  const project: NewProject = {
    id: projectId,
    userId: testUserId,
    name: "Flow Test Project",
    description: "Project for flow service testing",
    maxStatDelta: 10,
    source: "ZIP",
  };

  // Project files
  const fileAId = testUuid("22000000", 1);
  const fileBId = testUuid("22000000", 2);

  const fileA: NewProjectFile = {
    id: fileAId,
    projectId,
    source: "ZIP",
    filePath: "labels/file_a.rpy",
    fileType: "STORY",
    content: "# File A",
    contentHash: calculateContentHash("# File A"),
  };

  const fileB: NewProjectFile = {
    id: fileBId,
    projectId,
    source: "ZIP",
    filePath: "labels/file_b.rpy",
    fileType: "STORY",
    content: "# File B",
    contentHash: calculateContentHash("# File B"),
  };

  // Labels
  const startLabelId = testUuid("23000000", 1);
  const chapter1LabelId = testUuid("23000000", 2);
  const menuLabelId = testUuid("23000000", 3);
  const targetLabelId = testUuid("23000000", 4);
  const jumpTargetLabelId = testUuid("23000000", 5);
  const nameTargetLabelId = testUuid("23000000", 6);

  const allLabelIds = [
    startLabelId,
    chapter1LabelId,
    menuLabelId,
    targetLabelId,
    jumpTargetLabelId,
    nameTargetLabelId,
  ];

  function buildLabels(): NewLabel[] {
    return [
      {
        id: startLabelId,
        projectId,
        projectFileId: fileAId,
        title: "Start",
        labelName: "start",
        labelPosition: 1,
        sequenceOrder: 0,
        labelNumber: 1,
        route: null,
        status: "DRAFT",
        visibility: "EXCLUSIVE",
        conditions: {},
        effects: {},
      },
      {
        id: chapter1LabelId,
        projectId,
        projectFileId: fileAId,
        title: "Chapter 1",
        labelName: "chapter1",
        labelPosition: 2,
        sequenceOrder: 0,
        labelNumber: 2,
        route: "common",
        status: "FINAL",
        visibility: "EXCLUSIVE",
        conditions: {},
        effects: {},
      },
      {
        id: menuLabelId,
        projectId,
        projectFileId: fileAId,
        title: "Menu Label",
        labelName: "menu_label",
        labelPosition: 3,
        sequenceOrder: 0,
        labelNumber: 3,
        route: null,
        status: "DRAFT",
        visibility: "EXCLUSIVE",
        conditions: {},
        effects: {},
      },
      {
        id: targetLabelId,
        projectId,
        projectFileId: fileAId,
        title: "Target Label",
        labelName: "target_label",
        labelPosition: 4,
        sequenceOrder: 0,
        labelNumber: 4,
        route: null,
        status: "REVIEW",
        visibility: "EXCLUSIVE",
        conditions: {},
        effects: {},
      },
      {
        id: jumpTargetLabelId,
        projectId,
        projectFileId: fileBId,
        title: "Jump Target",
        labelName: "jump_target",
        labelPosition: 1,
        sequenceOrder: 0,
        labelNumber: 5,
        route: null,
        status: "DRAFT",
        visibility: "EXCLUSIVE",
        conditions: {},
        effects: {},
      },
      {
        id: nameTargetLabelId,
        projectId,
        projectFileId: fileBId,
        title: "Name Target",
        labelName: "name_target",
        labelPosition: 2,
        sequenceOrder: 0,
        labelNumber: 6,
        route: null,
        status: "DRAFT",
        visibility: "EXCLUSIVE",
        conditions: {},
        effects: {},
      },
    ];
  }

  // Label lines
  const menuLineId = testUuid("24000000", 1);
  const jumpLineId = testUuid("24000000", 2);
  const jumpLine2Id = testUuid("24000000", 3);

  function buildLabelLines(): NewLabelLine[] {
    return [
      {
        id: menuLineId,
        labelId: menuLabelId,
        sequence: 1,
        content: "Choose an option",
        contentType: "MENU",
        visualType: "GENERATED",
        menuOptions: [
          {
            label: "Go to target",
            targetLabelId: targetLabelId,
            targetLabelName: "target_label",
          },
        ],
      },
      {
        id: jumpLineId,
        labelId: targetLabelId,
        sequence: 1,
        content: "jump jump_target",
        contentType: "JUMP",
        visualType: "GENERATED",
      },
      {
        id: jumpLine2Id,
        labelId: jumpTargetLabelId,
        sequence: 1,
        content: "jump name_target",
        contentType: "JUMP",
        visualType: "GENERATED",
      },
    ];
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  async function cleanupTestData() {
    const testUserIds = [testUserId, otherUserId];
    const projectIds = [projectId];

    // Delete in reverse dependency order
    if (allLabelIds.length > 0) {
      await db
        .delete(labelLines)
        .where(inArray(labelLines.labelId, allLabelIds));
    }
    await db
      .delete(flowGraphLayouts)
      .where(
        and(
          inArray(flowGraphLayouts.projectId, projectIds),
          inArray(flowGraphLayouts.userId, testUserIds)
        )
      );
    if (allLabelIds.length > 0) {
      await db.delete(labels).where(inArray(labels.id, allLabelIds));
    }
    await db
      .delete(projectFiles)
      .where(inArray(projectFiles.projectId, projectIds));
    await db
      .delete(projectUsers)
      .where(inArray(projectUsers.projectId, projectIds));
    await db.delete(projects).where(inArray(projects.id, projectIds));
    await db.delete(users).where(inArray(users.id, testUserIds));
  }

  async function setupTestData() {
    await db.insert(users).values([testUser, otherUser]);
    await db.insert(projects).values(project);
  }

  async function setupFlowGraphData() {
    await db.insert(projectFiles).values([fileA, fileB]);
    await db.insert(labels).values(buildLabels());
    await db.insert(labelLines).values(buildLabelLines());
  }

  beforeEach(async () => {
    await cleanupTestData();
    await setupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  // ==========================================================================
  // getFlowGraph
  // ==========================================================================

  describe("getFlowGraph", () => {
    beforeEach(async () => {
      await setupFlowGraphData();
    });

    it("should return empty nodes and edges when project has no labels", async () => {
      const emptyProjectId = testUuid("21000000", 99);
      await db.insert(projects).values({
        id: emptyProjectId,
        userId: testUserId,
        name: "Empty Project",
        maxStatDelta: 10,
        source: "ZIP",
      });

      try {
        const result = await getFlowGraph(emptyProjectId, testUserId);

        expect(result).toEqual({ nodes: [], edges: [] });
      } finally {
        // Clean up inline
        await db.delete(projects).where(eq(projects.id, emptyProjectId));
      }
    });

    it("should create nodes from labels with correct fields", async () => {
      const result = await getFlowGraph(projectId, testUserId);

      expect(result.nodes).toHaveLength(6);

      const startNode = result.nodes.find((n) => n.labelName === "start");
      expect(startNode).toBeDefined();
      expect(startNode).toMatchObject({
        id: startLabelId,
        labelId: startLabelId,
        title: "Start",
        labelName: "start",
        routeKey: null,
        status: "DRAFT",
        fileName: "file_a.rpy",
        sequenceOrder: 0,
        labelNumber: 1,
      });

      const ch1Node = result.nodes.find((n) => n.labelName === "chapter1");
      expect(ch1Node).toBeDefined();
      expect(ch1Node).toMatchObject({
        id: chapter1LabelId,
        labelId: chapter1LabelId,
        title: "Chapter 1",
        labelName: "chapter1",
        routeKey: "common",
        status: "FINAL",
        fileName: "file_a.rpy",
        sequenceOrder: 0,
        labelNumber: 2,
      });

      const jumpTargetNode = result.nodes.find(
        (n) => n.labelName === "jump_target"
      );
      expect(jumpTargetNode).toBeDefined();
      expect(jumpTargetNode).toMatchObject({
        id: jumpTargetLabelId,
        labelId: jumpTargetLabelId,
        fileName: "file_b.rpy",
      });
    });

    it("should create CHOICE edges from MENU lines with menuOptions", async () => {
      const result = await getFlowGraph(projectId, testUserId);

      const choiceEdges = result.edges.filter((e) => e.type === "CHOICE");
      expect(choiceEdges).toHaveLength(1);

      expect(choiceEdges[0]).toMatchObject({
        source: menuLabelId,
        target: targetLabelId,
        type: "CHOICE",
        label: "Go to target",
      });
      expect(choiceEdges[0].id).toBe(`${menuLabelId}|${targetLabelId}|CHOICE`);
    });

    it("should create JUMP edges from JUMP lines", async () => {
      const result = await getFlowGraph(projectId, testUserId);

      const jumpEdges = result.edges.filter((e) => e.type === "JUMP");
      expect(jumpEdges).toHaveLength(2);

      const targetToJump = jumpEdges.find(
        (e) => e.source === targetLabelId && e.target === jumpTargetLabelId
      );
      expect(targetToJump).toBeDefined();
      expect(targetToJump?.id).toBe(
        `${targetLabelId}|${jumpTargetLabelId}|JUMP`
      );

      const jumpToName = jumpEdges.find(
        (e) => e.source === jumpTargetLabelId && e.target === nameTargetLabelId
      );
      expect(jumpToName).toBeDefined();
      expect(jumpToName?.id).toBe(
        `${jumpTargetLabelId}|${nameTargetLabelId}|JUMP`
      );
    });

    it("should create NATURAL edges from sequential labels in the same file", async () => {
      const result = await getFlowGraph(projectId, testUserId);

      // file_a labels in position order: start(1), chapter1(2), menu_label(3), target_label(4)
      // NATURAL edges in file_a: start→chapter1, chapter1→menu_label
      // menu_label→target_label has a CHOICE edge already, so NATURAL is skipped
      //
      // file_b labels in position order: jump_target(1), name_target(2)
      // jump_target→name_target has a JUMP edge already, so NATURAL is skipped

      const naturalEdges = result.edges.filter((e) => e.type === "NATURAL");

      expect(naturalEdges).toHaveLength(2);

      const startToCh1 = naturalEdges.find(
        (e) => e.source === startLabelId && e.target === chapter1LabelId
      );
      expect(startToCh1).toBeDefined();
      expect(startToCh1?.id).toBe(`${startLabelId}|${chapter1LabelId}|NATURAL`);

      const ch1ToMenu = naturalEdges.find(
        (e) => e.source === chapter1LabelId && e.target === menuLabelId
      );
      expect(ch1ToMenu).toBeDefined();
      expect(ch1ToMenu?.id).toBe(`${chapter1LabelId}|${menuLabelId}|NATURAL`);
    });

    it("should deduplicate edges when the same source and target have multiple connections", async () => {
      // Add a second MENU line on menu_label pointing to the same target
      const dupeMenuLineId = testUuid("24000000", 10);
      await db.insert(labelLines).values({
        id: dupeMenuLineId,
        labelId: menuLabelId,
        sequence: 2,
        content: "Also go to target",
        contentType: "MENU",
        visualType: "GENERATED",
        menuOptions: [
          {
            label: "Also go to target",
            targetLabelId: targetLabelId,
            targetLabelName: "target_label",
          },
        ],
      });

      try {
        const result = await getFlowGraph(projectId, testUserId);

        // Only one CHOICE edge should exist between menu_label and target_label
        const edgesMenuToTarget = result.edges.filter(
          (e) => e.source === menuLabelId && e.target === targetLabelId
        );
        expect(edgesMenuToTarget).toHaveLength(1);
        expect(edgesMenuToTarget[0].type).toBe("CHOICE");
      } finally {
        // Clean up inline
        await db.delete(labelLines).where(eq(labelLines.id, dupeMenuLineId));
      }
    });

    it("should skip NATURAL edges when a CHOICE or JUMP edge already exists between the same pair", async () => {
      const result = await getFlowGraph(projectId, testUserId);

      // menu_label and target_label are sequential in file_a (positions 3 and 4)
      // But menu_label has a MENU line targeting target_label → CHOICE edge exists
      // Only one edge (the CHOICE) should exist, not a NATURAL too
      const menuToTargetEdges = result.edges.filter(
        (e) => e.source === menuLabelId && e.target === targetLabelId
      );
      expect(menuToTargetEdges).toHaveLength(1);
      expect(menuToTargetEdges[0].type).toBe("CHOICE");

      // jump_target and name_target are sequential in file_b (positions 1 and 2)
      // But jump_target has a JUMP line targeting name_target → JUMP edge exists
      const jumpToNameEdges = result.edges.filter(
        (e) => e.source === jumpTargetLabelId && e.target === nameTargetLabelId
      );
      expect(jumpToNameEdges).toHaveLength(1);
      expect(jumpToNameEdges[0].type).toBe("JUMP");
    });

    it("should resolve target labels by UUID and by name (case-insensitive)", async () => {
      const result = await getFlowGraph(projectId, testUserId);

      // CHOICE edge from menu_label → target_label was resolved by UUID
      const choiceEdge = result.edges.find(
        (e) => e.source === menuLabelId && e.type === "CHOICE"
      );
      expect(choiceEdge).toBeDefined();
      expect(choiceEdge?.target).toBe(targetLabelId);

      // JUMP edge from target_label → jump_target was resolved by name
      // (content "jump jump_target" matches labelName "jump_target")
      const jumpEdge = result.edges.find(
        (e) => e.source === targetLabelId && e.type === "JUMP"
      );
      expect(jumpEdge).toBeDefined();
      expect(jumpEdge?.target).toBe(jumpTargetLabelId);

      // JUMP edge from jump_target → name_target was resolved by name
      const jumpEdge2 = result.edges.find(
        (e) => e.source === jumpTargetLabelId && e.type === "JUMP"
      );
      expect(jumpEdge2).toBeDefined();
      expect(jumpEdge2?.target).toBe(nameTargetLabelId);
    });

    it("should ignore labels with deletedAt set (soft-deleted)", async () => {
      const deletedLabelId = testUuid("23000000", 20);
      await db.insert(labels).values({
        id: deletedLabelId,
        projectId,
        projectFileId: fileAId,
        title: "Deleted Label",
        labelName: "deleted_label",
        labelPosition: 5,
        sequenceOrder: 0,
        labelNumber: 10,
        visibility: "EXCLUSIVE",
        status: "DRAFT",
        conditions: {},
        effects: {},
        deletedAt: new Date(),
      });

      try {
        const result = await getFlowGraph(projectId, testUserId);

        const deletedNode = result.nodes.find((n) => n.id === deletedLabelId);
        expect(deletedNode).toBeUndefined();
      } finally {
        // Clean up inline
        await db.delete(labels).where(eq(labels.id, deletedLabelId));
      }
    });

    it("should ignore label_lines with deletedAt set", async () => {
      // Add a JUMP line on menu_label that is soft-deleted
      const deletedLineId = testUuid("24000000", 20);
      await db.insert(labelLines).values({
        id: deletedLineId,
        labelId: menuLabelId,
        sequence: 5,
        content: "jump name_target",
        contentType: "JUMP",
        visualType: "GENERATED",
        deletedAt: new Date(),
      });

      try {
        const result = await getFlowGraph(projectId, testUserId);

        // Only the 2 JUMP edges from common data should exist
        const jumpEdges = result.edges.filter((e) => e.type === "JUMP");
        expect(jumpEdges).toHaveLength(2);
      } finally {
        // Clean up inline
        await db.delete(labelLines).where(eq(labelLines.id, deletedLineId));
      }
    });
  });

  // ==========================================================================
  // Layout CRUD
  // ==========================================================================

  describe("FlowGraphLayout CRUD", () => {
    it("should return empty object when no layout is saved", async () => {
      const result = await getFlowGraphLayout(projectId, testUserId);
      expect(result).toEqual({});
    });

    it("should save positions and retrieve them via getFlowGraphLayout", async () => {
      const positions = {
        [startLabelId]: { x: 100, y: 200 },
        [chapter1LabelId]: { x: 300, y: 400 },
      };

      await saveFlowGraphLayout(projectId, testUserId, positions);

      const result = await getFlowGraphLayout(projectId, testUserId);
      expect(result).toEqual(positions);
    });

    it("should upsert positions when saved twice (replace, not append)", async () => {
      const firstPositions = {
        [startLabelId]: { x: 0, y: 0 },
      };

      const secondPositions = {
        [startLabelId]: { x: 500, y: 600 },
        [chapter1LabelId]: { x: 700, y: 800 },
      };

      await saveFlowGraphLayout(projectId, testUserId, firstPositions);
      await saveFlowGraphLayout(projectId, testUserId, secondPositions);

      const result = await getFlowGraphLayout(projectId, testUserId);
      expect(result).toEqual(secondPositions);
    });

    it("should remove saved positions after deleteFlowGraphLayout", async () => {
      const positions = {
        [startLabelId]: { x: 100, y: 200 },
      };

      await saveFlowGraphLayout(projectId, testUserId, positions);
      await deleteFlowGraphLayout(projectId, testUserId);

      const result = await getFlowGraphLayout(projectId, testUserId);
      expect(result).toEqual({});
    });

    it("should keep layouts separate per user for the same project", async () => {
      // Grant the other user access to the project
      await db.insert(projectUsers).values({
        projectId,
        userId: otherUserId,
        role: "READER",
      });

      const user1Positions = {
        [startLabelId]: { x: 100, y: 200 },
      };
      const user2Positions = {
        [startLabelId]: { x: 300, y: 400 },
      };

      await saveFlowGraphLayout(projectId, testUserId, user1Positions);
      await saveFlowGraphLayout(projectId, otherUserId, user2Positions);

      const user1Result = await getFlowGraphLayout(projectId, testUserId);
      const user2Result = await getFlowGraphLayout(projectId, otherUserId);

      expect(user1Result).toEqual(user1Positions);
      expect(user2Result).toEqual(user2Positions);

      // Deleting one user's layout should not affect the other's
      await deleteFlowGraphLayout(projectId, testUserId);

      const afterDeleteUser1 = await getFlowGraphLayout(projectId, testUserId);
      const afterDeleteUser2 = await getFlowGraphLayout(projectId, otherUserId);

      expect(afterDeleteUser1).toEqual({});
      expect(afterDeleteUser2).toEqual(user2Positions);
    });
  });
});
