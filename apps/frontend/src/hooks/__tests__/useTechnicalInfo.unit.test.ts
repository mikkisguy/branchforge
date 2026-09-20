/**
 * Tests for the useTechnicalInfo hook — attachment direction of technical
 * badges in write mode.
 *
 * VISUAL rows (scene/show/hide) precede the dialogue/narration they affect,
 * so they must attach backward to the following prose line. JUMP/MENU/CHOICE
 * rows follow the prose they belong to, so they remain forward-attached to
 * the preceding prose line.
 */

import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import type {
  LabelDetail,
  LabelLine,
  VisualStatement,
} from "@branchforge/shared";
import { useTechnicalInfo } from "../useTechnicalInfo";

let nextId = 0;

function makeLine(
  overrides: Partial<LabelLine> & Pick<LabelLine, "contentType">
): LabelLine {
  nextId += 1;
  return {
    id: `line-${nextId}`,
    labelId: "label-1",
    sequence: nextId,
    content: "",
    visualType: "GENERATED",
    visualPrompt: null,
    speakerId: null,
    speakerName: null,
    speakerTag: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    conditions: null,
    visualStatements: null,
    ...overrides,
  };
}

function visual(
  type: VisualStatement["type"],
  target: string
): VisualStatement {
  return { type, target };
}

function makeLabel(lines: LabelLine[]): LabelDetail {
  return {
    id: "label-1",
    projectId: "project-1",
    title: "Test Label",
    labelName: "test_label",
    groupType: null,
    groupValue: null,
    labelNumber: 1,
    sequenceOrder: 1,
    routeKey: null,
    status: null,
    visibility: null,
    projectFileId: "file-1",
    fileName: "test.rpy",
    conditions: null,
    characters: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lines,
  };
}

