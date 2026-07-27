import { describe, expect, it } from "vitest";
import {
  findProjectImageForTarget,
  isValidProjectImageMimeType,
  normalizeImageTarget,
  visualTargetsMatch,
} from "./project-images.js";

describe("normalizeImageTarget", () => {
  it("strips extension and lowercases", () => {
    expect(normalizeImageTarget("Eileen_Happy.PNG")).toBe("eileen_happy");
    expect(normalizeImageTarget("example_123.webp")).toBe("example_123");
  });

  it("converts spaces to underscores", () => {
    expect(normalizeImageTarget("Eileen Happy.png")).toBe("eileen_happy");
    expect(normalizeImageTarget("eileen  happy")).toBe("eileen_happy");
  });

  it("handles empty and extension-only inputs", () => {
    expect(normalizeImageTarget("")).toBe("");
    expect(normalizeImageTarget("   ")).toBe("");
    expect(normalizeImageTarget(".png")).toBe("");
  });
});

describe("visualTargetsMatch", () => {
  it("matches exact underscore targets", () => {
    expect(visualTargetsMatch("example_123", "example_123")).toBe(true);
  });

  it("matches spaces to underscores", () => {
    expect(visualTargetsMatch("eileen happy", "eileen_happy")).toBe(true);
    expect(visualTargetsMatch("Eileen Happy", "eileen_happy")).toBe(true);
  });

  it("rejects non-matches", () => {
    expect(visualTargetsMatch("eileen sad", "eileen_happy")).toBe(false);
    expect(visualTargetsMatch("", "eileen_happy")).toBe(false);
  });
});

describe("findProjectImageForTarget", () => {
  const images = [
    { id: "1", normalizedTarget: "eileen_happy" },
    { id: "2", normalizedTarget: "bg_school" },
  ];

  it("finds matching image", () => {
    expect(findProjectImageForTarget(images, "eileen happy")?.id).toBe("1");
    expect(findProjectImageForTarget(images, "bg school")?.id).toBe("2");
  });

  it("returns undefined when missing", () => {
    expect(findProjectImageForTarget(images, "missing")).toBeUndefined();
  });
});

describe("isValidProjectImageMimeType", () => {
  it("accepts common image types", () => {
    expect(isValidProjectImageMimeType("image/png")).toBe(true);
    expect(isValidProjectImageMimeType("image/JPEG")).toBe(true);
    expect(isValidProjectImageMimeType("image/webp")).toBe(true);
  });

  it("rejects non-images", () => {
    expect(isValidProjectImageMimeType("application/pdf")).toBe(false);
  });
});
