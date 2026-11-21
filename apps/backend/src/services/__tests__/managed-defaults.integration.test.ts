import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  users,
  projects,
  projectFiles,
  variables,
  stats,
} from "../../db/schema/index.js";
import { testEmail, testUuid } from "../../utils/test-ids.js";
import { calculateContentHash } from "../../lib/hash.js";
import { importZipFile } from "../zip-import.service.js";
import { updateFileContent } from "../projects.service.js";
import {
  generateExport,
  getExportForDownload,
  getExportPreview,
} from "../export.service.js";
import { ConflictError } from "../../middleware/error-handler.middleware.js";
import { extractAndStripRpySymbols } from "../rpy-statements.service.js";
import { statsService } from "../stats.service.js";
import { createVariable, updateVariable } from "../variables.service.js";

const userId = testUuid("09000000", 80);
const projectId = testUuid("19000000", 80);

const baseStory = `label start:
    "Narration"
    return`;

async function archive(
  content: string,
  extra: Record<string, string> = {}
): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("game/script.rpy", content);
  for (const [path, source] of Object.entries(extra)) zip.file(path, source);
  return zip.generateAsync({ type: "nodebuffer" });
}

async function getVariablesRow(key: string) {
  const rows = await getDb()
    .select()
    .from(variables)
    .where(eq(variables.projectId, projectId));
  return rows.find((row) => row.key === key);
}

async function insertRawFile(filePath: string, content: string) {
  const [row] = await getDb()
    .insert(projectFiles)
    .values({
      projectId,
      source: "ZIP",
      filePath,
      fileType: "STORY",
      content,
      contentHash: calculateContentHash(content),
    })
    .returning();
  return row!;
}

