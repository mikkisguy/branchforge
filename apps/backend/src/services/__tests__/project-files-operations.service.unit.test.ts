/**
 * Project File Operations Service unit tests
 *
 * Covers the pure safety/collapse helpers: exact generated-file protection,
 * STORY/SETTINGS classification stability, and the occurrence-based delete
 * impact builder (jump/call/menu-choice, case-insensitive, occurrences
 * counted — not unique source labels).
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(() => ({})),
}));

import {
  PROTECTED_GENERATED_BASENAMES,
  assertGeneratedProtection,
  assertClassificationStable,
  buildOccurrences,
} from "../project-files-operations.service.js";
import { ValidationError } from "../../middleware/error-handler.middleware.js";

describe("generated file protection", () => {
  it("protects exactly the three generated basenames", () => {
    expect(PROTECTED_GENERATED_BASENAMES).toEqual(
      new Set([
        "branchforge_variables.rpy",
        "branchforge_stats.rpy",
        "branchforge_definitions.rpy",
      ])
    );
  });

  it("rejects renaming FROM or TO an exact generated basename", () => {
    for (const generated of [
      "game/branchforge_variables.rpy",
      "game/branchforge_stats.rpy",
      "game/branchforge_definitions.rpy",
      "game/BRANCHFORGE_STATS.rpy",
    ]) {
      expect(() =>
        assertGeneratedProtection(generated, "game/other.rpy")
      ).toThrow(ValidationError);
      expect(() =>
        assertGeneratedProtection("game/other.rpy", generated)
      ).toThrow(ValidationError);
    }
  });

  it("does not protect arbitrary branchforge_*.rpy files", () => {
    expect(() =>
      assertGeneratedProtection(
        "game/branchforge_custom.rpy",
        "game/renamed.rpy"
      )
    ).not.toThrow();
  });
});

describe("classification stability guard", () => {
  const labeledStory = 'label start:\n    "Hello"';

  it("blocks a STORY file with labels whose new path reclassifies as SETTINGS", () => {
    // screens.rpy is always parsed as SETTINGS
    expect(() =>
      assertClassificationStable(
        "game/story.rpy",
        "screens.rpy",
        labeledStory,
        "STORY",
        true
      )
    ).toThrow(ValidationError);
  });

  it("allows the same path shape when the file has no labels", () => {
    expect(() =>
      assertClassificationStable(
        "game/empty.rpy",
        "screens.rpy",
        "",
        "STORY",
        false
      )
    ).not.toThrow();
  });

  it("allows classification-stable renames", () => {
    expect(() =>
      assertClassificationStable(
        "game/story.rpy",
        "game/story2.rpy",
        labeledStory,
        "STORY",
        true
      )
    ).not.toThrow();
  });

  it("does not constrain SETTINGS files", () => {
    expect(() =>
      assertClassificationStable(
        "gui/style.rpy",
        "gui/style2.rpy",
        "",
        "SETTINGS",
        false
      )
    ).not.toThrow();
  });
});

describe("delete impact occurrence builder", () => {
  const targetLabels = [
    { id: "target-1", labelName: "Target_Label", title: "Target" },
  ];

  const sourceLabel = {
    id: "src-1",
    labelName: "jumper",
    title: "Jumper",
    projectFileId: "source-file-1",
    filePath: "game/source.rpy",
  };

  function line(overrides: Partial<Parameters<typeof buildOccurrences>[2][0]>) {
    return {
      labelId: "src-1",
      content: "",
      contentType: "NARRATION",
      menuOptions: null,
      rpyLineNumber: null,
      linePosition: null,
      ...overrides,
    };
  }

  it("counts every occurrence, not unique source labels", () => {
    const occurrences = buildOccurrences(
      targetLabels,
      [sourceLabel],
      [
        line({ content: "jump target_label", contentType: "JUMP" }),
        line({ content: "jump TARGET_LABEL", contentType: "JUMP" }),
        line({ content: "call target_label", contentType: "NARRATION" }),
      ]
    );
    expect(occurrences).toHaveLength(3);
  });

  it("matches jump/call target names case-insensitively", () => {
    const occurrences = buildOccurrences(
      targetLabels,
      [sourceLabel],
      [
        line({ content: "jump TARGET_LABEL" }),
        line({ content: "call Target_Label" }),
      ]
    );
    expect(occurrences.map((o) => o.referenceType).sort()).toEqual([
      "CALL",
      "JUMP",
    ]);
  });

  it("uses structured menuOptions for menu choices and skips raw jump text on choice lines", () => {
    const occurrences = buildOccurrences(
      targetLabels,
      [sourceLabel],
      [
        line({
          content: "menu with jump target_label inside",
          contentType: "MENU",
          menuOptions: [
            {
              label: "Choice",
              targetLabelId: "target-1",
              targetLabelName: "target_label",
            },
          ],
        }),
      ]
    );
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]?.referenceType).toBe("MENU_CHOICE");
    expect(occurrences[0]?.sourceLabelId).toBe("src-1");
    expect(occurrences[0]?.targetLabelId).toBe("target-1");
  });

  it("does not fabricate menu occurrences without structured menuOptions", () => {
    const occurrences = buildOccurrences(
      targetLabels,
      [sourceLabel],
      [line({ content: "menu choice -> target_label", contentType: "MENU" })]
    );
    expect(occurrences).toHaveLength(0);
  });

  it("includes source label/file context and line numbers when available", () => {
    const occurrences = buildOccurrences(
      targetLabels,
      [sourceLabel],
      [
        line({ content: "jump target_label", rpyLineNumber: 7 }),
        line({
          content: "jump target_label",
          rpyLineNumber: null,
          linePosition: 3,
        }),
      ]
    );
    expect(occurrences[0]?.sourceLabelId).toBe("src-1");
    expect(occurrences[0]?.sourceLabelTitle).toBe("Jumper");
    expect(occurrences[0]?.sourceFileId).toBe("source-file-1");
    expect(occurrences[0]?.sourceFilePath).toBe("game/source.rpy");
    expect(occurrences[0]?.sourceLineNumber).toBe(7);
    expect(occurrences[1]?.sourceLineNumber).toBe(3);
  });
});
