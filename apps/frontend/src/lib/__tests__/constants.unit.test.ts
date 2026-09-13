import { describe, expect, it } from "vitest";
import { normalizeBaseUrl } from "@/lib/constants";

describe("normalizeBaseUrl", () => {
  it("keeps the root base as /", () => {
    expect(normalizeBaseUrl("/")).toBe("/");
    expect(normalizeBaseUrl("")).toBe("/");
  });

  it("adds leading and trailing slashes for subpath bases", () => {
    expect(normalizeBaseUrl("/branchforge")).toBe("/branchforge/");
    expect(normalizeBaseUrl("/branchforge/")).toBe("/branchforge/");
    expect(normalizeBaseUrl("branchforge")).toBe("/branchforge/");
  });
});
