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
