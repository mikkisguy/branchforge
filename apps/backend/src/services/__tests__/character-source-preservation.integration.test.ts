import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  users,
  projects,
  projectFiles,
  projectSettings,
  characters,
} from "../../db/schema/index.js";
import { testEmail, testUuid } from "../../utils/test-ids.js";
import { getPendingStructuralSummary } from "../project-files-operations.service.js";
import { getProjectFiles } from "../projects.service.js";
import { calculateContentHash } from "../../lib/hash.js";
import {
  ensureCharacterSourcePreservation,
  reconcileCharacterOwnership,
} from "../character-source-preservation.service.js";
import {
  extractLegacyRpySymbols,
  collectSourceOwnedRpySymbolKeys,
} from "../rpy-statements.service.js";
import { generateCharacterDefinitionsFile } from "../rpy-generator.service.js";
import { importZipFile } from "../zip-import.service.js";

const userId = testUuid("09000000", 71);
const projectId = testUuid("19000000", 71);
const original = `define narrator = Character(None, what_color="#cfcfcf", what_italic=True)
define e = Character("E", color="#abcdef", what_italic=False, what_font="font.ttf")
label start:
    "Narration"
    return`;

describe("character preservation maintenance", () => {
  const db = getDb();
  beforeEach(async () => {
    await db.delete(projects).where(eq(projects.id, projectId));
    await db.delete(users).where(eq(users.id, userId));
    await db.insert(users).values({
      id: userId,
      email: testEmail("character-preservation", "author"),
      passwordHash: "test",
    });
    await db
      .insert(projects)
      .values({ id: projectId, userId, name: "Preservation", source: "ZIP" });
    await db
      .insert(projectSettings)
      .values({ projectId, excludedCharacterTags: ["narrator"] });
    const content = extractLegacyRpySymbols(original).cleanedContent;
    await db.insert(projectFiles).values({
      projectId,
      source: "ZIP",
      filePath: "game/script.rpy",
      fileType: "STORY",
      content,
      contentHash: calculateContentHash(content),
      originalContent: original,
    });
    await db.insert(characters).values({
      projectId,
      renpyTag: "e",
      name: "Locally edited",
      displayName: "E",
      color: "#112233",
    });
  });
  afterEach(async () => {
    await db.delete(projects).where(eq(projects.id, projectId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("recovers once, preserves managed edits, and never resurrects a later deletion", async () => {
    await getProjectFiles(projectId, userId);
    const [file] = await db
      .select()
      .from(projectFiles)
      .where(eq(projectFiles.projectId, projectId));
    expect(file.content).toContain("define narrator = Character(None");
    const [character] = await db
      .select()
      .from(characters)
      .where(eq(characters.projectId, projectId));
    expect(character.name).toBe("Locally edited");
    expect(character.color).toBe("#112233");
    expect(
      generateCharacterDefinitionsFile([{ ...character, nameType: "literal" }])
    ).toContain(
      'Character("Locally edited", color="#112233", what_italic=False, what_font="font.ttf")'
    );
    const removed = "label start:\n    return";
    await db
      .update(projectFiles)
      .set({ content: removed, contentHash: calculateContentHash(removed) })
      .where(eq(projectFiles.id, file.id));
    await ensureCharacterSourcePreservation(projectId);
    const [after] = await db
      .select()
      .from(projectFiles)
      .where(eq(projectFiles.id, file.id));
    expect(after.content).toBe(removed);
  });

  it("retains excluded declaration edits when returning to managed ownership without changing unrelated defaults", async () => {
    await ensureCharacterSourcePreservation(projectId);
    await db.transaction(async (tx) => {
      await reconcileCharacterOwnership(
        tx,
        projectId,
        new Set(["narrator", "e"]),
        new Set(["narrator"])
      );
    });
    const [file] = await db
      .select()
      .from(projectFiles)
      .where(eq(projectFiles.projectId, projectId));
    expect(file.content).toContain(
      'Character("Locally edited", color="#112233", what_italic=False, what_font="font.ttf")'
    );
    expect(
      collectSourceOwnedRpySymbolKeys([file], new Set(["narrator", "e"])).has(
        "e"
      )
    ).toBe(true);
    const editedContent =
      file.content.replace(
        'Character("Locally edited", color="#112233", what_italic=False, what_font="font.ttf")',
        'Character(hero_name, color="#445566", what_italic=False, what_font="edited.ttf")'
      ) + "\ndefault future_flag = True";
    await db
      .update(projectFiles)
      .set({
        content: editedContent,
        contentHash: calculateContentHash(editedContent),
      })
      .where(eq(projectFiles.id, file.id));
    await db.transaction(async (tx) => {
      await reconcileCharacterOwnership(
        tx,
        projectId,
        new Set(["narrator"]),
        new Set(["narrator", "e"])
      );
    });
    const [after] = await db
      .select()
      .from(projectFiles)
      .where(eq(projectFiles.id, file.id));
    expect(after.content).not.toContain("define e =");
    expect(after.content).toContain("default future_flag = True");
    const [character] = await db
      .select()
      .from(characters)
      .where(eq(characters.projectId, projectId));
    expect(character.name).toBe("hero_name");
    expect(character.color).toBe("#445566");
    expect(character.nameType).toBe("variable");
    expect(character.sourceDefinition?.declaration).toContain(
      'what_font="edited.ttf"'
    );
    expect(
      generateCharacterDefinitionsFile([{ ...character, nameType: "variable" }])
    ).toContain(
      'Character(hero_name, color="#445566", what_italic=False, what_font="edited.ttf")'
    );
  });

  it("skips an unchanged one-file ZIP re-import when declaration snapshots match semantically", async () => {
    await db.delete(projectFiles).where(eq(projectFiles.projectId, projectId));
    await db.delete(characters).where(eq(characters.projectId, projectId));
    const zip = new JSZip();
    zip.file("game/only.rpy", original);
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    const first = await importZipFile(projectId, buffer);
    expect(first.success).toBe(true);
    if (!first.success) return;
    expect(first.filesImported + first.filesUpdated).toBeGreaterThan(0);
    const second = await importZipFile(projectId, buffer);
    expect(second.success).toBe(true);
    if (!second.success) return;
    expect(second.filesSkipped).toBe(1);
  });

  it("uses custom source ownership in legacy pending-change summaries", async () => {
    const raw =
      "define thought = Character(None, what_italic=False)\nlabel start:\n    return";
    const content = extractLegacyRpySymbols(raw).cleanedContent;
    await db
      .update(projectSettings)
      .set({ excludedCharacterTags: ["thought"] })
      .where(eq(projectSettings.projectId, projectId));
    await db
      .update(projectFiles)
      .set({
        source: "GITLAB",
        content,
        contentHash: calculateContentHash(content),
        originalContent: raw,
      })
      .where(eq(projectFiles.projectId, projectId));
    await ensureCharacterSourcePreservation(projectId);
    expect(
      (await getPendingStructuralSummary(projectId, userId))
        .contentModifiedCount
    ).toBe(0);
  });

  it("recovers legacy nameless managed characters without turning None into a literal name", async () => {
    const raw = "define thought = Character(None, what_italic=False)";
    const content = extractLegacyRpySymbols(raw).cleanedContent;
    await db
      .update(projectFiles)
      .set({
        content,
        contentHash: calculateContentHash(content),
        originalContent: raw,
      })
      .where(eq(projectFiles.projectId, projectId));
    await db
      .update(characters)
      .set({
        renpyTag: "thought",
        name: "thought",
        nameType: "literal",
        color: "#cfcfcf",
      })
      .where(eq(characters.projectId, projectId));
    await ensureCharacterSourcePreservation(projectId);
    const [character] = await db
      .select()
      .from(characters)
      .where(eq(characters.projectId, projectId));
    expect(character.nameType).toBe("none");
    expect(
      generateCharacterDefinitionsFile([{ ...character, nameType: "none" }])
    ).toContain(raw);
  });

  it("normalizes unchanged legacy name/color mistakes without rewriting styling", async () => {
    const raw = String.raw`define e = Character("A \"quote\"", what_color="#ff0000")`;
    const legacy = extractLegacyRpySymbols(raw);
    await db
      .update(projectFiles)
      .set({
        content: legacy.cleanedContent,
        contentHash: calculateContentHash(legacy.cleanedContent),
        originalContent: raw,
      })
      .where(eq(projectFiles.projectId, projectId));
    await db
      .update(characters)
      .set({
        name: legacy.characters[0].name!,
        color: legacy.characters[0].color,
      })
      .where(eq(characters.projectId, projectId));
    await ensureCharacterSourcePreservation(projectId);
    const [character] = await db
      .select()
      .from(characters)
      .where(eq(characters.projectId, projectId));
    expect(character.name).toBe('A "quote"');
    expect(character.color).toBe("#cfcfcf");
    expect(
      generateCharacterDefinitionsFile([{ ...character, nameType: "literal" }])
    ).toContain(raw);
  });
});
