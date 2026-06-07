/**
 * Incoming Jumps Integration Tests
 *
 * Verifies that `incomingJumps` is correctly computed during sync and
 * returned by `getLabel`. Covers menu-choice jumps, automatic jumps,
 * and cross-file jump resolution.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../../db/index.js";
import {
  users,
  projects,
  labels as labelsTable,
  labelLines,
  projectFiles,
} from "../../db/schema/index.js";
import { eq, inArray } from "drizzle-orm";
import { syncLabelsFromFile, getLabel } from "../labels.service.js";
import { importZipFile } from "../zip-import.service.js";
import { calculateContentHash } from "../../lib/hash.js";
import { testEmail, testUuid } from "../../utils/test-ids.js";
import JSZip from "jszip";

describe("Incoming Jumps", () => {
  const db = getDb();
  const testUserId = testUuid("99110000", 1);
  const testProjectId = testUuid("99110000", 2);
  const testFile1Id = testUuid("99110000", 3);
  const testFile2Id = testUuid("99110000", 4);

  beforeAll(async () => {
    await db.insert(users).values({
      id: testUserId,
      email: testEmail("incoming-jumps", "user"),
      passwordHash: "hash",
      role: "OWNER",
    });
    await db.insert(projects).values({
      id: testProjectId,
      userId: testUserId,
      name: "Incoming Jumps Test",
      source: "ZIP",
    });
    await db.insert(projectFiles).values([
      {
        id: testFile1Id,
        projectId: testProjectId,
        source: "ZIP",
        filePath: "game/file1.rpy",
        fileType: "STORY",
        content: "",
        contentHash: calculateContentHash(""),
      },
      {
        id: testFile2Id,
        projectId: testProjectId,
        source: "ZIP",
        filePath: "game/file2.rpy",
        fileType: "STORY",
        content: "",
        contentHash: calculateContentHash(""),
      },
    ]);
  });

  afterAll(async () => {
    const zipUserId = testUuid("99110000", 9);
    const zipProjectId = testUuid("99110000", 10);

    // Clean up both testProjectId and zipProjectId data
    for (const projectId of [testProjectId, zipProjectId]) {
      const lbls = await db
        .select({ id: labelsTable.id })
        .from(labelsTable)
        .where(eq(labelsTable.projectId, projectId));
      if (lbls.length > 0) {
        await db.delete(labelLines).where(
          inArray(
            labelLines.labelId,
            lbls.map((l) => l.id)
          )
        );
      }
      await db.delete(labelsTable).where(eq(labelsTable.projectId, projectId));
      await db
        .delete(projectFiles)
        .where(eq(projectFiles.projectId, projectId));
      await db.delete(projects).where(eq(projects.id, projectId));
    }
    for (const userId of [testUserId, zipUserId]) {
      await db.delete(users).where(eq(users.id, userId));
    }
  });

  it("populates incomingJumps for labels targeted by menu choices", async () => {
    // File 1: "start" label with menu jumping to "park_scene" and "home_scene"
    const file1 = `
label start:
    "Welcome to the game"
    menu:
        "Go to park":
            jump park_scene
        "Stay home":
            jump home_scene
`.trim();

    const result1 = await syncLabelsFromFile(
      testProjectId,
      { filePath: "game/file1.rpy", fileType: "STORY" },
      file1,
      testFile1Id
    );
    expect(result1.success).toBe(true);

    // File 2: target labels
    const file2 = `
label park_scene:
    "You went to the park"
    return

label home_scene:
    "You stayed home"
    return
`.trim();

    const result2 = await syncLabelsFromFile(
      testProjectId,
      { filePath: "game/file2.rpy", fileType: "STORY" },
      file2,
      testFile2Id
    );
    expect(result2.success).toBe(true);

    // Check incomingJumps in database
    const allLabels = await db
      .select({
        id: labelsTable.id,
        title: labelsTable.title,
        labelName: labelsTable.labelName,
        incomingJumps: labelsTable.incomingJumps,
      })
      .from(labelsTable)
      .where(eq(labelsTable.projectId, testProjectId));

    const parkLabel = allLabels.find((l) => l.labelName === "park_scene");
    const homeLabel = allLabels.find((l) => l.labelName === "home_scene");
    const startLabel = allLabels.find((l) => l.labelName === "start");

    // park_scene should have incoming jump from start
    expect(parkLabel).toBeDefined();
    expect(parkLabel!.incomingJumps).toBeDefined();
    expect(parkLabel!.incomingJumps!.length).toBeGreaterThanOrEqual(1);
    expect(parkLabel!.incomingJumps![0].sourceLabelTitle).toBe("start");
    expect(parkLabel!.incomingJumps![0].jumpType).toBe("MENU_CHOICE");
    expect(parkLabel!.incomingJumps![0].choiceText).toBe("Go to park");

    // home_scene should have incoming jump from start
    expect(homeLabel).toBeDefined();
    expect(homeLabel!.incomingJumps).toBeDefined();
    expect(homeLabel!.incomingJumps!.length).toBeGreaterThanOrEqual(1);
    expect(homeLabel!.incomingJumps![0].choiceText).toBe("Stay home");

    // start should have no incoming jumps
    expect(startLabel).toBeDefined();
    expect(
      !startLabel!.incomingJumps || startLabel!.incomingJumps.length === 0
    ).toBe(true);
  });

  it("populates incomingJumps for labels targeted by automatic jump statements", async () => {
    const file3Id = testUuid("99110000", 5);
    const file4Id = testUuid("99110000", 6);

    await db.insert(projectFiles).values([
      {
        id: file3Id,
        projectId: testProjectId,
        source: "ZIP",
        filePath: "game/file3.rpy",
        fileType: "STORY",
        content: "",
        contentHash: calculateContentHash(""),
      },
      {
        id: file4Id,
        projectId: testProjectId,
        source: "ZIP",
        filePath: "game/file4.rpy",
        fileType: "STORY",
        content: "",
        contentHash: calculateContentHash(""),
      },
    ]);

    const file3 = `
label chapter1:
    "Some dialogue"
    jump chapter2
`.trim();

    const file4 = `
label chapter2:
    "Chapter 2 begins"
    return
`.trim();

    const r1 = await syncLabelsFromFile(
      testProjectId,
      { filePath: "game/file3.rpy", fileType: "STORY" },
      file3,
      file3Id
    );
    expect(r1.success).toBe(true);

    const r2 = await syncLabelsFromFile(
      testProjectId,
      { filePath: "game/file4.rpy", fileType: "STORY" },
      file4,
      file4Id
    );
    expect(r2.success).toBe(true);

    const allLabels = await db
      .select({
        id: labelsTable.id,
        title: labelsTable.title,
        labelName: labelsTable.labelName,
        incomingJumps: labelsTable.incomingJumps,
      })
      .from(labelsTable)
      .where(eq(labelsTable.projectId, testProjectId));

    const ch2 = allLabels.find((l) => l.labelName === "chapter2");
    expect(ch2).toBeDefined();
    expect(ch2!.incomingJumps).toBeDefined();
    expect(ch2!.incomingJumps!.length).toBeGreaterThanOrEqual(1);
    expect(ch2!.incomingJumps![0].jumpType).toBe("AUTOMATIC");
    expect(ch2!.incomingJumps![0].sourceLabelTitle).toBe("chapter1");
  });

  it("getLabel returns incomingJumps in the LabelDetail response", async () => {
    const allLabels = await db
      .select({ id: labelsTable.id, labelName: labelsTable.labelName })
      .from(labelsTable)
      .where(eq(labelsTable.projectId, testProjectId));

    const parkLabel = allLabels.find((l) => l.labelName === "park_scene");
    expect(parkLabel).toBeDefined();

    const labelDetail = await getLabel(parkLabel!.id, testUserId);
    expect(labelDetail).not.toBeNull();
    expect(labelDetail!.incomingJumps).toBeDefined();
    expect(labelDetail!.incomingJumps!.length).toBeGreaterThanOrEqual(1);
    expect(labelDetail!.incomingJumps![0].sourceLabelTitle).toBe("start");
    expect(labelDetail!.incomingJumps![0].jumpType).toBe("MENU_CHOICE");
    expect(labelDetail!.incomingJumps![0].choiceText).toBe("Go to park");
  });

  it("populates incomingJumps when multiple files are synced within a single transaction", async () => {
    const testFile5Id = testUuid("99110000", 7);
    const testFile6Id = testUuid("99110000", 8);

    await db.insert(projectFiles).values([
      {
        id: testFile5Id,
        projectId: testProjectId,
        source: "ZIP",
        filePath: "game/file5.rpy",
        fileType: "STORY",
        content: "",
        contentHash: calculateContentHash(""),
      },
      {
        id: testFile6Id,
        projectId: testProjectId,
        source: "ZIP",
        filePath: "game/file6.rpy",
        fileType: "STORY",
        content: "",
        contentHash: calculateContentHash(""),
      },
    ]);

    const file5 = `
label start2:
    "Welcome to the game"
    menu:
        "Go to park2":
            jump park_scene2
        "Stay home2":
            jump home_scene2
`.trim();

    const file6 = `
label park_scene2:
    "You went to the park"
    return

label home_scene2:
    "You stayed home"
    return
`.trim();

    // Sync both files within a single transaction (like ZIP import does)
    await db.transaction(async (tx) => {
      await syncLabelsFromFile(
        testProjectId,
        { filePath: "game/file5.rpy", fileType: "STORY" },
        file5,
        testFile5Id,
        { tx }
      );

      await syncLabelsFromFile(
        testProjectId,
        { filePath: "game/file6.rpy", fileType: "STORY" },
        file6,
        testFile6Id,
        { tx }
      );
    });

    // Check incomingJumps in database
    const allLabels = await db
      .select({
        id: labelsTable.id,
        title: labelsTable.title,
        labelName: labelsTable.labelName,
        incomingJumps: labelsTable.incomingJumps,
      })
      .from(labelsTable)
      .where(eq(labelsTable.projectId, testProjectId));

    const parkLabel2 = allLabels.find((l) => l.labelName === "park_scene2");
    const homeLabel2 = allLabels.find((l) => l.labelName === "home_scene2");
    const startLabel2 = allLabels.find((l) => l.labelName === "start2");

    // park_scene2 should have incoming jump from start2
    expect(parkLabel2).toBeDefined();
    expect(parkLabel2!.incomingJumps).toBeDefined();
    expect(parkLabel2!.incomingJumps!.length).toBeGreaterThanOrEqual(1);
    expect(parkLabel2!.incomingJumps![0].sourceLabelTitle).toBe("start2");
    expect(parkLabel2!.incomingJumps![0].jumpType).toBe("MENU_CHOICE");
    expect(parkLabel2!.incomingJumps![0].choiceText).toBe("Go to park2");

    // home_scene2 should have incoming jump from start2
    expect(homeLabel2).toBeDefined();
    expect(homeLabel2!.incomingJumps).toBeDefined();
    expect(homeLabel2!.incomingJumps!.length).toBeGreaterThanOrEqual(1);
    expect(homeLabel2!.incomingJumps![0].choiceText).toBe("Stay home2");

    // start2 should have no incoming jumps
    expect(startLabel2).toBeDefined();
    expect(
      !startLabel2!.incomingJumps || startLabel2!.incomingJumps.length === 0
    ).toBe(true);
  });

  it("populates incomingJumps after a full ZIP import", async () => {
    const zipUserId = testUuid("99110000", 9);
    const zipProjectId = testUuid("99110000", 10);

    await db.insert(users).values({
      id: zipUserId,
      email: testEmail("incoming-jumps-zip", "user"),
      passwordHash: "hash",
      role: "OWNER",
    });

    await db.insert(projects).values({
      id: zipProjectId,
      userId: zipUserId,
      name: "ZIP Incoming Jumps Test",
      source: "ZIP",
    });

    const zip = new JSZip();
    zip.file(
      "game/start.rpy",
      'label start:\n    "Welcome"\n    menu:\n        "Go to park":\n            jump park\n        "Stay home":\n            jump home\n'
    );
    zip.file(
      "game/park.rpy",
      'label park:\n    "You went to the park"\n    return\n'
    );
    zip.file(
      "game/home.rpy",
      'label home:\n    "You stayed home"\n    return\n'
    );

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    const result = await importZipFile(zipProjectId, zipBuffer);
    expect(result.success).toBe(true);

    const allLabels = await db
      .select({
        id: labelsTable.id,
        title: labelsTable.title,
        labelName: labelsTable.labelName,
        incomingJumps: labelsTable.incomingJumps,
      })
      .from(labelsTable)
      .where(eq(labelsTable.projectId, zipProjectId));

    const parkLabel = allLabels.find((l) => l.labelName === "park");
    const homeLabel = allLabels.find((l) => l.labelName === "home");
    const startLabel = allLabels.find((l) => l.labelName === "start");

    expect(parkLabel).toBeDefined();
    expect(parkLabel!.incomingJumps).toBeDefined();
    expect(parkLabel!.incomingJumps!.length).toBeGreaterThanOrEqual(1);
    expect(parkLabel!.incomingJumps![0].sourceLabelTitle).toBe("start");
    expect(parkLabel!.incomingJumps![0].jumpType).toBe("MENU_CHOICE");
    expect(parkLabel!.incomingJumps![0].choiceText).toBe("Go to park");

    expect(homeLabel).toBeDefined();
    expect(homeLabel!.incomingJumps).toBeDefined();
    expect(homeLabel!.incomingJumps!.length).toBeGreaterThanOrEqual(1);
    expect(homeLabel!.incomingJumps![0].choiceText).toBe("Stay home");

    expect(startLabel).toBeDefined();
    expect(
      !startLabel!.incomingJumps || startLabel!.incomingJumps.length === 0
    ).toBe(true);
  });
});
