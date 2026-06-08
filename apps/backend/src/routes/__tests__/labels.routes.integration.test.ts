/**
 * Labels Routes Integration Tests
 *
 * Regression coverage for dialogue updates that reconstruct project file content.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import { labelsRoutes } from "../labels.routes.js";
import { getDb } from "../../db/index.js";
import { SESSION_COOKIE_NAME } from "../../lib/session.js";
import { testEmail, testUuid } from "../../utils/test-ids.js";
import {
  users,
  projects,
  projectFiles,
  labels,
  labelLines,
  userSessions,
  characters,
  type NewUser,
  type NewProject,
} from "../../db/schema/index.js";
import { eq, inArray, asc } from "drizzle-orm";
import { calculateContentHash } from "../../lib/hash.js";

describe("LabelsRoutes (Integration)", () => {
  let db: ReturnType<typeof getDb>;
  let fastify: ReturnType<typeof Fastify>;

  const testUserId = testUuid("23000000", 1);
  const testProjectId = testUuid("23000001", 1);
  const testFileId = testUuid("23000002", 1);
  const introLabelId = testUuid("23000003", 1);
  const sideSceneLabelId = testUuid("23000003", 2);
  const testCharacterId = testUuid("23000004", 1);
  const testCharacterId2 = testUuid("23000004", 2);

  const testUser: NewUser = {
    id: testUserId,
    email: testEmail("labels-routes", "owner"),
    passwordHash: "hashed_password",
    role: "OWNER",
  };

  const testProject: NewProject = {
    id: testProjectId,
    userId: testUserId,
    name: "Labels Route Test Project",
    description: "Project used by labels route integration tests",
    maxStatDelta: 10,
    source: "ZIP",
  };

  const initialOriginalContent = ["label intro:", '    "Intro old"'].join("\n");
  const currentFileContent = [
    "label intro:",
    '    "Intro old"',
    "",
    "label side_scene:",
    '    "Side old"',
  ].join("\n");

  async function cleanupTestData() {
    await db
      .delete(labelLines)
      .where(inArray(labelLines.labelId, [introLabelId, sideSceneLabelId]));
    await db
      .delete(labels)
      .where(inArray(labels.id, [introLabelId, sideSceneLabelId]));
    await db
      .delete(characters)
      .where(inArray(characters.id, [testCharacterId, testCharacterId2]));
    await db.delete(projectFiles).where(eq(projectFiles.id, testFileId));
    await db.delete(projects).where(eq(projects.id, testProjectId));
    await db.delete(userSessions).where(eq(userSessions.userId, testUserId));
    await db.delete(users).where(eq(users.id, testUserId));
  }

  async function seedTestData() {
    await db.insert(users).values(testUser);
    await db.insert(projects).values(testProject);

    await db.insert(projectFiles).values({
      id: testFileId,
      projectId: testProjectId,
      source: "ZIP",
      filePath: "story/scene.rpy",
      fileType: "STORY",
      originalContent: initialOriginalContent,
      content: currentFileContent,
      contentHash: calculateContentHash(currentFileContent),
    });

    await db.insert(labels).values([
      {
        id: introLabelId,
        projectId: testProjectId,
        projectFileId: testFileId,
        labelName: "intro",
        title: "intro",
        labelPosition: 0,
        labelNumber: 1,
        sequenceOrder: 0,
        status: "DRAFT",
        visibility: "EXCLUSIVE",
        conditions: {},
        effects: {},
      },
      {
        id: sideSceneLabelId,
        projectId: testProjectId,
        projectFileId: testFileId,
        labelName: "side_scene",
        title: "side_scene",
        labelPosition: 1,
        labelNumber: 2,
        sequenceOrder: 1,
        status: "DRAFT",
        visibility: "EXCLUSIVE",
        conditions: {},
        effects: {},
      },
    ]);

    await db.insert(labelLines).values([
      {
        labelId: introLabelId,
        sequence: 1,
        contentType: "NARRATION",
        content: "Intro old",
        projectFileId: testFileId,
      },
      {
        labelId: sideSceneLabelId,
        sequence: 1,
        contentType: "NARRATION",
        content: "Side old",
        projectFileId: testFileId,
      },
    ]);

    await db.insert(characters).values([
      {
        id: testCharacterId,
        projectId: testProjectId,
        name: "protagonist",
        displayName: "Protagonist",
        renpyTag: "p",
        color: "#FF0000",
      },
      {
        id: testCharacterId2,
        projectId: testProjectId,
        name: "antagonist",
        displayName: "Antagonist",
        renpyTag: "a",
        color: "#0000FF",
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

    await labelsRoutes(fastify);

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

  it("preserves newer label blocks when updating dialogue", async () => {
    const auth = await createAuthenticatedRequest(testUserId);

    const response = await fastify.inject({
      method: "PUT",
      url: `/labels/${introLabelId}/dialogue`,
      payload: {
        dialogue: [{ speakerId: null, text: "Intro updated" }],
      },
      cookies: {
        [SESSION_COOKIE_NAME]: auth.sessionId,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true });

    const [updatedFile] = await db
      .select({ content: projectFiles.content })
      .from(projectFiles)
      .where(eq(projectFiles.id, testFileId))
      .limit(1);

    expect(updatedFile).toBeDefined();
    expect(updatedFile.content).toContain("label intro:");
    expect(updatedFile.content).toContain('"Intro updated"');
    expect(updatedFile.content).toContain("label side_scene:");
    expect(updatedFile.content).toMatch(/label side_scene:\n\s+"Side old"/);
  });

  it("returns 409 when expected version is stale", async () => {
    const auth = await createAuthenticatedRequest(testUserId);

    const response = await fastify.inject({
      method: "PUT",
      url: `/labels/${introLabelId}/dialogue`,
      payload: {
        dialogue: [{ speakerId: null, text: "Intro update rejected" }],
        expectedVersion: 999,
      },
      cookies: {
        [SESSION_COOKIE_NAME]: auth.sessionId,
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      success: false,
      conflict: {
        reason: "STALE_LABEL_VERSION",
      },
    });
  });

  it("preserves MENU and JUMP lines when updating dialogue", async () => {
    const auth = await createAuthenticatedRequest(testUserId);

    // Insert MENU and JUMP lines alongside the existing NARRATION (sequence 1)
    await db.insert(labelLines).values([
      {
        labelId: introLabelId,
        sequence: 2,
        contentType: "MENU",
        content: "",
        projectFileId: testFileId,
        menuOptions: [
          {
            label: "Go left",
            targetLabelId: testUuid("23000009", 1),
            targetLabelName: "left_path",
          },
        ],
      },
      {
        labelId: introLabelId,
        sequence: 3,
        contentType: "JUMP",
        content: "jump ending",
        projectFileId: testFileId,
      },
    ]);

    const response = await fastify.inject({
      method: "PUT",
      url: `/labels/${introLabelId}/dialogue`,
      payload: {
        dialogue: [{ speakerId: null, text: "Updated prose" }],
      },
      cookies: {
        [SESSION_COOKIE_NAME]: auth.sessionId,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true });

    const lines = await db
      .select()
      .from(labelLines)
      .where(eq(labelLines.labelId, introLabelId))
      .orderBy(asc(labelLines.sequence));

    expect(lines).toHaveLength(3);
    expect(lines[0].contentType).toBe("NARRATION");
    expect(lines[0].content).toBe("Updated prose");
    expect(lines[1].contentType).toBe("MENU");
    expect(lines[1].menuOptions).toEqual([
      {
        label: "Go left",
        targetLabelId: testUuid("23000009", 1),
        targetLabelName: "left_path",
      },
    ]);
    expect(lines[2].contentType).toBe("JUMP");
    expect(lines[2].content).toBe("jump ending");
  });

  it("appends new prose lines after non-prose lines when dialogue entries exceed existing prose", async () => {
    const auth = await createAuthenticatedRequest(testUserId);

    // Seed: 1 NARRATION (seq 1) + 1 MENU (seq 2) + 1 JUMP (seq 3)
    await db.insert(labelLines).values([
      {
        labelId: introLabelId,
        sequence: 2,
        contentType: "MENU",
        content: "",
        projectFileId: testFileId,
        menuOptions: [
          {
            label: "Go left",
            targetLabelId: testUuid("23000009", 1),
            targetLabelName: "left_path",
          },
        ],
      },
      {
        labelId: introLabelId,
        sequence: 3,
        contentType: "JUMP",
        content: "jump ending",
        projectFileId: testFileId,
      },
    ]);

    // Send 3 dialogue entries but only 1 prose line exists
    const response = await fastify.inject({
      method: "PUT",
      url: `/labels/${introLabelId}/dialogue`,
      payload: {
        dialogue: [
          { speakerId: null, text: "First prose" },
          { speakerId: testCharacterId, text: "Second prose" },
          { speakerId: null, text: "Third prose" },
        ],
      },
      cookies: {
        [SESSION_COOKIE_NAME]: auth.sessionId,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true });

    const lines = await db
      .select()
      .from(labelLines)
      .where(eq(labelLines.labelId, introLabelId))
      .orderBy(asc(labelLines.sequence));

    // seq 1: updated NARRATION, seq 2: MENU, seq 3: JUMP, seq 4: new DIALOGUE, seq 5: new NARRATION
    expect(lines).toHaveLength(5);

    expect(lines[0].contentType).toBe("NARRATION");
    expect(lines[0].content).toBe("First prose");

    expect(lines[1].contentType).toBe("MENU");
    expect(lines[1].menuOptions).toEqual([
      {
        label: "Go left",
        targetLabelId: testUuid("23000009", 1),
        targetLabelName: "left_path",
      },
    ]);

    expect(lines[2].contentType).toBe("JUMP");
    expect(lines[2].content).toBe("jump ending");

    expect(lines[3].contentType).toBe("DIALOGUE");
    expect(lines[3].content).toBe("Second prose");
    expect(lines[3].speakerId).toBe(testCharacterId);

    expect(lines[4].contentType).toBe("NARRATION");
    expect(lines[4].content).toBe("Third prose");
  });
});
