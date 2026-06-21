import { describe, it, expect } from "vitest";
import { stripRenpyTextTags } from "./index.js";

describe("stripRenpyTextTags", () => {
  it("returns plain text unchanged", () => {
    expect(stripRenpyTextTags("Hello world")).toBe("Hello world");
  });

  it("strips a single self-closing tag", () => {
    expect(stripRenpyTextTags("Hello {b}world{/b}")).toBe("Hello world");
  });

  it("strips parameterized color tags", () => {
    expect(stripRenpyTextTags("{color=#f00}Stranger{/color}")).toBe("Stranger");
  });

  it("strips multiple parameters on a single tag", () => {
    expect(stripRenpyTextTags("{color=#f00, hex=true}Stranger{/color}")).toBe(
      "Stranger"
    );
  });

  it("strips nested tags iteratively", () => {
    expect(stripRenpyTextTags("{b}{color=#f00}Final Boss{/color}{/b}")).toBe(
      "Final Boss"
    );
  });

  it("strips size tags", () => {
    expect(stripRenpyTextTags("{size=30}Big{/size}")).toBe("Big");
  });

  it("preserves non-ASCII text (Japanese, CJK, emoji)", () => {
    expect(stripRenpyTextTags("エイリーン")).toBe("エイリーン");
    expect(stripRenpyTextTags("桜 — Sakura")).toBe("桜 — Sakura");
    expect(stripRenpyTextTags("Sarah \u{1F600}")).toBe("Sarah \u{1F600}");
  });

  it("strips unknown/malformed tags (matches Ren'Py behavior)", () => {
    expect(stripRenpyTextTags("{fast}Hello{/fast}")).toBe("Hello");
  });

  it("returns empty string unchanged", () => {
    expect(stripRenpyTextTags("")).toBe("");
  });

  it("removes tags around text with no surrounding content", () => {
    expect(stripRenpyTextTags("{b}bold{/b}")).toBe("bold");
  });

  it("handles multiple tag pairs in a single string", () => {
    expect(stripRenpyTextTags("{i}italic{/i} and {b}bold{/b}")).toBe(
      "italic and bold"
    );
  });

  it("does not strip square brackets (those are Ren'Py interpolation, not tags)", () => {
    expect(stripRenpyTextTags("[e_name]")).toBe("[e_name]");
    expect(stripRenpyTextTags("Hello [player_name]")).toBe(
      "Hello [player_name]"
    );
  });
});
