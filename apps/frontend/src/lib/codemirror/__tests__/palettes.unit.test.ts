import { describe, it, expect, beforeEach } from "vitest";
import {
  deriveLightColor,
  parseHSL,
  PALETTES,
  applyPalette,
} from "../palettes";

/**
 * Helper to extract lightness from an hsl string
 */
function extractLightness(hslString: string): number {
  return parseHSL(hslString).l;
}

/**
 * Helper to extract saturation from an hsl string
 */
function extractSaturation(hslString: string): number {
  return parseHSL(hslString).s;
}

describe("parseHSL", () => {
  it('parses "hsl(150, 53%, 49%)" -> {h:150, s:53, l:49}', () => {
    const result = parseHSL("hsl(150, 53%, 49%)");
    expect(result).toEqual({ h: 150, s: 53, l: 49 });
  });

  it('parses "hsl(0, 0%, 82%)" -> {h:0, s:0, l:82}', () => {
    const result = parseHSL("hsl(0, 0%, 82%)");
    expect(result).toEqual({ h: 0, s: 0, l: 82 });
  });

  it('parses "hsl(225, 85%, 66%)" -> {h:225, s:85, l:66}', () => {
    const result = parseHSL("hsl(225, 85%, 66%)");
    expect(result).toEqual({ h: 225, s: 85, l: 66 });
  });

  it('parses "hsl(140, 60%, 92%)" -> {h:140, s:60, l:92}', () => {
    const result = parseHSL("hsl(140, 60%, 92%)");
    expect(result).toEqual({ h: 140, s: 60, l: 92 });
  });

  it("returns fallback {h:0, s:0, l:50} for invalid format", () => {
    const result = parseHSL("invalid");
    expect(result).toEqual({ h: 0, s: 0, l: 50 });
  });
});

describe("deriveLightColor three tiers", () => {
  describe("Tier 1: High lightness (> 70)", () => {
    it("high lightness grey: hsl(0, 0%, 82%) -> lightness in [22,32], saturation stays 0", () => {
      const result = deriveLightColor("hsl(0, 0%, 82%)");
      const l = extractLightness(result);
      const s = extractSaturation(result);

      expect(l).toBeGreaterThanOrEqual(22);
      expect(l).toBeLessThanOrEqual(32);
      expect(s).toBe(0);
    });

    it("high lightness with hue: hsl(140, 60%, 92%) -> lightness <= 32, saturation > original (boosted)", () => {
      const result = deriveLightColor("hsl(140, 60%, 92%)");
      const l = extractLightness(result);
      const s = extractSaturation(result);

      expect(l).toBeLessThanOrEqual(32);
      expect(s).toBeGreaterThan(60); // boosted from 60
      expect(s).toBeLessThanOrEqual(100);
    });

    it("high lightness pale atom: hsl(240, 33%, 95%) -> lightness in [22,32], saturation boosted", () => {
      const result = deriveLightColor("hsl(240, 33%, 95%)");
      const l = extractLightness(result);
      const s = extractSaturation(result);

      expect(l).toBeGreaterThanOrEqual(22);
      expect(l).toBeLessThanOrEqual(32);
      expect(s).toBeGreaterThan(33); // boosted from 33
      expect(s).toBeLessThanOrEqual(100);
    });
  });

  describe("Tier 2: Medium lightness (50-70)", () => {
    it("medium tone: hsl(225, 85%, 66%) -> resulting lightness = 28", () => {
      const result = deriveLightColor("hsl(225, 85%, 66%)");
      const l = extractLightness(result);

      expect(l).toBe(28); // 66 - 38 = 28
    });

    it("medium tone with low saturation: hsl(210, 11%, 65%) -> saturation boosted", () => {
      const result = deriveLightColor("hsl(210, 11%, 65%)");
      const l = extractLightness(result);
      const s = extractSaturation(result);

      expect(l).toBe(27); // 65 - 38 = 27
      expect(s).toBe(26); // 11 + 15 = 26 (boosted because s < 70)
    });

    it("medium tone with high saturation: hsl(150, 73%, 63%) -> saturation unchanged", () => {
      const result = deriveLightColor("hsl(150, 73%, 63%)");
      const l = extractLightness(result);
      const s = extractSaturation(result);

      expect(l).toBe(25); // 63 - 38 = 25
      expect(s).toBe(73); // unchanged because s >= 70
    });
  });

  describe("Tier 3: Low lightness (<= 50)", () => {
    it("low lightness: hsl(150, 53%, 49%) -> resulting lightness = 32", () => {
      const result = deriveLightColor("hsl(150, 53%, 49%)");
      const l = extractLightness(result);

      expect(l).toBe(32); // 49 - 15 = 34, clamped to 32
    });

    it("very low lightness: hsl(150, 53%, 20%) -> lightness = 22 (clamped to min)", () => {
      const result = deriveLightColor("hsl(150, 53%, 20%)");
      const l = extractLightness(result);

      expect(l).toBe(22); // 20 - 15 = 5, clamped to 22
    });

    it("borderline low lightness: hsl(0, 0%, 50%) -> resulting lightness = 32", () => {
      const result = deriveLightColor("hsl(0, 0%, 50%)");
      const l = extractLightness(result);

      expect(l).toBe(32); // 50 - 15 = 35, clamped to 32
    });
  });
});

