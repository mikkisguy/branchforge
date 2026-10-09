import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  users,
  projects,
  projectFiles,
  projectSettings,
  characters,
  labels,
  labelLines,
} from "../../db/schema/index.js";
import { testEmail, testUuid } from "../../utils/test-ids.js";
import {
  importCharactersSchema,
  projectSettingsSchema,
} from "../../lib/validation/characters.js";
import { importZipFile } from "../zip-import.service.js";
import { updateFileContent } from "../projects.service.js";
import { charactersService } from "../characters.service.js";
import { characterLinkerService } from "../character-linker.service.js";
import {
  generateExport,
  getExportForDownload,
  getExportPreview,
} from "../export.service.js";

const userId = testUuid("09000000", 72);
const projectId = testUuid("19000000", 72);
const narrator = `define narrator = Character(
    None,
    what_color="#cfcfcf",
    what_italic=True
)`;
const original = `${narrator}
define e = Character("Eileen", who_color="#abcdef", what_color="#123456", what_italic=False, what_font="font.ttf")
label start:
    "Narration"
    e "Hello"
    return`;

async function archive(content: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("game/script.rpy", content);
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("character source round trips", () => {
  const db = getDb();
  beforeEach(async () => {
    await db.delete(projects).where(eq(projects.id, projectId));
    await db.delete(users).where(eq(users.id, userId));
    await db.insert(users).values({
      id: userId,
      email: testEmail("character-roundtrip", "author"),
      passwordHash: "test",
    });
    await db
      .insert(projects)
      .values({ id: projectId, userId, name: "Roundtrip", source: "ZIP" });
  });
  afterEach(async () => {
    await db.delete(projects).where(eq(projects.id, projectId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("imports, links, previews, and exports n and u as ordinary characters", async () => {
    const declarations = [
      'define u = Character("???", color="#E4E4E4")',
      'define n = Character("N", color="#123456", what_italic=True)',
    ];
    const source = `${declarations.join("\n")}
label start:
    u "Who are you?"
    n "I am N."
    return`;
    const imported = await importZipFile(projectId, await archive(source));
    expect(imported.success).toBe(true);
    const rows = await db
      .select()
      .from(characters)
      .where(eq(characters.projectId, projectId));
    expect(rows.map((row) => row.renpyTag).sort()).toEqual(["n", "u"]);
    const scenes = await db
      .select()
      .from(labels)
      .where(eq(labels.projectId, projectId));
    const labelIds = scenes.map((scene) => scene.id);
    await db
      .update(labelLines)
      .set({ speakerId: null })
      .where(inArray(labelLines.labelId, labelIds));
    const linked = await characterLinkerService.linkSpeakersToLines(
      projectId,
      labelIds
    );
    expect(linked.linked).toBe(2);
    const lines = await db
      .select()
      .from(labelLines)
      .where(inArray(labelLines.labelId, labelIds))
      .orderBy(labelLines.sequence);
    expect(lines.map((line) => line.speakerId)).toEqual([
      rows.find((row) => row.renpyTag === "u")!.id,
      rows.find((row) => row.renpyTag === "n")!.id,
    ]);
    const preview = await getExportPreview(projectId, userId);
    const definitions = preview.files.find(
      (file) => file.kind === "definitions"
    )!.content;
    for (const declaration of declarations) {
      expect(definitions).toContain(declaration);
    }
    const exported = await generateExport(projectId, userId);
    const download = await getExportForDownload(exported.id, projectId, userId);
    const files = JSON.parse(download.content) as Record<string, string>;
    expect(files["game/branchforge_definitions.rpy"]).toBe(definitions);
    const combined = Object.values(files).join("\n");
    for (const tag of ["u", "n"]) {
      expect(
        combined.match(new RegExp(`^define ${tag} = Character`, "gm"))
      ).toHaveLength(1);
    }
  });

  it("preserves narrator source and managed styling through real ZIP import, edits, preview, and export", async () => {
    await importZipFile(projectId, await archive(original));
    const rows = await db
      .select()
      .from(characters)
      .where(eq(characters.projectId, projectId));
    expect(rows.map((row) => row.renpyTag)).toEqual(["e"]);
    expect(rows[0].sourceDefinition?.declaration).toContain(
      'what_font="font.ttf"'
    );
    await charactersService.updateCharacter(rows[0].id, userId, {
      name: "Hero",
      color: "#112233",
    });
    const preview = await getExportPreview(projectId, userId);
    const definitions = preview.files.find(
      (file) => file.kind === "definitions"
    )?.content;
    expect(definitions).toContain(
      'Character("Hero", who_color="#112233", what_color="#123456", what_italic=False, what_font="font.ttf")'
    );
    expect(definitions).not.toContain("define narrator");
    const exported = await generateExport(projectId, userId);
    const download = await getExportForDownload(exported.id, projectId, userId);
    const files = JSON.parse(download.content) as Record<string, string>;
    const story = files["game/script.rpy"];
    expect(story).toContain(narrator);
    const generated = files["game/branchforge_definitions.rpy"];
    expect(generated).toBe(definitions);
    expect((story + generated).match(/define narrator\s*=/g)).toHaveLength(1);
    expect((story + generated).match(/define e\s*=/g)).toHaveLength(1);
  });

  it("reviews a styling-only ZIP change and applies options only after acceptance", async () => {
    await importZipFile(projectId, await archive(original));
    const changed = original.replace(
      'what_font="font.ttf"',
      'what_font="other.ttf"'
    );
    await importZipFile(projectId, await archive(changed));
    const review = await charactersService.detectCharacters(projectId, userId);
    expect(
      review.conflicts.find((conflict) => conflict.tag === "e")?.changedFields
    ).toContain("definition");
    expect(
      (await getExportPreview(projectId, userId)).files.find(
        (file) => file.kind === "definitions"
      )?.content
    ).toContain('what_font="font.ttf"');
    const detected = review.characters.find(
      (character) => character.tag === "e"
    )!;
    await charactersService.importCharacters(projectId, userId, {
      characters: [
        {
          tag: detected.tag,
          name: detected.name,
          nameType: detected.nameType,
          displayName: "Eileen",
          color: detected.color,
        },
      ],
      excludedTags: review.excludedTags,
      narratorTags: [],
      linkToLines: false,
    });
    expect(
      (await getExportPreview(projectId, userId)).files.find(
        (file) => file.kind === "definitions"
      )?.content
    ).toContain('what_font="other.ttf"');
    const [file] = await db
      .select()
      .from(projectFiles)
      .where(eq(projectFiles.projectId, projectId));
    expect(file.originalContent).toBe(original);
  });
  it("preserves ownership settings omitted from an import API payload", async () => {
    await importZipFile(projectId, await archive(original));
    const [before] = await db
      .select()
      .from(projectSettings)
      .where(eq(projectSettings.projectId, projectId));
    const input = importCharactersSchema.parse({
      characters: [
        {
          tag: "e",
          name: "Eileen",
          displayName: "Eileen",
          color: "#abcdef",
          nameType: "literal",
        },
      ],
      linkToLines: false,
    });
    await charactersService.importCharacters(projectId, userId, input);
    const [after] = await db
      .select()
      .from(projectSettings)
      .where(eq(projectSettings.projectId, projectId));
    expect(after.excludedCharacterTags).toEqual(before.excludedCharacterTags);
    expect(after.narratorCharacterTags).toEqual(before.narratorCharacterTags);
    await charactersService.updateCharacterSettings(
      projectId,
      userId,
      projectSettingsSchema.parse({ autoLinkSpeakers: false })
    );
    const [patched] = await db
      .select()
      .from(projectSettings)
      .where(eq(projectSettings.projectId, projectId));
    expect(patched.excludedCharacterTags).toEqual(before.excludedCharacterTags);
    expect(patched.narratorCharacterTags).toEqual(before.narratorCharacterTags);
    expect(patched.autoLinkSpeakers).toBe(false);
    const [file] = await db
      .select()
      .from(projectFiles)
      .where(eq(projectFiles.projectId, projectId));
    expect(file.content).toContain(narrator);
  });

  it("applies explicit Script Mode declaration edits immediately", async () => {
    await importZipFile(projectId, await archive(original));
    const [file] = await db
      .select()
      .from(projectFiles)
      .where(eq(projectFiles.projectId, projectId));
    const source =
      'define e = Character("Script name", who_color="#fedcba", what_italic=False, what_font="script.ttf")\n' +
      file.content;
    await updateFileContent(file.id, userId, source, file.contentHash);
    const [character] = await db
      .select()
      .from(characters)
      .where(eq(characters.projectId, projectId));
    expect(character.name).toBe("Script name");
    await charactersService.updateCharacter(character.id, userId, {
      name: "UI edit",
    });
    const [saved] = await db
      .select()
      .from(projectFiles)
      .where(eq(projectFiles.id, file.id));
    await updateFileContent(
      file.id,
      userId,
      saved.content + "\n# unrelated edit",
      saved.contentHash
    );
    const [after] = await db
      .select()
      .from(characters)
      .where(eq(characters.id, character.id));
    expect(after.name).toBe("UI edit");
    expect(character.sourceDefinition?.declaration).toContain(
      'what_font="script.ttf"'
    );
    expect(
      (await getExportPreview(projectId, userId)).files.find(
        (entry) => entry.kind === "definitions"
      )?.content
    ).toContain('what_font="script.ttf"');
  });

  it("does not resurrect a deleted excluded narrator after unrelated settings changes", async () => {
    await importZipFile(projectId, await archive(original));
    await charactersService.importCharacters(projectId, userId, {
      characters: [
        {
          tag: "narrator",
          name: null,
          nameType: "none",
          displayName: "Narrator",
          color: "#cfcfcf",
        },
      ],
      excludedTags: [],
      narratorTags: ["narrator"],
      linkToLines: false,
    });
    await charactersService.updateCharacterSettings(projectId, userId, {
      excludedCharacterTags: ["narrator"],
    });
    const [file] = await db
      .select()
      .from(projectFiles)
      .where(eq(projectFiles.projectId, projectId));
    const removed = file.content.replace(narrator, "");
    await updateFileContent(file.id, userId, removed, file.contentHash);
    await charactersService.updateCharacterSettings(projectId, userId, {
      excludedCharacterTags: ["narrator", "other"],
    });
    const preview = await getExportPreview(projectId, userId);
    expect(
      preview.files.map((entry) => entry.content).join("\n")
    ).not.toContain("define narrator");
  });
});
