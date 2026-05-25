/**
 * Technical Parser Tests
 *
 * Unit tests for technical constructs extraction from RPY files.
 * Tests are written before implementation (TDD approach).
 *
 * The parser extracts:
 * - Menu choices with targets and effects
 * - Jump statements
 * - Scene/show/hide visual statements
 * - Conditions
 */

import { describe, it, expect } from "vitest";
import { extractTechnicalConstructs } from "../rpy-parser.service.js";

describe("extractTechnicalConstructs - menu choices", () => {
  it("extracts menu choices with targets and effects", () => {
    const rpyContent = `
      menu:
          "Help Luna":
              $ affection_luna += 10
              jump luna_scene_2
          "Ignore Luna":
              $ affection_luna -= 5
              jump walk_away
    `;

    const result = extractTechnicalConstructs(rpyContent, 1); // Line 1 is menu:

    expect(result.choices).toBeDefined();
    expect(result.choices!).toHaveLength(2);
    expect(result.choices![0]).toMatchObject({
      label: "Help Luna",
      targetLabelId: "luna_scene_2",
      effects: { stats: { affection_luna: 10 } },
    });
  });

  it("debug: verify stat regex works", () => {
    const testLine = "$ affection_luna += 10";
    const regex = /\$\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(\+=|-=)\s*(-?\d+)/;
    const match = testLine.match(regex);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("affection_luna");
    expect(match![2]).toBe("+=");
    expect(match![3]).toBe("10");
  });
});

describe("extractTechnicalConstructs - jump statements", () => {
  it("extracts jump target from line", () => {
    const rpyContent = "    jump luna_scene_2";

    const result = extractTechnicalConstructs(rpyContent, 0);

    expect(result.jumpTarget).toBe("luna_scene_2");
  });
});

describe("extractTechnicalConstructs - scene/show/hide", () => {
  it("extracts scene statement with transition", () => {
    const rpyContent = "    scene bg_school_day with fade";

    const result = extractTechnicalConstructs(rpyContent, 0);

    expect(result.visuals).toBeDefined();
    expect(result.visuals).toHaveLength(1);
    expect(result.visuals![0]).toMatchObject({
      type: "SCENE",
      target: "bg_school_day",
      with: "fade",
    });
  });

  it("extracts show statement with position", () => {
    const rpyContent = "    show e happy at right";

    const result = extractTechnicalConstructs(rpyContent, 0);

    expect(result.visuals).toBeDefined();
    expect(result.visuals).toHaveLength(1);
    expect(result.visuals![0]).toMatchObject({
      type: "SHOW",
      target: "e happy",
      at: "right",
    });
  });

  it("extracts hide statement", () => {
    const rpyContent = "    hide e";

    const result = extractTechnicalConstructs(rpyContent, 0);

    expect(result.visuals).toBeDefined();
    expect(result.visuals).toHaveLength(1);
    expect(result.visuals![0]).toMatchObject({
      type: "HIDE",
      target: "e",
    });
  });
});