describe("App Theme palette coverage", () => {
  const appThemePalettes = PALETTES.filter((p) => p.group === "App Themes");

  it("derives all App Theme colors to readable lightness (22-32)", () => {
    for (const palette of appThemePalettes) {
      for (const color of Object.values(palette.colors)) {
        const derived = deriveLightColor(color);
        const l = extractLightness(derived);

        expect(l).toBeGreaterThanOrEqual(22);
        expect(l).toBeLessThanOrEqual(32);
      }
    }
  });

  it("derives string tokens to lightness 22-32", () => {
    for (const palette of appThemePalettes) {
      const derived = deriveLightColor(palette.colors.string);
      const l = extractLightness(derived);

      expect(l).toBeGreaterThanOrEqual(22);
      expect(l).toBeLessThanOrEqual(32);
    }
  });

  it("derives atom tokens to lightness 22-32", () => {
    for (const palette of appThemePalettes) {
      const derived = deriveLightColor(palette.colors.atom);
      const l = extractLightness(derived);

      expect(l).toBeGreaterThanOrEqual(22);
      expect(l).toBeLessThanOrEqual(32);
    }
  });

  it("preserves saturation 0 for grey string tokens", () => {
    for (const palette of appThemePalettes) {
      const derived = deriveLightColor(palette.colors.string);
      const s = extractSaturation(derived);

      // All string tokens in App Themes are hsl(0, 0%, 82%)
      expect(s).toBe(0);
    }
  });

  it("boosts saturation for colored atom tokens (original saturation > 0)", () => {
    for (const palette of appThemePalettes) {
      const original = palette.colors.atom;
      const originalS = extractSaturation(original);
      const derived = deriveLightColor(original);
      const derivedS = extractSaturation(derived);

      if (originalS > 0) {
        // All atom tokens have lightness > 70, so they get saturation boost
        expect(derivedS).toBeGreaterThan(originalS);
      }
    }
  });
});

describe("applyPalette", () => {
  beforeEach(() => {
    const root = document.documentElement;
    for (const key of [
      "keyword",
      "string",
      "comment",
      "number",
      "variable",
      "atom",
      "property",
      "operator",
      "punctuation",
      "config-keyword",
      "audio-keyword",
    ]) {
      root.style.removeProperty(`--${key}`);
      root.style.removeProperty(`--${key}-dark`);
      root.style.removeProperty(`--${key}-light`);
    }
  });

  it("sets -dark and -light tokens without overriding mode remapping", () => {
    const palette = PALETTES[0];
    applyPalette(palette);

    const root = document.documentElement;
    expect(root.style.getPropertyValue("--keyword")).toBe("");
    expect(root.style.getPropertyValue("--keyword-dark")).toBe(
      palette.colors.keyword
    );
    expect(root.style.getPropertyValue("--keyword-light")).toBe(
      deriveLightColor(palette.colors.keyword)
    );
    expect(root.style.getPropertyValue("--string-dark")).toBe(
      palette.colors.string
    );
    expect(root.style.getPropertyValue("--string-light")).toBe(
      deriveLightColor(palette.colors.string)
    );
  });
});