describe("managed defaults (Integration)", () => {
  const db = getDb();

  beforeEach(async () => {
    await db.delete(projects).where(eq(projects.id, projectId));
    await db.delete(users).where(eq(users.id, userId));
    await db.insert(users).values({
      id: userId,
      email: testEmail("managed-defaults", "author"),
      passwordHash: "test",
    });
    await db
      .insert(projects)
      .values({ id: projectId, userId, name: "Defaults", source: "ZIP" });
  });

  afterEach(async () => {
    await db.delete(projects).where(eq(projects.id, projectId));
    await db.delete(users).where(eq(users.id, userId));
  });

  async function exportFiles() {
    const exported = await generateExport(projectId, userId);
    const download = await getExportForDownload(exported.id, projectId, userId);
    return JSON.parse(download.content) as Record<string, string>;
  }

  it("round-trips ZIP defaults exactly once and keeps values through metadata and dialogue edits", async () => {
    const defaults = [
      "default both_mode = True",
      "default other_mode = False",
      "default text_speed = 0.5",
      "default route_offset = -3",
      "default starting_points = 120",
      "default ordinary = 42",
      "default whole_float = 1.0",
      "default big_integer = 9007199254740993",
      "default padded_float = 00.50",
      "default padded_zero = 000",
    ];
    const preserved =
      "default expression = 1e2\ndefault chapter = 01\ndefault persistent.visited = True";
    const screens = "default protected_flag = True";
    const story = [...defaults, preserved, baseStory].join("\n");
    await db.insert(stats).values([
      { projectId, key: "expression", name: "Expression" },
      { projectId, key: "chapter", name: "Chapter" },
      { projectId, key: "both_mode", name: "Existing Stat" },
    ]);
    await db.insert(variables).values({ projectId, key: "protected_flag" });
    expect(
      await importZipFile(
        projectId,
        await archive(story, { "game/screens.rpy": screens })
      )
    ).toMatchObject({ success: true });

    const assertRoundTrip = async () => {
      const preview = await getExportPreview(projectId, userId);
      const files = await exportFiles();
      const allLines = Object.values(files).flatMap((content) =>
        content.split("\n")
      );
      for (const declaration of [
        ...defaults,
        ...preserved.split("\n"),
        screens,
      ]) {
        const key = declaration.split(" = ")[0];
        expect(allLines.filter((line) => line.startsWith(`${key} = `))).toEqual(
          [declaration]
        );
      }
      for (const entry of preview.files.filter(
        (item) => item.kind !== "definitions"
      )) {
        expect(files[`game/${entry.fileName}`]).toBe(entry.content);
      }
      expect(files["game/screens.rpy"]).toBe(screens);
      expect(files["game/script.rpy"]).toContain(preserved);
    };
    await assertRoundTrip();

    const flag = (await getVariablesRow("both_mode"))!;
    await updateVariable(flag.id, userId, {
      description: "Edited description",
    });
    const stat = (await statsService.listStats(projectId, userId)).find(
      (row) => row.key === "starting_points"
    )!;
    await statsService.updateStat(stat.id, userId, {
      minValue: 5,
      maxValue: 15,
      name: "Points",
    });
    const [file] = await db
      .select()
      .from(projectFiles)
      .where(eq(projectFiles.filePath, "game/script.rpy"));
    const saved = await updateFileContent(
      file.id,
      userId,
      file.content.replace("Narration", "Edited narration"),
      file.contentHash
    );
    expect(saved.generatedFilesChanged).toBe(false);
    await assertRoundTrip();

    // Reimport only the literal changes, so the stripped story hash stays identical.
    const editedArchive = await archive(
      story
        .replace("Narration", "Edited narration")
        .replace("both_mode = True", "both_mode = False")
        .replace("starting_points = 120", "starting_points = 121")
    );
    expect(await importZipFile(projectId, editedArchive)).toMatchObject({
      success: true,
      filesUpdated: 1,
      filesSkipped: 0,
    });
    const files = await exportFiles();
    expect(files["game/branchforge_variables.rpy"]).toContain(
      "default both_mode = False"
    );
    expect(files["game/branchforge_stats.rpy"]).toContain(
      "default starting_points = 121"
    );
    expect(await statsService.listStats(projectId, userId)).toContainEqual(
      expect.objectContaining({
        key: "starting_points",
        minValue: 5,
        maxValue: 15,
        name: "Points",
      })
    );
  });

  it("recovers only trustworthy legacy defaults and retains fallbacks for other rows", async () => {
    const trusted = `default old_flag = True\ndefault old_stat = -3.0\n${baseStory}`;
    const ambiguous = `default ambiguous_flag = True\n${baseStory}`;
    for (const [path, raw] of [
      ["game/trusted.rpy", trusted],
      ["game/edited.rpy", ambiguous],
    ]) {
      const file = await insertRawFile(
        path,
        extractAndStripRpySymbols(raw, path).cleanedContent
      );
      await db
        .update(projectFiles)
        .set({
          originalContent: raw,
          ...(raw === ambiguous && {
            updatedAt: new Date(file.createdAt.getTime() + 1000),
          }),
        })
        .where(eq(projectFiles.id, file.id));
    }
    await db.insert(variables).values([
      { projectId, key: "old_flag" },
      { projectId, key: "ambiguous_flag" },
    ]);
    await db.insert(stats).values([
      { projectId, key: "old_stat", name: "Old", minValue: 5 },
      { projectId, key: "legacy_fallback", name: "Fallback", minValue: 7 },
    ]);
    await createVariable(userId, projectId, { key: "new_flag" });
    const first = await exportFiles();
    expect(first["game/branchforge_variables.rpy"]).toContain(
      "default old_flag = True"
    );
    expect(first["game/branchforge_variables.rpy"]).toContain(
      "default ambiguous_flag = False"
    );
    expect(first["game/branchforge_variables.rpy"]).toContain(
      "default new_flag = False"
    );
    expect(first["game/branchforge_stats.rpy"]).toContain(
      "default old_stat = -3.0"
    );
    expect(first["game/branchforge_stats.rpy"]).toContain(
      "default legacy_fallback = 7"
    );

    const flag = (await getVariablesRow("old_flag"))!;
    await db.delete(variables).where(eq(variables.id, flag.id));
    await createVariable(userId, projectId, { key: "old_flag" });
    expect((await exportFiles())["game/branchforge_variables.rpy"]).toContain(
      "default old_flag = False"
    );
  });

  it("promotes defaults authored on save, previews them, and exports them exactly once", async () => {
    await importZipFile(projectId, await archive(baseStory));
    const [file] = await db
      .select()
      .from(projectFiles)
      .where(eq(projectFiles.projectId, projectId));

    const authored = `${file.content}\ndefault baked_dialogue_visible = False\ndefault strength = 120\n`;
    const saved = await updateFileContent(
      file.id,
      userId,
      authored,
      file.contentHash
    );
    expect(saved.generatedFilesChanged).toBe(true);
    const dialogueEdit = await updateFileContent(
      file.id,
      userId,
      authored.replace('"Narration"', '"Edited narration"'),
      saved.contentHash
    );
    expect(dialogueEdit.generatedFilesChanged).toBe(false);

    const variable = await getVariablesRow("baked_dialogue_visible");
    expect(variable).toBeDefined();
    const [stat] = await db
      .select()
      .from(stats)
      .where(eq(stats.projectId, projectId));
    expect(stat.key).toBe("strength");
    expect(stat.name).toBe("strength");
    expect(stat.minValue).toBe(100);
    expect(stat.maxValue).toBe(100);

    const preview = await getExportPreview(projectId, userId);
    const variablesPreview = preview.files.find(
      (entry) => entry.kind === "variables"
    )!;
    expect(variablesPreview.isEmpty).toBe(false);
    expect(variablesPreview.content).toContain(
      "default baked_dialogue_visible = False"
    );

    const exported = await generateExport(projectId, userId);
    const download = await getExportForDownload(exported.id, projectId, userId);
    const files = JSON.parse(download.content) as Record<string, string>;
    const story = files["game/script.rpy"];
    const generated = files["game/branchforge_variables.rpy"];
    expect(story).not.toContain("default baked_dialogue_visible");
    expect(story).not.toContain("default strength =");
    const combined = story + generated;
    expect(
      combined.match(/default baked_dialogue_visible = False/g)?.length
    ).toBe(1);
    expect(generated).toContain("default baked_dialogue_visible = False");
  });

  it("catches up defaults still present in legacy current-file content without a re-save", async () => {
    const legacy = `default legacy_flag = False\ndefault legacy_stat = 42\n${baseStory}`;
    const file = await insertRawFile("game/legacy.rpy", legacy);
    const contentBefore = file.content;
    const hashBefore = file.contentHash;

    const preview = await getExportPreview(projectId, userId);
    const variablesPreview = preview.files.find(
      (entry) => entry.kind === "variables"
    )!;
    expect(variablesPreview.content).toContain("default legacy_flag = False");
    const statsPreview = preview.files.find((entry) => entry.kind === "stats")!;
    expect(statsPreview.content).toContain("# legacy_stat");

    const [variable] = await db
      .select()
      .from(variables)
      .where(eq(variables.projectId, projectId));
    expect(variable.key).toBe("legacy_flag");
    const [stat] = await db
      .select()
      .from(stats)
      .where(eq(stats.projectId, projectId));
    expect(stat.key).toBe("legacy_stat");
    expect(stat.minValue).toBe(42);
    expect(stat.maxValue).toBe(100);

    const [after] = await db
      .select()
      .from(projectFiles)
      .where(eq(projectFiles.id, file.id));
    expect(after.content).toBe(contentBefore);
    expect(after.contentHash).toBe(hashBefore);

    // Idempotent: a second run neither duplicates nor changes anything.
    const previewAgain = await getExportPreview(projectId, userId);
    const variablesAgain = previewAgain.files.find(
      (entry) => entry.kind === "variables"
    )!;
    expect(
      variablesAgain.content.match(/^default legacy_flag = False$/gm)?.length
    ).toBe(1);
  });

  it("excludes source-owned, unknown, and nested defaults and preserves existing row metadata", async () => {
    await db.insert(stats).values({
      projectId,
      key: "strength",
      name: "Custom Strength",
      minValue: 10,
    });
    const ownedSource = `default ui_panel_visible = True\n${baseStory}`;
    await insertRawFile("game/screens.rpy", ownedSource);
    await insertRawFile("../unsafe.rpy", "default unsafe_flag = False");
    const deleted = await insertRawFile(
      "game/deleted.rpy",
      "default deleted_flag = False"
    );
    await db
      .update(projectFiles)
      .set({ deletedAt: new Date() })
      .where(eq(projectFiles.id, deleted.id));
    const historical = await insertRawFile("game/historical.rpy", baseStory);
    await db
      .update(projectFiles)
      .set({
        originalContent: `default historical_flag = False\n${baseStory}`,
        remoteContent: `default remote_flag = False\n${baseStory}`,
      })
      .where(eq(projectFiles.id, historical.id));
    await insertRawFile(
      "game/mixed.rpy",
      `screen impossibility:
    default nested_flag = False

default greeting = "hello"
default strength = 55
${baseStory}`
    );

    await getExportPreview(projectId, userId);

    const variableRows = await db
      .select()
      .from(variables)
      .where(eq(variables.projectId, projectId));
    expect(variableRows).toEqual([]);

    const [strength] = await db
      .select()
      .from(stats)
      .where(eq(stats.projectId, projectId));
    expect(strength.name).toBe("Custom Strength");
    expect(strength.minValue).toBe(10);
  });

  it("writes no variable rows for a stale-save conflict", async () => {
    await importZipFile(projectId, await archive(baseStory));
    const [file] = await db
      .select()
      .from(projectFiles)
      .where(eq(projectFiles.projectId, projectId));

    const authored = `${file.content}\ndefault stale_flag = False\n`;
    await expect(
      updateFileContent(file.id, userId, authored, "stale-hash")
    ).rejects.toBeInstanceOf(ConflictError);

    const rows = await db
      .select()
      .from(variables)
      .where(eq(variables.projectId, projectId));
    expect(rows.map((row) => row.key)).toEqual([]);
  });

  it("signals changes to source-owned declarations that affect generated previews", async () => {
    await importZipFile(projectId, await archive(baseStory));
    await db.insert(variables).values({ projectId, key: "ui_panel_visible" });
    const source = `default ui_panel_visible = False\n${baseStory}`;
    const file = await insertRawFile("game/screens.rpy", source);
    const before = await getExportPreview(projectId, userId);
    expect(
      before.files.find((entry) => entry.kind === "variables")?.isEmpty
    ).toBe(true);
    const unchanged = await updateFileContent(
      file.id,
      userId,
      source + "\n# comment",
      file.contentHash
    );
    expect(unchanged.generatedFilesChanged).toBe(false);
    const removed = await updateFileContent(
      file.id,
      userId,
      baseStory,
      unchanged.contentHash
    );
    expect(removed.generatedFilesChanged).toBe(true);
    const after = await getExportPreview(projectId, userId);
    expect(
      after.files.find((entry) => entry.kind === "variables")?.content
    ).toContain("default ui_panel_visible = False");
  });
});