describe("useTechnicalInfo visual attachment", () => {
  it("attaches VISUAL rows to the following prose line, not the preceding one", () => {
    const lines = [
      makeLine({ contentType: "DIALOGUE", content: "first" }),
      makeLine({
        contentType: "VISUAL",
        visualStatements: [visual("SCENE", "forest")],
      }),
      makeLine({
        contentType: "DIALOGUE",
        content: "second",
        speakerName: "Hero",
      }),
      makeLine({
        contentType: "VISUAL",
        visualStatements: [visual("SHOW", "hero")],
      }),
      makeLine({ contentType: "NARRATION", content: "third" }),
    ];
    const label = makeLabel(lines);
    const { result } = renderHook(() => useTechnicalInfo(label));
    const get = result.current.getTechnicalInfoForLine;

    // scene belongs to the second dialogue line
    expect(get(lines[0].id)?.visuals).toBeUndefined();
    expect(get(lines[2].id)?.visuals).toEqual([visual("SCENE", "forest")]);

    // show belongs to the narration line
    expect(get(lines[4].id)?.visuals).toEqual([visual("SHOW", "hero")]);
  });

  it("does not leak the following visual to the preceding prose line", () => {
    const lines = [
      makeLine({ contentType: "DIALOGUE", content: "first" }),
      makeLine({
        contentType: "VISUAL",
        visualStatements: [visual("SCENE", "forest")],
      }),
      makeLine({ contentType: "DIALOGUE", content: "second" }),
      makeLine({
        contentType: "VISUAL",
        visualStatements: [visual("SHOW", "hero")],
      }),
      makeLine({ contentType: "NARRATION", content: "third" }),
    ];
    const label = makeLabel(lines);
    const { result } = renderHook(() => useTechnicalInfo(label));
    const get = result.current.getTechnicalInfoForLine;

    const first = get(lines[0].id);
    expect(first?.visuals).toBeUndefined();

    const second = get(lines[2].id);
    expect(second?.visuals).toEqual([visual("SCENE", "forest")]);
    expect(second?.visuals).not.toContainEqual(visual("SHOW", "hero"));
  });

  it("keeps inline visualStatements on the prose line itself", () => {
    const lines = [
      makeLine({
        contentType: "DIALOGUE",
        content: "first",
        visualStatements: [visual("SCENE", "inline-scene")],
      }),
      makeLine({ contentType: "NARRATION", content: "second" }),
    ];
    const label = makeLabel(lines);
    const { result } = renderHook(() => useTechnicalInfo(label));
    const get = result.current.getTechnicalInfoForLine;

    expect(get(lines[0].id)?.visuals).toEqual([
      visual("SCENE", "inline-scene"),
    ]);
  });

  it("keeps jump targets forward-attached to the preceding prose line", () => {
    const lines = [
      makeLine({ contentType: "DIALOGUE", content: "first" }),
      makeLine({ contentType: "JUMP", content: "jump next_label" }),
      makeLine({ contentType: "DIALOGUE", content: "second" }),
    ];
    const label = makeLabel(lines);
    const { result } = renderHook(() => useTechnicalInfo(label));
    const get = result.current.getTechnicalInfoForLine;

    expect(get(lines[0].id)?.jumpTarget).toEqual({
      labelName: "next_label",
      labelId: "",
    });
    expect(get(lines[2].id)?.jumpTarget).toBeUndefined();
  });

  it("keeps a following MENU row's technical metadata forward-attached to the preceding prose line", () => {
    const lines = [
      makeLine({ contentType: "DIALOGUE", content: "first" }),
      makeLine({
        contentType: "MENU",
        conditions: { stats: { courage: { value: 10, operator: ">=" } } },
        menuOptions: [
          {
            label: "Go left",
            targetLabelId: "lbl-left",
            targetLabelName: "left",
          },
        ],
      }),
      makeLine({ contentType: "DIALOGUE", content: "second" }),
    ];
    const label = makeLabel(lines);
    const { result } = renderHook(() => useTechnicalInfo(label));
    const get = result.current.getTechnicalInfoForLine;

    // Conditions on the following MENU row stay on the preceding prose line
    expect(get(lines[0].id)?.conditions).toEqual({
      stats: { courage: { value: 10, operator: ">=" } },
    });
    expect(get(lines[2].id)?.conditions).toBeUndefined();
    // menuOptions are intentionally not aggregated: choices render as
    // inline CHOICE entries in prose mode
    expect(get(lines[0].id)?.choices).toBeUndefined();
  });

  it("handles a contiguous block of multiple VISUAL rows before prose", () => {
    const lines = [
      makeLine({
        contentType: "VISUAL",
        visualStatements: [visual("SCENE", "forest")],
      }),
      makeLine({
        contentType: "VISUAL",
        visualStatements: [visual("SHOW", "hero")],
      }),
      makeLine({ contentType: "DIALOGUE", content: "first" }),
      makeLine({ contentType: "DIALOGUE", content: "second" }),
    ];
    const label = makeLabel(lines);
    const { result } = renderHook(() => useTechnicalInfo(label));
    const get = result.current.getTechnicalInfoForLine;

    expect(get(lines[2].id)?.visuals).toEqual([
      visual("SCENE", "forest"),
      visual("SHOW", "hero"),
    ]);
    expect(get(lines[3].id)?.visuals).toBeUndefined();
  });

  it("excludes VISUAL rows from forward aggregation without double-counting", () => {
    const lines = [
      makeLine({
        contentType: "DIALOGUE",
        content: "first",
        visualStatements: [visual("SCENE", "inline-scene")],
      }),
      makeLine({
        contentType: "VISUAL",
        visualStatements: [visual("SCENE", "forest")],
      }),
      makeLine({ contentType: "DIALOGUE", content: "second" }),
    ];
    const label = makeLabel(lines);
    const { result } = renderHook(() => useTechnicalInfo(label));
    const get = result.current.getTechnicalInfoForLine;

    // First line keeps only its inline statement
    expect(get(lines[0].id)?.visuals).toEqual([
      visual("SCENE", "inline-scene"),
    ]);
    // Second line gets only the backward VISUAL row
    expect(get(lines[2].id)?.visuals).toEqual([visual("SCENE", "forest")]);
  });

  it("skips VISUAL rows inside a forward structural block but still aggregates the structural lines", () => {
    const lines = [
      makeLine({ contentType: "DIALOGUE", content: "first" }),
      makeLine({ contentType: "JUMP", content: "jump next_label" }),
      makeLine({
        contentType: "VISUAL",
        visualStatements: [visual("SHOW", "hero")],
      }),
      makeLine({ contentType: "DIALOGUE", content: "second" }),
    ];
    const label = makeLabel(lines);
    const { result } = renderHook(() => useTechnicalInfo(label));
    const get = result.current.getTechnicalInfoForLine;

    // Jump still forward-attached to first dialogue
    expect(get(lines[0].id)?.jumpTarget).toEqual({
      labelName: "next_label",
      labelId: "",
    });
    // The interleaved VISUAL row belongs to the following dialogue only
    expect(get(lines[0].id)?.visuals).toBeUndefined();
    expect(get(lines[3].id)?.visuals).toEqual([visual("SHOW", "hero")]);
  });

  it("returns stable cached references when source rows are unchanged", () => {
    const lines = [
      makeLine({
        contentType: "VISUAL",
        visualStatements: [visual("SCENE", "forest")],
      }),
      makeLine({ contentType: "DIALOGUE", content: "first" }),
    ];
    const label = makeLabel(lines);
    const { result, rerender } = renderHook(() => useTechnicalInfo(label));
    const first = result.current.getTechnicalInfoForLine(lines[1].id);
    rerender();
    const second = result.current.getTechnicalInfoForLine(lines[1].id);
    expect(second).toBe(first);
  });

  it("invalidates the cached reference when a backward VISUAL row changes", () => {
    const lines = [
      makeLine({
        contentType: "VISUAL",
        visualStatements: [visual("SCENE", "forest")],
      }),
      makeLine({ contentType: "DIALOGUE", content: "first" }),
    ];
    const label = makeLabel(lines);
    const { result, rerender } = renderHook(() => useTechnicalInfo(label));
    const first = result.current.getTechnicalInfoForLine(lines[1].id);
    expect(first?.visuals).toEqual([visual("SCENE", "forest")]);

    // Mutate the backward VISUAL row's statements
    lines[0].visualStatements = [visual("HIDE", "hero")];
    rerender();

    const second = result.current.getTechnicalInfoForLine(lines[1].id);
    expect(second?.visuals).toEqual([visual("HIDE", "hero")]);
  });
});
