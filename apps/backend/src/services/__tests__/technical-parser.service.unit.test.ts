import { describe, it, expect } from "vitest";
import { extractTechnicalConstructs } from "../rpy-parser.service";

describe("extractTechnicalConstructs - menu choices", () => {
  it("extracts menu choices with targets and effects", () => {
    const rpyContent = `menu:
          "Help Luna":
              $ affection_luna += 10
              jump luna_scene_2
          "Ignore Luna":
              $ affection_luna -= 5
              jump walk_away
    `;

    const result = extractTechnicalConstructs(rpyContent, 0); // Line 0 is menu:

    expect(result.choices).toBeDefined();
    expect(result.choices).toHaveLength(2);
    expect(result.choices[0]).toMatchObject({
      label: "Help Luna",
      targetLabelId: "luna_scene_2",
      effects: { stats: { affection_luna: 10 } },
    });
  });
});

describe("extractTechnicalConstructs - jumps", () => {
  it("extracts jump target from line", () => {
    const rpyContent = "    jump luna_scene_2";

    const result = extractTechnicalConstructs(rpyContent, 0);

    expect(result.jumpTarget).toBe("luna_scene_2");
  });

  it("extracts jump with expression", () => {
    const rpyContent = "    jump expression_label if flag";

    const result = extractTechnicalConstructs(rpyContent, 0);

    // Jump extraction should handle basic case first
    expect(result.jumpTarget).toBeDefined();
  });
});

describe("extractTechnicalConstructs - scene/show/hide", () => {
  it("extracts scene statement", () => {
    const rpyContent = "    scene bg_school_day with fade";

    const result = extractTechnicalConstructs(rpyContent, 0);

    expect(result.visuals).toHaveLength(1);
    expect(result.visuals[0]).toMatchObject({
      type: "SCENE",
      target: "bg_school_day",
      with: "fade",
    });
  });

  it("extracts show statement with position", () => {
    const rpyContent = "    show e happy at right";

    const result = extractTechnicalConstructs(rpyContent, 0);

    expect(result.visuals).toHaveLength(1);
    expect(result.visuals[0]).toMatchObject({
      type: "SHOW",
      target: "e happy",
      at: "right",
    });
  });

  it("extracts hide statement", () => {
    const rpyContent = "    hide e";

    const result = extractTechnicalConstructs(rpyContent, 0);

    expect(result.visuals).toHaveLength(1);
    expect(result.visuals[0]).toMatchObject({
      type: "HIDE",
      target: "e",
    });
  });

  it("extracts scene without transition", () => {
    const rpyContent = "    scene bg_school_day";

    const result = extractTechnicalConstructs(rpyContent, 0);

    expect(result.visuals).toHaveLength(1);
    expect(result.visuals[0]).toMatchObject({
      type: "SCENE",
      target: "bg_school_day",
    });
  });
});

describe("extractTechnicalConstructs - comparison operators", () => {
  it("captures >= operator", () => {
    const rpyContent = "if affection_luna >= 50:";
    const result = extractTechnicalConstructs(rpyContent, 0);
    expect(result.conditions).toEqual({
      stats: { affection_luna: { value: 50, operator: ">=" } },
    });
  });

  it("captures <=, >, <, ==, != operators", () => {
    const rpyContent = `if strength <= 5 and magic > 10 and charm < 3 and mood == 2 and trust != 1:`;
    const result = extractTechnicalConstructs(rpyContent, 0);
    expect(result.conditions).toEqual({
      stats: {
        strength: { value: 5, operator: "<=" },
        magic: { value: 10, operator: ">" },
        charm: { value: 3, operator: "<" },
        mood: { value: 2, operator: "==" },
        trust: { value: 1, operator: "!=" },
      },
    });
  });
});

describe("extractTechnicalConstructs - if/elif conditions with deltas", () => {
  it("preserves thresholds and stores deltas separately", () => {
    const rpyContent = `if strength >= 5:
    $ strength += 10`;

    // Line 0 is "if strength >= 5:"
    const result = extractTechnicalConstructs(rpyContent, 0);

    expect(result.conditions).toBeDefined();
    expect(result.conditions!.stats).toEqual({
      strength: { value: 5, operator: ">=" },
    });
    expect(result.conditions!.statDeltas).toEqual({ strength: 10 });
  });

  it("handles -= operator correctly in statDeltas", () => {
    const rpyContent = `if magic < 10:
    $ magic -= 5`;

    const result = extractTechnicalConstructs(rpyContent, 0);

    expect(result.conditions).toBeDefined();
    expect(result.conditions!.stats).toEqual({
      magic: { value: 10, operator: "<" },
    });
    expect(result.conditions!.statDeltas).toEqual({ magic: -5 });
  });

  it("preserves both stats and deltas when both exist", () => {
    const rpyContent = `if strength >= 5 and magic < 10:
    $ strength += 10
    $ magic -= 5`;

    const result = extractTechnicalConstructs(rpyContent, 0);

    expect(result.conditions).toBeDefined();
    expect(result.conditions!.stats).toEqual({
      strength: { value: 5, operator: ">=" },
      magic: { value: 10, operator: "<" },
    });
    expect(result.conditions!.statDeltas).toEqual({ strength: 10, magic: -5 });
  });
});
