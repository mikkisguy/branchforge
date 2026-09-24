import { describe, expect, it } from "vitest";
import { hasInvalidBranchComponent } from "./git-branch-name.js";

describe("hasInvalidBranchComponent", () => {
  it("accepts hierarchical names and dotted version segments", () => {
    expect(hasInvalidBranchComponent("main")).toBe(false);
    expect(hasInvalidBranchComponent("feature/labels")).toBe(false);
    expect(hasInvalidBranchComponent("release-1.2")).toBe(false);
  });

  it("rejects empty path components and . / .lock segments", () => {
    expect(hasInvalidBranchComponent("feature//labels")).toBe(true);
    expect(hasInvalidBranchComponent(".hidden")).toBe(true);
    expect(hasInvalidBranchComponent("feature/.hidden")).toBe(true);
    expect(hasInvalidBranchComponent("feature.")).toBe(true);
    expect(hasInvalidBranchComponent("feature/labels.")).toBe(true);
    expect(hasInvalidBranchComponent("feature.lock")).toBe(true);
    expect(hasInvalidBranchComponent("feature/labels.lock")).toBe(true);
  });
});
