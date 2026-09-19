/**
 * Docs demo seed — deterministic sample project for documentation screenshots
 * and local evaluation. Uses project_files + syncLabelsFromFile (parser path).
 */

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
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
} from "../db/schema/index.js";
import { calculateContentHash } from "../lib/hash.js";
import { hashPassword } from "./auth.service.js";
import { syncLabelsFromFile } from "./labels.service.js";

export const DOCS_DEMO_EMAIL = "docs-demo@branchforge.test";
export const DOCS_DEMO_PASSWORD = "docsdemo123";
export const DOCS_DEMO_PROJECT_NAME = "BranchForge Docs Demo";

const ROUTE_ELENA = "elena";
const ROUTE_MARCUS = "marcus";

const SCRIPT_RPY = `default trust = 0
default chose_elena = False
default met_marcus = False

label start:
    scene bg cafe with fade

    "Welcome to the BranchForge docs demo."

    elena "Ready to explore branching stories?"

    marcus "Import your Ren'Py project and visualize every path."

    jump docs_intro

label docs_intro:
    "This shared introduction appears on every route."

    menu:
        "Follow Elena":
            $ chose_elena = True
            jump elena_route_start

        "Follow Marcus":
            jump marcus_route_start

label elena_route_start:
    scene bg park

    elena "You chose my path."

    if trust >= 1:
        elena "We've built some trust already."

    $ trust += 1

    jump reunion

label marcus_route_start:
    marcus "A different perspective on the same story."

    $ met_marcus = True

    jump reunion

label reunion:
    "Both paths converge here — a classic split and rejoin."

    jump ending

label ending:
    "Thanks for trying BranchForge. Export when you're ready."
    return
`;

const EPILOGUE_RPY = `label epilogue_shared:
    "A shared epilogue label in a second file."

    jump epilogue_elena

label epilogue_elena:
    elena "Elena-specific closing thoughts."
    jump epilogue_duo

label epilogue_duo:
    "A shared duo ending for Elena and Marcus."
    return
`;

export type DocsDemoSeedResult = {
  userId: string;
  projectId: string;
  labelCount: number;
  fileCount: number;
};

export function assertDocsDemoSeedEnvironment(
  nodeEnv = process.env.NODE_ENV ?? "development"
): void {
  if (nodeEnv === "production" || nodeEnv === "staging") {
    throw new Error(
      `Refusing to seed docs demo in "${nodeEnv}" — this script creates a ` +
        "test OWNER account with known credentials. Only run in development/local."
    );
  }
}

async function cleanupDemoProject(projectId: string): Promise<void> {
  const db = getDb();
  await db.delete(projects).where(eq(projects.id, projectId));
}

