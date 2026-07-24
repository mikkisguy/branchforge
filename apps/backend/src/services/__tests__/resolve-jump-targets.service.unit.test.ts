import { describe, it, expect } from "vitest";

import { resolveJumpTargets } from "../labels.service.js";

describe("resolveJumpTargets", () => {
  it("resolves menu option targetLabelId to actual label ID", () => {
    const allLabels = [
      { id: "label-1", labelName: "start" },
      { id: "label-2", labelName: "luna_scene_2" },
      { id: "label-3", labelName: "ending" },
    ];

    const lines = [
      {
        id: "line-1",
        menuOptions: [
          {
            label: "Choice 1",
            targetLabelId: "luna_scene_2",
            targetLabelName: "luna_scene_2",
          },
          {
            label: "Choice 2",
            targetLabelId: "start",
            targetLabelName: "start",
          },
          {
            label: "Choice 3",
            targetLabelId: "nonexistent",
            targetLabelName: "nonexistent",
          },
        ],
      },
    ];

    const result = resolveJumpTargets(lines, allLabels);

    expect(result[0].menuOptions[0]).toEqual({
      label: "Choice 1",
      targetLabelId: "label-2",
      targetLabelName: "luna_scene_2",
      targetType: "id",
    });
    expect(result[0].menuOptions[1]).toEqual({
      label: "Choice 2",
      targetLabelId: "label-1",
      targetLabelName: "start",
      targetType: "id",
    });
    expect(result[0].menuOptions[2]).toEqual({
      label: "Choice 3",
      targetLabelId: "",
      targetLabelName: "nonexistent",
    });
  });

  it("returns lines without menuOptions unchanged", () => {
    const allLabels = [{ id: "label-1", labelName: "start" }];

    const lines = [
      {
        id: "line-1",
        content: "Some dialogue",
        contentType: "DIALOGUE",
        menuOptions: undefined,
      },
    ];

    const result = resolveJumpTargets(lines, allLabels);

    expect(result[0]).toEqual(lines[0]);
  });

  it("handles empty menuOptions array", () => {
    const allLabels = [{ id: "label-1", labelName: "start" }];

    const lines = [
      {
        id: "line-1",
        menuOptions: [],
      },
    ];

    const result = resolveJumpTargets(lines, allLabels);

    expect(result[0]).toEqual(lines[0]);
  });

  it("is case-insensitive for label name matching", () => {
    const allLabels = [{ id: "label-1", labelName: "Luna_Scene_2" }];

    const lines = [
      {
        id: "line-1",
        menuOptions: [
          {
            label: "Choice",
            targetLabelId: "luna_scene_2",
            targetLabelName: "luna_scene_2",
          },
        ],
      },
    ];

    const result = resolveJumpTargets(lines, allLabels);

    expect(result[0].menuOptions[0].targetLabelId).toBe("label-1");
  });

  it("respects targetType name even when value is UUID-shaped", () => {
    const allLabels = [
      { id: "label-1", labelName: "550e8400-e29b-41d4-a716-446655440000" },
    ];

    const lines = [
      {
        id: "line-1",
        menuOptions: [
          {
            label: "Named like UUID",
            targetLabelId: "550e8400-e29b-41d4-a716-446655440000",
            targetLabelName: "uuid-named-label",
            targetType: "name" as const,
          },
        ],
      },
    ];

    const result = resolveJumpTargets(lines, allLabels);

    expect(result[0].menuOptions[0]).toEqual({
      label: "Named like UUID",
      targetLabelId: "label-1",
      targetLabelName: "uuid-named-label",
      targetType: "id",
    });
  });

  it("preserves already-resolved target with targetType id", () => {
    const allLabels = [{ id: "label-1", labelName: "some-label" }];

    const lines = [
      {
        id: "line-1",
        menuOptions: [
          {
            label: "Already ID",
            targetLabelId: "550e8400-e29b-41d4-a716-446655440000",
            targetLabelName: "some-label",
            targetType: "id" as const,
          },
        ],
      },
    ];

    const result = resolveJumpTargets(lines, allLabels);

    expect(result[0].menuOptions[0]).toEqual({
      label: "Already ID",
      targetLabelId: "550e8400-e29b-41d4-a716-446655440000",
      targetLabelName: "some-label",
      targetType: "id",
    });
  });
});
