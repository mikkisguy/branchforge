/**
 * Docs demo seed integration tests.
 *
 * Prerequisites:
 * - DATABASE_URL_TEST environment variable must be set
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  characters,
  flowGraphLayouts,
  labelLines,
  labels,
  pairGroups,
  projectFiles,
  projects,
  routeConfigs,
  stats,
  userSettings,
  users,
  variables,
  worldElements,
} from "../../db/schema/index.js";
import {
  DOCS_DEMO_EMAIL,
  DOCS_DEMO_PROJECT_NAME,
  assertDocsDemoSeedEnvironment,
  seedDocsDemo,
} from "../docs-demo-seed.service.js";
import { testEmail, testUuid } from "../../utils/test-ids.js";

describe("Docs demo seed (integration)", () => {
  let db: ReturnType<typeof getDb>;

  const unrelatedUserId = testUuid("09000000", 1);
  const unrelatedProjectId = testUuid("19000000", 1);

  beforeAll(() => {
    db = getDb();
  });

  async function cleanupDemoData() {
    const [demoUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, DOCS_DEMO_EMAIL))
      .limit(1);

    if (demoUser) {
      const demoProjects = await db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.userId, demoUser.id));

      for (const project of demoProjects) {
        await db.delete(projects).where(eq(projects.id, project.id));
      }

      await db.delete(userSettings).where(eq(userSettings.userId, demoUser.id));
      await db.delete(users).where(eq(users.id, demoUser.id));
    }
  }

  async function cleanupUnrelatedData() {
    await db.delete(projects).where(eq(projects.id, unrelatedProjectId));
    await db.delete(users).where(eq(users.id, unrelatedUserId));
  }

  beforeEach(async () => {
    await cleanupDemoData();
    await cleanupUnrelatedData();

    await db.insert(users).values({
      id: unrelatedUserId,
      email: testEmail("docs-demo-seed", "unrelated"),
      passwordHash: "hash",
      role: "OWNER",
    });

    await db.insert(projects).values({
      id: unrelatedProjectId,
      userId: unrelatedUserId,
      name: "Unrelated Preservation Project",
      maxStatDelta: 10,
      source: "ZIP",
    });
  });

  afterEach(async () => {
    await cleanupDemoData();
    await cleanupUnrelatedData();
  });

  describe("assertDocsDemoSeedEnvironment", () => {
    it("refuses production", () => {
      expect(() => assertDocsDemoSeedEnvironment("production")).toThrow(
        /Refusing to seed docs demo/
      );
    });

    it("refuses staging", () => {
      expect(() => assertDocsDemoSeedEnvironment("staging")).toThrow(
        /Refusing to seed docs demo/
      );
    });

    it("allows development", () => {
      expect(() => assertDocsDemoSeedEnvironment("development")).not.toThrow();
    });
  });

  describe("seedDocsDemo", () => {
    it("creates parser-derived labels, flow edges, and metadata", async () => {
      const result = await seedDocsDemo();

      expect(result.labelCount).toBeGreaterThanOrEqual(8);
      expect(result.labelCount).toBeLessThanOrEqual(12);
      expect(result.fileCount).toBe(2);

      const projectLabels = await db
        .select()
        .from(labels)
        .where(eq(labels.projectId, result.projectId));

      expect(projectLabels.some((l) => l.labelName === "docs_intro")).toBe(
        true
      );
      expect(projectLabels.some((l) => l.visibility === "SHARED")).toBe(true);
      expect(projectLabels.some((l) => l.visibility === "DUO_PAIR")).toBe(true);
      expect(projectLabels.some((l) => l.status === "DRAFT")).toBe(true);
      expect(projectLabels.some((l) => l.status === "REVIEW")).toBe(true);

      const labelIds = projectLabels.map((l) => l.id);
      const lines = await db
        .select()
        .from(labelLines)
        .where(inArray(labelLines.labelId, labelIds));

      expect(lines.some((line) => line.contentType === "MENU")).toBe(true);
      expect(lines.some((line) => line.contentType === "VISUAL")).toBe(true);
      expect(lines.some((line) => line.contentType === "DIALOGUE")).toBe(true);

      const forkLabel = projectLabels.find((l) => l.labelName === "docs_intro");
      expect(forkLabel).toBeDefined();
      expect(forkLabel?.incomingJumps?.length ?? 0).toBeGreaterThan(0);

      const routeRows = await db
        .select()
        .from(routeConfigs)
        .where(eq(routeConfigs.projectId, result.projectId));
      expect(routeRows).toHaveLength(2);

      const characterRows = await db
        .select()
        .from(characters)
        .where(eq(characters.projectId, result.projectId));
      expect(characterRows).toHaveLength(2);

      const variableRows = await db
        .select()
        .from(variables)
        .where(eq(variables.projectId, result.projectId));
      expect(variableRows.length).toBeGreaterThanOrEqual(1);

      const statRows = await db
        .select()
        .from(stats)
        .where(eq(stats.projectId, result.projectId));
      expect(statRows).toHaveLength(1);

      const worldRows = await db
        .select()
        .from(worldElements)
        .where(eq(worldElements.projectId, result.projectId));
      expect(worldRows).toHaveLength(1);

      const pairRows = await db
        .select()
        .from(pairGroups)
        .where(eq(pairGroups.projectId, result.projectId));
      expect(pairRows).toHaveLength(1);

      const layouts = await db
        .select()
        .from(flowGraphLayouts)
        .where(eq(flowGraphLayouts.projectId, result.projectId));
      expect(layouts.map((l) => l.mode).sort()).toEqual([
        "FILE",
        "FLOW",
        "ROUTE",
      ]);

      const [settings] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, result.userId));
      expect(settings?.dailyWritingGoal).toBe(500);
      expect(settings?.theme).toBe("forest");
    });

    it("is idempotent and preserves unrelated projects", async () => {
      const first = await seedDocsDemo();
      const second = await seedDocsDemo();

      expect(second.projectId).not.toBe(first.projectId);

      const demoProjects = await db
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.userId, first.userId),
            eq(projects.name, DOCS_DEMO_PROJECT_NAME)
          )
        );
      expect(demoProjects).toHaveLength(1);

      const [unrelated] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, unrelatedProjectId));
      expect(unrelated?.name).toBe("Unrelated Preservation Project");

      const demoFiles = await db
        .select()
        .from(projectFiles)
        .where(eq(projectFiles.projectId, second.projectId));
      expect(demoFiles).toHaveLength(2);
    });
  });
});
