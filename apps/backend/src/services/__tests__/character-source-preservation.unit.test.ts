import { describe, expect, it } from "vitest";
import {
  recoverLegacyCharacterSource,
  updateCharacterDefinitionSnapshot,
  characterDefinitionSnapshot,
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
