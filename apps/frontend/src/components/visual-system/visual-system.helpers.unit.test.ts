/**
 * visual-system.helpers unit tests
 */

import { describe, it, expect } from "vitest";
import { parseGroupPrefixes } from "./visual-system.helpers";

describe("parseGroupPrefixes", () => {
  it("parses a valid nested object", () => {
    const result = parseGroupPrefixes(
      JSON.stringify({
        romance: { luna: "lu_", kai: "kai_" },
      })
    );
    expect(result.error).toBeUndefined();
    expect(result.value).toEqual({
      romance: { luna: "lu_", kai: "kai_" },
    });
  });

  it("treats empty input and {} as clearing to null", () => {
    expect(parseGroupPrefixes("")).toEqual({ value: null });
    expect(parseGroupPrefixes("   ")).toEqual({ value: null });
    expect(parseGroupPrefixes("{}")).toEqual({ value: null });
  });

  it("returns an error for malformed JSON", () => {
    const result = parseGroupPrefixes("{not-json");
    expect(result.value).toBeNull();
    expect(result.error).toBe("Group prefixes JSON is not valid");
  });

  it("rejects top-level arrays", () => {
    const result = parseGroupPrefixes("[]");
    expect(result.value).toBeNull();
    expect(result.error).toBe("Group prefixes must be a JSON object");
  });

  it("rejects invalid nested values", () => {
    const result = parseGroupPrefixes(
      JSON.stringify({
        romance: ["not", "an", "object"],
      })
    );
    expect(result.value).toBeNull();
    expect(result.error).toBe(
      'Group "romance" must map to an object of prefix entries'
    );
  });

  it("rejects whitespace-only keys and values", () => {
    const emptyKey = parseGroupPrefixes(
      JSON.stringify({
        romance: { "   ": "lu_" },
      })
    );
    expect(emptyKey.value).toBeNull();
    expect(emptyKey.error).toBe('Group "romance" has an empty key');

    const emptyValue = parseGroupPrefixes(
      JSON.stringify({
        romance: { luna: "   " },
      })
    );
    expect(emptyValue.value).toBeNull();
    expect(emptyValue.error).toBe(
      'Group "romance" entry "luna" must be a non-empty string'
    );
  });
});
