import { describe, it, expect } from "vitest";
import { mapEntriesToLabelLineValues } from "../label-line-mapper";
import type { ComparisonOperator } from "@branchforge/shared";

describe("mapEntriesToLabelLineValues - technical metadata", () => {
  const charactersByTag = new Map<string, string>();

  it("maps line-level conditions with operators", () => {
    const entries = [
      {
        type: "DIALOGUE" as const,
        text: "Hello",
        speaker: "char1",
        lineNumber: 1,
        indentLevel: 0,
        conditions: {
          stats: {
            affection_luna: { value: 50, operator: ">=" as ComparisonOperator },
          },
        },
      },
    ];

    const result = mapEntriesToLabelLineValues(
      entries,
      "label1",
      "project1",
      charactersByTag
    );

    expect(result[0].conditions).toMatchObject({
      stats: { affection_luna: { value: 50, operator: ">=" } },
    });
  });

  it("maps visual statements", () => {
    const entries = [
      {
        type: "DIALOGUE" as const,
        text: "Hello",
        speaker: "char1",
        lineNumber: 1,
        indentLevel: 0,
        visuals: [
          {
            type: "SCENE" as const,
            target: "bg_school_day",
            with: "fade",
          },
        ],
      },
    ];

    const result = mapEntriesToLabelLineValues(
      entries,
      "label1",
      "project1",
      charactersByTag
    );

    expect(result[0].visualStatements).toHaveLength(1);
    expect(result[0].visualStatements![0]).toMatchObject({
      type: "SCENE",
      target: "bg_school_day",
      with: "fade",
    });
  });

  it("preserves StatCondition with non-default operator", () => {
    const entries = [
      {
        type: "DIALOGUE" as const,
        text: "Hello",
        speaker: "char1",
        lineNumber: 1,
        indentLevel: 0,
        conditions: {
          stats: {
            affection_luna: { value: 50, operator: ">" as ComparisonOperator },
          },
        },
      },
    ];

    const result = mapEntriesToLabelLineValues(
      entries,
      "label1",
      "project1",
      charactersByTag
    );

    expect(result[0].conditions).toMatchObject({
      stats: { affection_luna: { value: 50, operator: ">" } },
    });
  });

  it("normalizes plain number to StatCondition with default operator", () => {
    const entries = [
      {
        type: "DIALOGUE" as const,
        text: "Hello",
        speaker: "char1",
        lineNumber: 1,
        indentLevel: 0,
        conditions: { stats: { affection_luna: 50 } },
      },
    ];

    const result = mapEntriesToLabelLineValues(
      entries,
      "label1",
      "project1",
      charactersByTag
    );

    expect(result[0].conditions).toMatchObject({
      stats: { affection_luna: { value: 50, operator: ">=" } },
    });
  });

  it("maps null conditions when not present", () => {
    const entries = [
      {
        type: "DIALOGUE" as const,
        text: "Hello",
        speaker: "char1",
        lineNumber: 1,
        indentLevel: 0,
      },
    ];

    const result = mapEntriesToLabelLineValues(
      entries,
      "label1",
      "project1",
      charactersByTag
    );

    expect(result[0].conditions).toBeNull();
  });

  it("maps null visualStatements when not present", () => {
    const entries = [
      {
        type: "DIALOGUE" as const,
        text: "Hello",
        speaker: "char1",
        lineNumber: 1,
        indentLevel: 0,
      },
    ];

    const result = mapEntriesToLabelLineValues(
      entries,
      "label1",
      "project1",
      charactersByTag
    );

    expect(result[0].visualStatements).toBeNull();
  });

  it("maps empty arrays for conditions and visualStatements", () => {
    const entries = [
      {
        type: "DIALOGUE" as const,
        text: "Hello",
        speaker: "char1",
        lineNumber: 1,
        indentLevel: 0,
        conditions: {},
        visuals: [],
      },
    ];

    const result = mapEntriesToLabelLineValues(
      entries,
      "label1",
      "project1",
      charactersByTag
    );

    expect(result[0].conditions).toEqual({});
    expect(result[0].visualStatements).toEqual([]);
  });
});
