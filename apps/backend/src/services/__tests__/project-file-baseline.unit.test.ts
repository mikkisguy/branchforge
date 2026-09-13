import { describe, it, expect } from "vitest";
import {
  hasUnpushedLocalContent,
  localContentBaselineHash,
} from "../project-file-baseline.js";
import { calculateContentHash } from "../../lib/hash.js";

describe("project-file-baseline", () => {
  it("prefers lastPushedContentHash when present", () => {
    expect(
      localContentBaselineHash({
        lastPushedContentHash: "pushed-hash",
        originalContent: 'label start:\n    "Original"\n    return',
      })
    ).toBe("pushed-hash");
  });

  it("falls back to cleaned originalContent hash", () => {
    const original = 'label start:\n    "Original"\n    return';
    expect(
      localContentBaselineHash({
        lastPushedContentHash: null,
        originalContent: original,
      })
    ).toBe(calculateContentHash(original));
  });

  it("returns null when no baseline exists", () => {
    expect(
      localContentBaselineHash({
        lastPushedContentHash: null,
        originalContent: null,
      })
    ).toBeNull();
  });

  it("detects unpushed local content against the baseline", () => {
    expect(
      hasUnpushedLocalContent({
        contentHash: "local-hash",
        lastPushedContentHash: "pushed-hash",
        originalContent: null,
      })
    ).toBe(true);

    expect(
      hasUnpushedLocalContent({
        contentHash: "pushed-hash",
        lastPushedContentHash: "pushed-hash",
        originalContent: null,
      })
    ).toBe(false);

    expect(
      hasUnpushedLocalContent({
        contentHash: "local-hash",
        lastPushedContentHash: null,
        originalContent: null,
      })
    ).toBe(false);
  });
});
