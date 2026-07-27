import { describe, expect, it } from "vitest";
import { parseVisualStatementLine } from "../visual-preview-decoration";

describe("parseVisualStatementLine", () => {
  it("parses scene targets and strips with clauses", () => {
    expect(parseVisualStatementLine("scene bg school")).toEqual({
      type: "scene",
      target: "bg school",
    });
    expect(parseVisualStatementLine("scene bg school with dissolve")).toEqual({
      type: "scene",
      target: "bg school",
    });
  });

  it("parses show targets and strips at/with/zorder", () => {
    expect(parseVisualStatementLine("show eileen happy")).toEqual({
      type: "show",
      target: "eileen happy",
    });
    expect(
      parseVisualStatementLine("show eileen happy at left with dissolve")
    ).toEqual({
      type: "show",
      target: "eileen happy",
    });
    expect(
      parseVisualStatementLine("show eileen happy zorder 10 with fade")
    ).toEqual({
      type: "show",
      target: "eileen happy",
    });
    expect(
      parseVisualStatementLine("show eileen happy with dissolve at left")
    ).toEqual({
      type: "show",
      target: "eileen happy",
    });
    expect(parseVisualStatementLine("show eileen happy as eileen2")).toEqual({
      type: "show",
      target: "eileen happy",
    });
  });

  it("parses hide targets", () => {
    expect(parseVisualStatementLine("hide eileen")).toEqual({
      type: "hide",
      target: "eileen",
    });
    expect(parseVisualStatementLine("hide eileen with dissolve")).toEqual({
      type: "hide",
      target: "eileen",
    });
  });

  it("returns null for non-visual lines", () => {
    expect(parseVisualStatementLine('e "Hello"')).toBeNull();
    expect(parseVisualStatementLine("")).toBeNull();
  });
});
