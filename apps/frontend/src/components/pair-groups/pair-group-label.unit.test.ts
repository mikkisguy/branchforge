/**
 * pair-group-label unit tests
 */

import { describe, it, expect } from "vitest";
import { trimRequiredDuoEndingLabel } from "./pair-group-label";

describe("trimRequiredDuoEndingLabel", () => {
  it("returns the required error for empty input", () => {
    expect(trimRequiredDuoEndingLabel("")).toEqual({
      error: "Duo ending label is required",
    });
  });

  it("returns the required error for whitespace-only input", () => {
    expect(trimRequiredDuoEndingLabel("   \t\n")).toEqual({
      error: "Duo ending label is required",
    });
  });

  it("returns a custom error message when provided", () => {
    expect(trimRequiredDuoEndingLabel("  ", "Label required")).toEqual({
      error: "Label required",
    });
  });

  it("returns the trimmed value for non-empty input", () => {
    expect(trimRequiredDuoEndingLabel("  best_friends_ending  ")).toEqual({
      value: "best_friends_ending",
    });
  });
});
