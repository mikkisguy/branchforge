#!/usr/bin/env node

/**
 * Seed Flow Graph Performance Test Data
 *
 * Creates a project with a large number of labels, characters, routes,
 * and branching connections so you can manually verify the flow graph
 * stays performant at scale (issue #195).
 *
 * Produces a realistic graph with:
 *   - N labels (default 120, override with LABEL_COUNT env var)
 *   - 3 project files (act1/2/3.rpy) — exercises FILE layout mode
 *   - 5 routes + an "Unassigned" bucket — exercises ROUTE layout + filters
 *   - 6 characters speaking across labels — exercises character tooltips/filters
 *   - NATURAL edges (sequential within file)
 *   - CHOICE edges (menu options branching across routes)
 *   - JUMP edges (jump statements)
 *
 * Usage:
 *   pnpm db:seed:flow-perf                      # 120 labels
 *   LABEL_COUNT=500 pnpm db:seed:flow-perf      # 500 labels
 *   LABEL_COUNT=1000 pnpm db:seed:flow-perf     # 1000 labels
 *
 * Login: flow-perf-test@example.com / flowtest123
 */

import { getDb } from "../src/db/index.js";
import {
  users,
  projects,
  projectFiles,
  labels,
  labelLines,
  characters,
  routeConfigs,
} from "../src/db/schema/index.js";
import { eq, inArray } from "drizzle-orm";
import { calculateContentHash } from "../src/lib/hash.js";
import { hashPassword } from "../src/services/auth.service.js";

// ─── Configuration ──────────────────────────────────────────────────────────

const TEST_EMAIL = "flow-perf-test@example.com";
const TEST_PASSWORD = "flowtest123";
const TEST_PROJECT_NAME = "Flow Performance Test";
const LABEL_COUNT = parseInt(process.env.LABEL_COUNT ?? "120", 10);

const ROUTES = [
  { key: "common", name: "Common Route", color: "#64748b" },
  { key: "heroine_a", name: "Heroine A Route", color: "#3b82f6" },
  { key: "heroine_b", name: "Heroine B Route", color: "#ec4899" },
  { key: "heroine_c", name: "Heroine C Route", color: "#10b981" },
  { key: "villain", name: "Villain Route", color: "#ef4444" },
];

const CHARACTERS = [
  { name: "Protagonist", display: "Kenji", tag: "kenji", color: "#8b5cf6" },
  { name: "Aya", display: "Aya", tag: "aya", color: "#3b82f6" },
  { name: "Mika", display: "Mika", tag: "mika", color: "#ec4899" },
  { name: "Sora", display: "Sora", tag: "sora", color: "#10b981" },
  { name: "Kuro", display: "Kuro", tag: "kuro", color: "#ef4444" },
  { name: "Narrator", display: "Narrator", tag: "narrator", color: "#64748b" },
];

const STATUSES = ["DRAFT", "REVIEW", "FINAL"] as const;
const FILES = ["act1.rpy", "act2.rpy", "act3.rpy"];

// ─── Seed ───────────────────────────────────────────────────────────────────