export async function seedDocsDemo(): Promise<DocsDemoSeedResult> {
  assertDocsDemoSeedEnvironment();

  const db = getDb();

  let [demoUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, DOCS_DEMO_EMAIL))
    .limit(1);

  if (!demoUser) {
    const passwordHash = await hashPassword(DOCS_DEMO_PASSWORD);
    [demoUser] = await db
      .insert(users)
      .values({
        email: DOCS_DEMO_EMAIL,
        passwordHash,
        role: "OWNER",
      })
      .returning();
  }

  const existingProject = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.userId, demoUser.id),
        eq(projects.name, DOCS_DEMO_PROJECT_NAME)
      )
    )
    .limit(1);

  if (existingProject.length > 0) {
    await cleanupDemoProject(existingProject[0].id);
  }

  const [demoProject] = await db
    .insert(projects)
    .values({
      userId: demoUser.id,
      name: DOCS_DEMO_PROJECT_NAME,
      description:
        "Sample branching narrative for documentation screenshots and local demos.",
      maxStatDelta: 10,
      source: "ZIP",
    })
    .returning();

  const projectId = demoProject.id;

  await db.insert(routeConfigs).values([
    {
      projectId,
      routeKey: ROUTE_ELENA,
      routeName: "Elena's Route",
      jumpPrefix: "elena_",
      sortOrder: 0,
      isShared: false,
    },
    {
      projectId,
      routeKey: ROUTE_MARCUS,
      routeName: "Marcus's Route",
      jumpPrefix: "marcus_",
      sortOrder: 1,
      isShared: false,
    },
  ]);

  const [elenaCharacter, marcusCharacter] = await db
    .insert(characters)
    .values([
      {
        projectId,
        name: "Elena",
        displayName: "Elena",
        renpyTag: "elena",
        color: "#3b82f6",
      },
      {
        projectId,
        name: "Marcus",
        displayName: "Marcus",
        renpyTag: "marcus",
        color: "#10b981",
      },
    ])
    .returning();

  const characterAId =
    elenaCharacter.id < marcusCharacter.id
      ? elenaCharacter.id
      : marcusCharacter.id;
  const characterBId =
    elenaCharacter.id < marcusCharacter.id
      ? marcusCharacter.id
      : elenaCharacter.id;

  const fileSpecs = [
    {
      filePath: "game/script.rpy",
      content: SCRIPT_RPY,
    },
    {
      filePath: "game/epilogue.rpy",
      content: EPILOGUE_RPY,
    },
  ];

  const insertedFiles = await db
    .insert(projectFiles)
    .values(
      fileSpecs.map((file) => ({
        projectId,
        source: "ZIP" as const,
        filePath: file.filePath,
        fileType: "STORY" as const,
        content: file.content,
        contentHash: calculateContentHash(file.content),
      }))
    )
    .returning({ id: projectFiles.id, filePath: projectFiles.filePath });

  for (const file of insertedFiles) {
    const spec = fileSpecs.find((f) => f.filePath === file.filePath);
    if (!spec) continue;

    const syncResult = await syncLabelsFromFile(
      projectId,
      { filePath: file.filePath, fileType: "STORY" },
      spec.content,
      file.id
    );

    if (!syncResult.success) {
      throw new Error(
        `Failed to sync labels for ${file.filePath}: ${syncResult.errors.join(", ")}`
      );
    }
  }

  const projectLabels = await db
    .select()
    .from(labels)
    .where(eq(labels.projectId, projectId));

  const labelMeta: Record<
    string,
    {
      route: string | null;
      visibility: "EXCLUSIVE" | "SHARED" | "DUO_PAIR";
      status: "DRAFT" | "REVIEW" | "FINAL";
    }
  > = {
    start: { route: null, visibility: "SHARED", status: "FINAL" },
    docs_intro: { route: null, visibility: "SHARED", status: "FINAL" },
    elena_route_start: {
      route: ROUTE_ELENA,
      visibility: "EXCLUSIVE",
      status: "DRAFT",
    },
    marcus_route_start: {
      route: ROUTE_MARCUS,
      visibility: "EXCLUSIVE",
      status: "REVIEW",
    },
    reunion: { route: null, visibility: "SHARED", status: "REVIEW" },
    ending: { route: null, visibility: "SHARED", status: "FINAL" },
    epilogue_shared: { route: null, visibility: "SHARED", status: "DRAFT" },
    epilogue_elena: {
      route: ROUTE_ELENA,
      visibility: "EXCLUSIVE",
      status: "FINAL",
    },
    epilogue_duo: { route: null, visibility: "DUO_PAIR", status: "FINAL" },
  };

  for (const label of projectLabels) {
    const meta = label.labelName ? labelMeta[label.labelName] : undefined;
    if (!meta) continue;

    await db
      .update(labels)
      .set({
        route: meta.route,
        visibility: meta.visibility,
        status: meta.status,
        updatedBy: demoUser.id,
      })
      .where(eq(labels.id, label.id));
  }

  await db.insert(variables).values([
    {
      projectId,
      key: "chose_elena",
      description: "Player followed Elena's path at the fork.",
    },
    {
      projectId,
      key: "met_marcus",
      description: "Player has spoken with Marcus on his route.",
    },
  ]);

  await db.insert(stats).values({
    projectId,
    characterId: elenaCharacter.id,
    key: "trust",
    name: "Trust",
    minValue: 0,
    maxValue: 10,
    description: "Elena's trust level toward the protagonist.",
  });

  await db.insert(worldElements).values({
    projectId,
    name: "Café Lantern",
    type: "LOCATION",
    description:
      "A quiet corner café where the demo story opens — warm light and branching conversations.",
    tags: ["demo", "opening"],
  });

  await db.insert(pairGroups).values({
    projectId,
    characterAId,
    characterBId,
    duoEndingLabel: "epilogue_duo",
  });

  const [existingSettings] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, demoUser.id))
    .limit(1);

  if (existingSettings) {
    await db
      .update(userSettings)
      .set({
        theme: "forest",
        dailyWritingGoal: 500,
        username: "Docs Demo",
        updatedAt: new Date(),
      })
      .where(eq(userSettings.userId, demoUser.id));
  } else {
    await db.insert(userSettings).values({
      userId: demoUser.id,
      theme: "forest",
      dailyWritingGoal: 500,
      username: "Docs Demo",
    });
  }

  const flowPositions: Record<string, { x: number; y: number }> = {};
  const routePositions: Record<string, { x: number; y: number }> = {};
  const filePositions: Record<string, { x: number; y: number }> = {};

  projectLabels.forEach((label, index) => {
    const x = (index % 4) * 220;
    const y = Math.floor(index / 4) * 140;
    flowPositions[label.id] = { x, y };
    routePositions[label.id] = { x: x + 40, y: y + 20 };
    filePositions[label.id] = {
      x: label.projectFileId === insertedFiles[0]?.id ? x : x + 320,
      y,
    };
  });

  await db.insert(flowGraphLayouts).values([
    {
      projectId,
      userId: demoUser.id,
      mode: "FLOW",
      positions: flowPositions,
    },
    {
      projectId,
      userId: demoUser.id,
      mode: "ROUTE",
      positions: routePositions,
    },
    {
      projectId,
      userId: demoUser.id,
      mode: "FILE",
      positions: filePositions,
    },
  ]);

  const syncedLabels = await db
    .select({ id: labels.id })
    .from(labels)
    .where(eq(labels.projectId, projectId));

  const menuLines = await db
    .select()
    .from(labelLines)
    .where(
      and(
        inArray(
          labelLines.labelId,
          syncedLabels.map((l) => l.id)
        ),
        eq(labelLines.contentType, "MENU")
      )
    );

  if (menuLines.length === 0) {
    throw new Error(
      "Docs demo seed expected at least one MENU line from parser"
    );
  }

  const visualLines = await db
    .select()
    .from(labelLines)
    .where(
      and(
        inArray(
          labelLines.labelId,
          syncedLabels.map((l) => l.id)
        ),
        eq(labelLines.contentType, "VISUAL")
      )
    );

  if (visualLines.length === 0) {
    throw new Error(
      "Docs demo seed expected at least one VISUAL line from parser"
    );
  }

  return {
    userId: demoUser.id,
    projectId,
    labelCount: syncedLabels.length,
    fileCount: insertedFiles.length,
  };
}
