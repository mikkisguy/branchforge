/**
 * Flow Routes Integration Tests
 *
 * Tests for retrieving flow graph data and managing layout positions.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import { flowRoutes } from "../flow.routes.js";
import { getDb } from "../../db/index.js";
import { SESSION_COOKIE_NAME } from "../../lib/session.js";
import { testEmail, testUuid } from "../../utils/test-ids.js";
import {
  users,
  projects,
  projectFiles,
  labels,
  labelLines,
  flowGraphLayouts,
  userSessions,
  type NewUser,
  type NewProject,
  type NewProjectFile,
} from "../../db/schema/index.js";
import { eq, inArray, and } from "drizzle-orm";
import { calculateContentHash } from "../../lib/hash.js";

describe("FlowRoutes (Integration)", () => {
  let db: ReturnType<typeof getDb>;
  let fastify: ReturnType<typeof Fastify>;

  const testUserId = testUuid("02000000", 1);
  const testProjectId = testUuid("12000000", 1);
  const testFileId = testUuid("12000001", 1);
  const testLabelId1 = testUuid("12000002", 1);
  const testLabelId2 = testUuid("12000002", 2);
  const testLabelId3 = testUuid("12000002", 3);

  const testUser: NewUser = {
    id: testUserId,
    email: testEmail("flow-routes", "owner"),
    passwordHash: "hashed_password",
    role: "OWNER",
  };

  const testProject: NewProject = {
    id: testProjectId,
    userId: testUserId,
    name: "Flow Route Test Project",
    description: "Project used by flow route integration tests",
    maxStatDelta: 10,
    source: "ZIP",
  };

  const testFile: NewProjectFile = {
    id: testFileId,
    projectId: testProjectId,
    source: "ZIP",
    filePath: "story/script.rpy",
    fileType: "STORY",
    content: "",
    contentHash: calculateContentHash(""),
  };

  async function cleanupTestData() {
    await db
      .delete(flowGraphLayouts)
      .where(
        and(
          eq(flowGraphLayouts.projectId, testProjectId),
          eq(flowGraphLayouts.userId, testUserId)
        )
      );
    await db
      .delete(labelLines)
      .where(
        inArray(labelLines.labelId, [testLabelId1, testLabelId2, testLabelId3])
      );
    await db
      .delete(labels)
      .where(inArray(labels.id, [testLabelId1, testLabelId2, testLabelId3]));
    await db.delete(projectFiles).where(eq(projectFiles.id, testFileId));
    await db.delete(projects).where(eq(projects.id, testProjectId));
    await db.delete(userSessions).where(eq(userSessions.userId, testUserId));
    await db.delete(users).where(eq(users.id, testUserId));
  }

  async function seedTestData() {
    await db.insert(users).values(testUser);
    await db.insert(projects).values(testProject);

    await db.insert(projectFiles).values({
      ...testFile,
      content: [
        "label intro:",
        '    "Intro"',
        "label scene_two:",
        '    "Scene two"',
        "label scene_three:",
        '    "Scene three"',
      ].join("\n"),
      contentHash: calculateContentHash(
        [
          "label intro:",
          '    "Intro"',
          "label scene_two:",
          '    "Scene two"',
          "label scene_three:",
          '    "Scene three"',
        ].join("\n")
      ),
    });
  }

  async function seedLabelsWithLines() {
    await db.insert(labels).values([
      {
        id: testLabelId1,
        projectId: testProjectId,
        projectFileId: testFileId,
        title: "intro",
        labelName: "intro",
        labelPosition: 0,
        labelNumber: 1,
        sequenceOrder: 1,
        route: null,
        status: "DRAFT",
        visibility: "EXCLUSIVE",
        conditions: {},
        effects: {},
      },
      {
        id: testLabelId2,
        projectId: testProjectId,
        projectFileId: testFileId,
        title: "scene_two",
        labelName: "scene_two",
        labelPosition: 1,
        labelNumber: 2,
        sequenceOrder: 2,
        route: null,
        status: "DRAFT",
        visibility: "EXCLUSIVE",
        conditions: {},
        effects: {},
      },
      {
        id: testLabelId3,
        projectId: testProjectId,
        projectFileId: testFileId,
        title: "scene_three",
        labelName: "scene_three",
        labelPosition: 2,
        labelNumber: 3,
        sequenceOrder: 3,
        route: null,
        status: "DRAFT",
        visibility: "EXCLUSIVE",
        conditions: {},
        effects: {},
      },
    ]);

    await db.insert(labelLines).values([
      {
        labelId: testLabelId1,
        sequence: 1,
        contentType: "NARRATION",
        content: "Intro text",
        projectFileId: testFileId,
      },
      {
        labelId: testLabelId1,
        sequence: 2,
        contentType: "JUMP",
        content: "jump scene_three",
        projectFileId: testFileId,
      },
      {
        labelId: testLabelId2,
        sequence: 1,
        contentType: "NARRATION",
        content: "Scene two text",
        projectFileId: testFileId,
      },
      {
        labelId: testLabelId2,
        sequence: 2,
        contentType: "MENU",
        content: "",
        projectFileId: testFileId,
        menuOptions: [
          {
            label: "Go to scene three",
            targetLabelId: testLabelId3,
            targetLabelName: "scene_three",
          },
        ],
      },
      {
        labelId: testLabelId3,
        sequence: 1,
        contentType: "NARRATION",
        content: "Scene three text",
        projectFileId: testFileId,
      },
    ]);
  }

  async function createAuthenticatedRequest(userId: string) {
    const loginResponse = await fastify.inject({
      method: "POST",
      url: "/test-login",
      payload: { userId },
    });

    const sessionCookie = loginResponse.cookies.find(
      (cookie: { name: string; value: string }) =>
        cookie.name === SESSION_COOKIE_NAME
    );
    const sessionId = sessionCookie?.value;

    if (!sessionId) {
      throw new Error("Failed to create session cookie");
    }

    return { sessionId };
  }

  beforeAll(async () => {
    db = getDb();
  });

  beforeEach(async () => {
    await cleanupTestData();
    await seedTestData();

    fastify = Fastify();

    await fastify.register(cookie);
    await fastify.register(session, {
      secret: "test-session-secret-for-integration-tests",
      cookieName: SESSION_COOKIE_NAME,
      cookie: {
        secure: false,
        httpOnly: true,
        sameSite: "lax",
        maxAge: 86400000,
        path: "/",
      },
      saveUninitialized: true,
      rolling: false,
    });

    await flowRoutes(fastify);

    fastify.post(
      "/test-login",
      async (
        request: FastifyRequest<{ Body: { userId: string } }>,
        reply: FastifyReply
      ) => {
        const { userId } = request.body;

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        if (!user) {
          return reply
            .status(404)
            .send({ success: false, error: "User not found" });
        }

        if (user?.role) {
          request.session.user = {
            id: user.id,
            email: user.email,
            role: user.role,
          };
        }

        reply.send({ success: true });
      }
    );

    await fastify.ready();
  });

  afterEach(async () => {
    if (fastify) {
      await fastify.close();
    }
    await cleanupTestData();
  });

  // ========================================================================
  // GET /flow-graph
  // ========================================================================

  describe("GET /flow-graph", () => {
    it("returns 401 when not authenticated", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: `/flow-graph?projectId=${testProjectId}`,
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns 400 when projectId is missing", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "GET",
        url: "/flow-graph",
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("returns 400 when projectId is invalid UUID", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "GET",
        url: "/flow-graph?projectId=not-a-uuid",
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("returns empty nodes/edges for project with no labels", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "GET",
        url: `/flow-graph?projectId=${testProjectId}`,
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body).toHaveProperty("nodes", []);
      expect(body).toHaveProperty("edges", []);
    });

    it("returns nodes and edges for project with labels", async () => {
      await seedLabelsWithLines();

      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "GET",
        url: `/flow-graph?projectId=${testProjectId}`,
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body).toHaveProperty("nodes");
      expect(body).toHaveProperty("edges");

      // Should have 3 nodes (one per label)
      const nodeIds = body.nodes.map((n: { id: string }) => n.id);
      expect(nodeIds).toContain(testLabelId1);
      expect(nodeIds).toContain(testLabelId2);
      expect(nodeIds).toContain(testLabelId3);

      // Should have edges: NATURAL (intro -> scene_two), JUMP (intro -> scene_three),
      // and CHOICE (scene_two -> scene_three). The NATURAL from scene_two to scene_three
      // is skipped because the CHOICE edge already exists for that source/target pair.
      expect(body.edges.length).toBeGreaterThanOrEqual(2);

      const edgeTypes = body.edges.map((e: { type: string }) => e.type);
      expect(edgeTypes).toContain("NATURAL");
      expect(edgeTypes).toContain("JUMP");
    });
  });

  // ========================================================================
  // GET /flow-graph/layout
  // ========================================================================

  describe("GET /flow-graph/layout", () => {
    it("returns 401 when not authenticated", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: `/flow-graph/layout?projectId=${testProjectId}`,
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns empty positions when no layout saved", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "GET",
        url: `/flow-graph/layout?projectId=${testProjectId}`,
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body).toHaveProperty("positions", {});
    });

    it("returns saved positions after saving", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      // Save positions
      await fastify.inject({
        method: "PUT",
        url: "/flow-graph/layout",
        payload: {
          projectId: testProjectId,
          positions: {
            [testLabelId1]: { x: 100, y: 200 },
            [testLabelId2]: { x: 300, y: 400 },
          },
        },
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      // Retrieve positions
      const response = await fastify.inject({
        method: "GET",
        url: `/flow-graph/layout?projectId=${testProjectId}`,
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body).toHaveProperty("positions");
      expect(body.positions).toHaveProperty(testLabelId1);
      expect(body.positions[testLabelId1]).toEqual({ x: 100, y: 200 });
      expect(body.positions[testLabelId2]).toEqual({ x: 300, y: 400 });
    });
  });

  // ========================================================================
  // PUT /flow-graph/layout
  // ========================================================================

  describe("PUT /flow-graph/layout", () => {
    it("returns 401 when not authenticated", async () => {
      const response = await fastify.inject({
        method: "PUT",
        url: "/flow-graph/layout",
        payload: {
          projectId: testProjectId,
          positions: {},
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns 400 for invalid body (missing projectId)", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "PUT",
        url: "/flow-graph/layout",
        payload: {
          positions: {},
        },
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("returns 400 for invalid positions (key not a UUID)", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "PUT",
        url: "/flow-graph/layout",
        payload: {
          projectId: testProjectId,
          positions: {
            "not-a-uuid": { x: 0, y: 0 },
          },
        },
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("saves positions successfully (204)", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      const response = await fastify.inject({
        method: "PUT",
        url: "/flow-graph/layout",
        payload: {
          projectId: testProjectId,
          positions: {
            [testLabelId1]: { x: 100, y: 200 },
          },
        },
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(204);

      // Verify the row was actually written
      const getResponse = await fastify.inject({
        method: "GET",
        url: `/flow-graph/layout?projectId=${testProjectId}`,
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      const body = getResponse.json();
      expect(body.positions).toEqual({
        [testLabelId1]: { x: 100, y: 200 },
      });
    });

    it("upserts positions (second call replaces first)", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      // First save with labelId1 position
      await fastify.inject({
        method: "PUT",
        url: "/flow-graph/layout",
        payload: {
          projectId: testProjectId,
          positions: {
            [testLabelId1]: { x: 100, y: 200 },
          },
        },
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      // Second save replaces all positions with labelId2 position
      const response = await fastify.inject({
        method: "PUT",
        url: "/flow-graph/layout",
        payload: {
          projectId: testProjectId,
          positions: {
            [testLabelId2]: { x: 500, y: 600 },
          },
        },
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      expect(response.statusCode).toBe(204);

      // Verify only the second set of positions exists (full replacement)
      const getResponse = await fastify.inject({
        method: "GET",
        url: `/flow-graph/layout?projectId=${testProjectId}`,
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      const body = getResponse.json();
      expect(body.positions).not.toHaveProperty(testLabelId1);
      expect(body.positions).toHaveProperty(testLabelId2);
      expect(body.positions[testLabelId2]).toEqual({ x: 500, y: 600 });
    });
  });

  // ========================================================================
  // DELETE /flow-graph/layout
  // ========================================================================

  describe("DELETE /flow-graph/layout", () => {
    it("returns 401 when not authenticated", async () => {
      const response = await fastify.inject({
        method: "DELETE",
        url: `/flow-graph/layout?projectId=${testProjectId}`,
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns 204 after deleting", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      // First save some positions
      await fastify.inject({
        method: "PUT",
        url: "/flow-graph/layout",
        payload: {
          projectId: testProjectId,
          positions: {
            [testLabelId1]: { x: 100, y: 200 },
          },
        },
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      // Delete the layout
      const deleteResponse = await fastify.inject({
        method: "DELETE",
        url: `/flow-graph/layout?projectId=${testProjectId}`,
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      expect(deleteResponse.statusCode).toBe(204);
    });

    it("positions are empty after delete", async () => {
      const auth = await createAuthenticatedRequest(testUserId);

      // First save some positions
      await fastify.inject({
        method: "PUT",
        url: "/flow-graph/layout",
        payload: {
          projectId: testProjectId,
          positions: {
            [testLabelId1]: { x: 100, y: 200 },
          },
        },
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      // Delete the layout
      await fastify.inject({
        method: "DELETE",
        url: `/flow-graph/layout?projectId=${testProjectId}`,
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      // Verify positions are now empty
      const getResponse = await fastify.inject({
        method: "GET",
        url: `/flow-graph/layout?projectId=${testProjectId}`,
        cookies: {
          [SESSION_COOKIE_NAME]: auth.sessionId,
        },
      });

      const body = getResponse.json();
      expect(body).toHaveProperty("positions", {});
    });
  });
});
