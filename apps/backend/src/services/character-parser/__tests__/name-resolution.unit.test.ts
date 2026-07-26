import { describe, it, expect } from "vitest";
import { inferNameTypeFromStoredName } from "../name-resolution.js";

describe("inferNameTypeFromStoredName", () => {
  it.each([
    { name: null, expected: "none" as const },
    { name: "", expected: "empty" as const },
    { name: "???", expected: "unknown" as const },
    { name: "[first_name]", expected: "interpolated" as const },
    { name: "{color=#f00}X{/color}", expected: "tagged" as const },
    { name: "Eileen", expected: "literal" as const },
  ])("maps stored name to $expected", ({ name, expected }) => {
    expect(inferNameTypeFromStoredName(name)).toBe(expected);
  });

  it("defaults bare identifiers to literal without NameForm context", () => {
    // `classifyName` marks `boss_name` as `variable` when parsed from source
    // (identifier form), but stored-name inference has no form context and
    // treats ambiguous bare strings as literal.
    expect(inferNameTypeFromStoredName("boss_name")).toBe("literal");
  });
});
