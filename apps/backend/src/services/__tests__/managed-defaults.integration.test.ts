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

const userId = testUuid("09000000", 80);
const projectId = testUuid("19000000", 80);

const baseStory = `label start:
    "Narration"
    return`;

async function archive(content: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("game/script.rpy", content);
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
