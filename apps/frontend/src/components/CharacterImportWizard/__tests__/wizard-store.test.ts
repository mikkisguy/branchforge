/**
 * Wizard store grouping — exclusion policy regression
 *
 * The automatic exclusions are exactly `narrator` and `extend`.
 * `n` and `u` are ordinary tags, so a detected `u` / `???` character
 * must land in the "new" group, included by default, instead of being
 * silently auto-excluded as a "special" character.
 */

import { describe, it, expect } from "vitest";
import {
  createInitialWizardState,
  type CharacterGroup,
} from "@/components/CharacterImportWizard/wizard-store";
import type { DetectedCharacter } from "@branchforge/shared";

function makeDetected(
  overrides: Partial<DetectedCharacter> & { tag: string }
): DetectedCharacter {
  return {
    name: "Name",
    displayName: overrides.tag,
    nameType: "literal",
    color: "#c8ffc8",
    isSpecial: false,
    sourceFile: "game/script.rpy",
    confidence: 1,
    ...overrides,
  };
}

describe("wizard-store grouping policy", () => {
  it("groups default-policy n and u characters as new and included", () => {
    const state = createInitialWizardState(
      [
        makeDetected({
          tag: "u",
          name: "???",
          displayName: "???",
          nameType: "unknown",
        }),
        makeDetected({
          tag: "n",
          name: null,
          displayName: "",
          nameType: "none",
        }),
      ],
      [],
      ["narrator", "extend"],
      [],
      []
    );

    const newTags = state.groups.new.map((char) => char.tag);
    expect(newTags).toContain("u");
    expect(newTags).toContain("n");
    expect(state.groups.new.every((char) => !char.excluded)).toBe(true);
    expect(state.groups.special).toHaveLength(0);
  });

  it("still groups narrator and extend as special and excluded by default", () => {
    const state = createInitialWizardState(
      [
        makeDetected({
          tag: "narrator",
          name: null,
          displayName: "",
          nameType: "none",
          isSpecial: true,
        }),
        makeDetected({
          tag: "extend",
          name: null,
          displayName: "",
          nameType: "none",
        }),
      ],
      [],
      ["narrator", "extend"],
      [],
      []
    );

    expect(state.groups.special.map((char) => char.tag)).toEqual([
      "narrator",
      "extend",
    ]);
    expect(state.groups.special.every((char) => char.excluded)).toBe(true);
  });

  it("respects explicit exclusions from the detection response", () => {
    const state = createInitialWizardState(
      [makeDetected({ tag: "u", name: "???", nameType: "unknown" })],
      [],
      ["narrator", "u"],
      [],
      []
    );

    const all: CharacterGroup["new"] = [
      ...state.groups.new,
      ...state.groups.special,
    ];
    expect(all.map((char) => char.tag)).toContain("u");
    const u = all.find((char) => char.tag === "u");
    expect(u?.excluded).toBe(true);
  });
});