async function seedFlowPerf() {
  const db = getDb();
  console.log(
    `🌱 Seeding flow graph performance data (${LABEL_COUNT} labels)...\n`
  );

  // ── User ──────────────────────────────────────────────────────────────
  let [testUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, TEST_EMAIL))
    .limit(1);

  if (!testUser) {
    const passwordHash = await hashPassword(TEST_PASSWORD);
    [testUser] = await db
      .insert(users)
      .values({ email: TEST_EMAIL, passwordHash, role: "OWNER" })
      .returning();
    console.log(`✅ Created test user: ${TEST_EMAIL}`);
  } else {
    console.log(`✅ Using existing test user: ${TEST_EMAIL}`);
  }

  // ── Project ───────────────────────────────────────────────────────────
  let [testProject] = await db
    .select()
    .from(projects)
    .where(eq(projects.name, TEST_PROJECT_NAME))
    .limit(1);

  if (!testProject) {
    [testProject] = await db
      .insert(projects)
      .values({
        userId: testUser.id,
        name: TEST_PROJECT_NAME,
        description: `Performance test project with ${LABEL_COUNT} labels`,
        maxStatDelta: 10,
        source: "ZIP",
      })
      .returning();
    console.log(`✅ Created project: ${TEST_PROJECT_NAME}`);
  } else {
    // Clean up existing data for re-seeding (idempotent)
    console.log(`🗑️  Cleaning up existing data for re-seed...`);
    const existingLabels = await db
      .select({ id: labels.id })
      .from(labels)
      .where(eq(labels.projectId, testProject.id));
    if (existingLabels.length > 0) {
      const labelIds = existingLabels.map((l) => l.id);
      await db.delete(labelLines).where(inArray(labelLines.labelId, labelIds));
      await db.delete(labels).where(eq(labels.projectId, testProject.id));
    }
    await db
      .delete(routeConfigs)
      .where(eq(routeConfigs.projectId, testProject.id));
    await db.delete(characters).where(eq(characters.projectId, testProject.id));
    await db
      .delete(projectFiles)
      .where(eq(projectFiles.projectId, testProject.id));
    console.log(`✅ Re-using project: ${TEST_PROJECT_NAME}`);
  }

  const projectId = testProject.id;

  // ── Project files ─────────────────────────────────────────────────────
  const fileRecords = await db
    .insert(projectFiles)
    .values(
      FILES.map((f) => ({
        projectId,
        source: "ZIP" as const,
        filePath: `story/${f}`,
        fileType: "STORY" as const,
        content: `label start:\n    pass`,
        contentHash: calculateContentHash(`label start:\n    pass`),
      }))
    )
    .returning({ id: projectFiles.id, filePath: projectFiles.filePath });

  const fileIds = fileRecords.map((f) => f.id);
  console.log(`✅ Created ${fileIds.length} project files`);

  // ── Route configs ─────────────────────────────────────────────────────
  await db.insert(routeConfigs).values(
    ROUTES.map((r, i) => ({
      projectId,
      routeKey: r.key,
      routeName: r.name,
      jumpPrefix: `${r.key}_`,
      sortOrder: i,
      isShared: r.key === "common",
    }))
  );
  console.log(`✅ Created ${ROUTES.length} route configs`);

  // ── Characters ────────────────────────────────────────────────────────
  const charRecords = await db
    .insert(characters)
    .values(
      CHARACTERS.map((c) => ({
        projectId,
        name: c.name,
        displayName: c.display,
        renpyTag: c.tag,
        color: c.color,
      }))
    )
    .returning({ id: characters.id, name: characters.name });
  const charIds = charRecords.map((c) => c.id);
  console.log(`✅ Created ${charIds.length} characters`);

  // ── Labels ────────────────────────────────────────────────────────────
  // Distribute labels evenly across files and cycle through routes.
  const labelsPerFile = Math.ceil(LABEL_COUNT / fileIds.length);

  const labelRows: Array<{
    id: string;
    labelName: string;
    fileIndex: number;
    posInFile: number;
    routeKey: string;
  }> = [];

  // Pre-generate label metadata so we can reference label names in
  // menu options / jumps before the rows exist in the DB.
  const labelMeta: Array<{
    labelName: string;
    title: string;
    routeKey: string;
    fileIndex: number;
    posInFile: number;
    status: string;
    sequenceOrder: number;
    labelNumber: number;
  }> = [];

  for (let i = 0; i < LABEL_COUNT; i++) {
    const fileIndex = Math.floor(i / labelsPerFile);
    const posInFile = i % labelsPerFile;
    const routeKey = ROUTES[i % ROUTES.length]!.key;
    const labelName = `scene_${String(i).padStart(4, "0")}`;
    const actName = ["I", "II", "III"][fileIndex] ?? "IV";

    labelMeta.push({
      labelName,
      title: `${actName} — Scene ${posInFile + 1}`,
      routeKey,
      fileIndex,
      posInFile,
      status: STATUSES[i % STATUSES.length],
      sequenceOrder: i,
      labelNumber: i + 1,
    });
  }

  // Batch insert labels
  const insertedLabels = await db
    .insert(labels)
    .values(
      labelMeta.map((m) => ({
        projectId,
        projectFileId: fileIds[m.fileIndex]!,
        title: m.title,
        labelName: m.labelName,
        labelNumber: m.labelNumber,
        sequenceOrder: m.sequenceOrder,
        labelPosition: m.posInFile,
        route: m.routeKey,
        visibility: "EXCLUSIVE" as const,
        status: m.status as "DRAFT" | "REVIEW" | "FINAL",
        conditions: {},
        effects: {},
        createdBy: testUser.id,
        updatedBy: testUser.id,
      }))
    )
    .returning({
      id: labels.id,
      labelName: labels.labelName,
    });

  // Build labelName → id map + track metadata
  for (let i = 0; i < insertedLabels.length; i++) {
    const row = insertedLabels[i]!;
    const meta = labelMeta[i]!;
    labelRows.push({
      id: row.id,
      labelName: row.labelName!,
      fileIndex: meta.fileIndex,
      posInFile: meta.posInFile,
      routeKey: meta.routeKey,
    });
  }

  console.log(`✅ Created ${insertedLabels.length} labels`);

  // ── Label lines ───────────────────────────────────────────────────────
  // For each label, generate:
  //   - 3-5 DIALOGUE lines (random speakers → populates characterIds + wordCount)
  //   - Every 5th label: a MENU line with 2-3 choices (CHOICE edges)
  //   - Every 13th label: a JUMP line to a label 2 files ahead (JUMP edges)

  const allLines: Array<{
    labelId: string;
    sequence: number;
    content: string;
    contentType: "DIALOGUE" | "NARRATION" | "MENU" | "JUMP";
    speakerId: string | null;
    visualType: "GENERATED";
    menuOptions?: Array<{
      label: string;
      targetLabelId: string;
      targetLabelName: string;
    }>;
  }> = [];

  const DIALOGUE_SAMPLES = [
    "I can't believe we ended up here after everything that happened.",
    "The rain hasn't stopped since morning, and the streets are empty.",
    "Do you remember what she said that night by the harbour?",
    "This is the last chance we have to make things right.",
    "The old library holds more secrets than anyone realizes.",
    "I never thought I'd see you again after that summer.",
    "Something about this place feels different from what I remember.",
    "The clock tower struck midnight just as the door creaked open.",
  ];

  const CHOICE_LABELS = ["Take the risk", "Play it safe", "Ask for help"];

  for (let i = 0; i < labelRows.length; i++) {
    const lr = labelRows[i]!;
    let seq = 1;

    // 3-5 dialogue lines with random speakers
    const lineCount = 3 + (i % 3);
    for (let j = 0; j < lineCount; j++) {
      const speakerIdx = (i + j) % (charIds.length - 1); // skip narrator
      allLines.push({
        labelId: lr.id,
        sequence: seq++,
        content: DIALOGUE_SAMPLES[j % DIALOGUE_SAMPLES.length]!,
        contentType: "DIALOGUE",
        speakerId: charIds[speakerIdx]!,
        visualType: "GENERATED",
      });
    }

    // MENU line every 5th label — branch to labels in other routes
    if (i % 5 === 0 && i + 10 < labelRows.length) {
      const targets = [
        labelRows[(i + 7) % labelRows.length]!,
        labelRows[(i + 13) % labelRows.length]!,
        labelRows[(i + 23) % labelRows.length]!,
      ].slice(0, 2 + (i % 2)); // 2-3 choices

      allLines.push({
        labelId: lr.id,
        sequence: seq++,
        content: "What will you do?",
        contentType: "MENU",
        speakerId: charIds[0]!,
        visualType: "GENERATED",
        menuOptions: targets.map((t, idx) => ({
          label: CHOICE_LABELS[idx] ?? `Option ${idx + 1}`,
          targetLabelId: t.labelName,
          targetLabelName: t.labelName,
        })),
      });
    }

    // JUMP line every 13th label — jump to a label in a later file
    if (i % 13 === 0) {
      const jumpTarget = labelRows[(i + labelsPerFile) % labelRows.length]!;
      allLines.push({
        labelId: lr.id,
        sequence: seq,
        content: `jump ${jumpTarget.labelName}`,
        contentType: "JUMP",
        speakerId: null,
        visualType: "GENERATED",
      });
    }
  }

  // Batch insert all lines
  await db.insert(labelLines).values(allLines);
  console.log(
    `✅ Created ${allLines.length} label lines (${Math.floor(allLines.length / LABEL_COUNT)} avg per label)`
  );

  // ── Summary ───────────────────────────────────────────────────────────
  console.log("\n🎉 Flow performance data seeded!\n");
  console.log(`  Labels:      ${LABEL_COUNT}`);
  console.log(`  Files:       ${fileIds.length} (act1/2/3.rpy)`);
  console.log(`  Routes:      ${ROUTES.length}`);
  console.log(`  Characters:  ${charIds.length}`);
  console.log(`  Lines:       ${allLines.length}`);
  console.log(
    `\n  CHOICE edges: ~${Math.floor(LABEL_COUNT / 5) * 2} (menu options)`
  );
  console.log(
    `  JUMP edges:   ~${Math.floor(LABEL_COUNT / 13)} (jump statements)`
  );
  console.log(
    `  NATURAL edges: ~${LABEL_COUNT - fileIds.length} (sequential)\n`
  );
  console.log("To test:");
  console.log(`  1. Start the app: pnpm dev`);
  console.log(`  2. Login: ${TEST_EMAIL} / ${TEST_PASSWORD}`);
  console.log(`  3. Open "${TEST_PROJECT_NAME}"`);
  console.log("  4. Open the flow graph view");
  console.log("  5. Pan/zoom — should be smooth even at 500+ nodes");
  console.log("  6. Try the search filter — should debounce, not lag");
  console.log(
    "  7. Hover a node — tooltip should show characters + word count"
  );
  console.log(
    "  8. Switch layout modes (FLOW/ROUTE/FILE) to verify all 3 work"
  );

  process.exit(0);
}

seedFlowPerf().catch((error) => {
  console.error("❌ Seed script failed:", error);
  process.exit(1);
});
