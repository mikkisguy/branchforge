import { describe, expect, it } from "vitest";
import {
  recoverLegacyCharacterSource,
  updateCharacterDefinitionSnapshot,
  characterDefinitionSnapshot,
  stripManagedCharacterDeclarations,
} from "../character-source-preservation.service.js";
import { extractLegacyRpySymbols } from "../rpy-statements.service.js";
import { calculateContentHash } from "../../lib/hash.js";

const original = `define narrator = Character(None, what_color="#cfcfcf", what_italic=True)
define e = Character("E", color="#abcdef", what_font="font.ttf")
label start:
    "Narration"
    return`;
const content = extractLegacyRpySymbols(original).cleanedContent;
const file = {
  filePath: "game/script.rpy",
  content,
  contentHash: calculateContentHash(content),
  originalContent: original,
  lastPushedContentHash: null,
};

describe("legacy character recovery evidence", () => {
  it("recovers excluded source and managed styling from an untouched legacy import", () => {
    const recovery = recoverLegacyCharacterSource(file, new Set(["narrator"]));
    expect(recovery?.content).toContain(
      'define narrator = Character(None, what_color="#cfcfcf", what_italic=True)'
    );
    expect(recovery?.content).not.toContain("define e =");
    expect(recovery?.definitions.e.declaration).toContain(
      'what_font="font.ttf"'
    );
  });

  it("does not guess when content or its local baseline has changed", () => {
    expect(
      recoverLegacyCharacterSource(
        { ...file, content: content + "\n# edit" },
        new Set(["narrator"])
      )
    ).toBeNull();
    expect(
      recoverLegacyCharacterSource(
        { ...file, lastPushedContentHash: "different" },
        new Set(["narrator"])
      )
    ).toBeNull();
  });

  it("does not resurrect historical declarations removed in an accepted remote snapshot", () => {
    const recovery = recoverLegacyCharacterSource(
      {
        ...file,
        remoteContent: content,
      },
      new Set(["narrator"])
    );
    expect(recovery?.definitions).toEqual({});
    expect(recovery?.content).toBe(content);
    expect(
      recoverLegacyCharacterSource(
        {
          ...file,
          remoteContent: original,
          hasRemoteConflict: true,
        },
        new Set(["narrator"])
      )
    ).toBeNull();
  });

  it("removes deleted visible declarations but retains stripped managed snapshots", () => {
    const snapshot = characterDefinitionSnapshot(original);
    const before = original.split("\n")[0] + "\nlabel start:\n    return";
    const updated = updateCharacterDefinitionSnapshot(
      before,
      "label start:\n    return",
      snapshot
    );
    expect(updated.narrator).toBeUndefined();
    expect(updated.e).toEqual(snapshot.e);
  });
});

describe("stripManagedCharacterDeclarations", () => {
  it("strips manageable character declarations and preserves dialogue", () => {
    const source = `define e = Character("E", color="#abcdef", what_font="font.ttf")
label start:
    e "Hello"
    return`;
    const stripped = stripManagedCharacterDeclarations(
      source,
      "game/script.rpy",
      new Set(["narrator"])
    );
    expect(stripped).not.toContain("define e =");
    expect(stripped).toContain('e "Hello"');
    expect(stripped).toContain("label start:");
  });

  it("preserves excluded tags in source", () => {
    const source = `define narrator = Character(None, what_color="#cfcfcf")
define e = Character("E", color="#abcdef")
label start:`;
    const stripped = stripManagedCharacterDeclarations(
      source,
      "game/script.rpy",
      new Set(["narrator"])
    );
    expect(stripped).toContain("define narrator =");
    expect(stripped).not.toContain("define e =");
  });

  it("leaves source-owned files untouched", () => {
    const source = `define e = Character("E", color="#abcdef")
label start:`;
    for (const filePath of ["screens.rpy", "options.rpy", "gui.rpy"]) {
      expect(
        stripManagedCharacterDeclarations(source, filePath, new Set())
      ).toBe(source);
    }
  });

  it("preserves defaults and unsupported declarations", () => {
    const source = `default affinity = 0
define e = Character("E", color="#abcdef")
define unsafe = Character(boss_name + "x", color="#abcdef")
label start:`;
    const stripped = stripManagedCharacterDeclarations(
      source,
      "game/script.rpy",
      new Set()
    );
    expect(stripped).toContain("default affinity = 0");
    expect(stripped).not.toContain('define e = Character("E"');
    expect(stripped).toContain('define unsafe = Character(boss_name + "x"');
  });

  it("leaves ambiguous duplicate tags source-owned", () => {
    const source = `define e = Character("First", color="#abcdef")
define e = Character("Second", color="#123456")
label start:`;
    const stripped = stripManagedCharacterDeclarations(
      source,
      "game/script.rpy",
      new Set()
    );
    expect(stripped).toContain('define e = Character("First"');
    expect(stripped).toContain('define e = Character("Second"');
  });
});
