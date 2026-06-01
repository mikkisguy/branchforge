import { describe, it, expect } from "vitest";

import { resolveLabelNames } from "../label-name-resolver.service.js";

describe("resolveLabelNames", () => {
  it("resolves label names to label IDs", () => {
    const labels = [
      { id: "label-1", labelName: "start" },
      { id: "label-2", labelName: "luna_scene_2" },
      { id: "label-3", labelName: "ending" },
    ];

    const result = resolveLabelNames(labels, [
      "luna_scene_2",
      "start",
      "nonexistent_label",
    ]);

    expect(result).toEqual({
      luna_scene_2: "label-2",
      start: "label-1",
      nonexistent_label: null,
    });
  });

  it("returns null for nonexistent labels", () => {
    const labels = [{ id: "label-1", labelName: "start" }];

    const result = resolveLabelNames(labels, ["nonexistent"]);

    expect(result).toEqual({
      nonexistent: null,
    });
  });

  it("handles empty label list", () => {
    const result = resolveLabelNames([], ["some_label"]);

    expect(result).toEqual({
      some_label: null,
    });
  });

  it("handles empty names to resolve", () => {
    const labels = [{ id: "label-1", labelName: "start" }];

    const result = resolveLabelNames(labels, []);

    expect(result).toEqual({});
  });

  it("is case-insensitive for label names", () => {
    const labels = [{ id: "label-1", labelName: "Start_Scene" }];

    const result = resolveLabelNames(labels, ["start_scene"]);

    expect(result).toEqual({
      start_scene: "label-1",
    });
  });
});
