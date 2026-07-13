/**
 * Token-level WCAG AA contrast verification.
 *
 * Tests foreground/background CSS token pairs used in the design system
 * across both light and dark modes.
 *
 * WCAG AA thresholds:
 *   - 4.5:1 for normal text
 *   - 3.0:1 for large text / UI components
 *
 * Note: Borders at the abstract token level are intentionally subtle
 * (≤1.5:1) for decorative purposes. Interactive elements that rely on
 * borders for affordance (inputs, buttons) are tested at the component
 * level where they use border-* opacity modifiers.
 */
import { describe, it } from "vitest";
import {
  parseHSLTuple,
  hslToRgb,
  contrastRatioRgb,
  hexToRgb,
  type HSL,
  type RGB,
} from "@/test/contrast-utils";

// ---------------------------------------------------------------------------
// CSS token definitions
// ---------------------------------------------------------------------------

type TokenMap = Record<string, string>;

const DARK_TOKENS: TokenMap = {
  background: "0 0% 6%",
  foreground: "0 0% 95%",
  card: "0 0% 8%",
  "card-foreground": "0 0% 95%",
  popover: "0 0% 6%",
  "popover-foreground": "0 0% 95%",
  primary: "0 0% 98%",
  "primary-foreground": "0 0% 9%",
  secondary: "0 0% 14%",
  "secondary-foreground": "0 0% 90%",
  muted: "0 0% 14%",
  "muted-foreground": "0 0% 55%",
  accent: "0 0% 14%",
  "accent-foreground": "0 0% 90%",
  destructive: "0 62.8% 30.6%",
  "destructive-foreground": "0 0% 98%",
  "destructive-muted": "0 70% 55%",
  border: "0 0% 20%",
  input: "0 0% 18%",
  ring: "0 0% 70%",
};

const LIGHT_TOKENS: TokenMap = {
  background: "220 20% 97%",
  foreground: "222 47% 11%",
  card: "220 25% 99%",
  "card-foreground": "222 47% 11%",
  popover: "220 25% 99%",
  "popover-foreground": "222 47% 11%",
  primary: "222 47% 11%",
  "primary-foreground": "210 40% 98%",
  secondary: "220 16% 92%",
  "secondary-foreground": "222 47% 11%",
  muted: "220 15% 93%",
  "muted-foreground": "220 10% 38%",
  accent: "220 30% 94%",
  "accent-foreground": "222 47% 11%",
  destructive: "0 72% 48%",
  "destructive-foreground": "0 0% 98%",
  "destructive-muted": "0 75% 45%",
  border: "214 20% 88%",
  input: "214 20% 88%",
  ring: "222 47% 11%",
};

const THEME_COLORS: Record<string, { primary: string; foreground: string }> = {
  forest: { primary: "#26714e", foreground: "#ffffff" },
  periwinkle: { primary: "#5b6ae0", foreground: "#ffffff" },
  "dark-amethyst": { primary: "#9549b6", foreground: "#ffffff" },
  graphite: { primary: "#72757d", foreground: "#ffffff" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hslFor(tokens: TokenMap, name: string): HSL {
  const tuple = tokens[name];
  if (!tuple) throw new Error(`Token "${name}" not found`);
  return parseHSLTuple(tuple);
}

function rgbFor(tokens: TokenMap, name: string): RGB {
  return hslToRgb(hslFor(tokens, name));
}

function contrast(fg: HSL, bg: HSL): number {
  return contrastRatioRgb(hslToRgb(fg), hslToRgb(bg));
}

function assertContrast(
  fgToken: string,
  bgToken: string,
  tokens: TokenMap,
  threshold: number,
  mode: string
): void {
  const fg = hslFor(tokens, fgToken);
  const bg = hslFor(tokens, bgToken);
  const ratio = contrast(fg, bg);

  if (ratio < threshold) {
    throw new Error(
      `[${mode}] ${fgToken} on ${bgToken}: ratio ${ratio.toFixed(2)}:1 ` +
        `< required ${threshold}:1 (fg=${tokens[fgToken]}, bg=${tokens[bgToken]})`
    );
  }
}

// ---------------------------------------------------------------------------
// Tests: Dark mode
// ---------------------------------------------------------------------------

describe("Dark mode token contrast (WCAG AA)", () => {
  const t = DARK_TOKENS;
  const m = "dark";

  it("foreground on background >= 4.5:1", () =>
    assertContrast("foreground", "background", t, 4.5, m));
  it("card-foreground on card >= 4.5:1", () =>
    assertContrast("card-foreground", "card", t, 4.5, m));
  it("popover-foreground on popover >= 4.5:1", () =>
    assertContrast("popover-foreground", "popover", t, 4.5, m));
  it("primary-foreground on primary >= 4.5:1", () =>
    assertContrast("primary-foreground", "primary", t, 4.5, m));
  it("secondary-foreground on secondary >= 4.5:1", () =>
    assertContrast("secondary-foreground", "secondary", t, 4.5, m));
  it("muted-foreground on background >= 4.5:1", () =>
    assertContrast("muted-foreground", "background", t, 4.5, m));
  it("muted-foreground on card >= 4.5:1", () =>
    assertContrast("muted-foreground", "card", t, 4.5, m));
  it("muted-foreground on muted >= 4.5:1", () =>
    assertContrast("muted-foreground", "muted", t, 4.5, m));
  it("accent-foreground on accent >= 4.5:1", () =>
    assertContrast("accent-foreground", "accent", t, 4.5, m));
  it("destructive-foreground on destructive >= 4.5:1", () =>
    assertContrast("destructive-foreground", "destructive", t, 4.5, m));
});

// ---------------------------------------------------------------------------
// Tests: Light mode
// ---------------------------------------------------------------------------

describe("Light mode token contrast (WCAG AA)", () => {
  const t = LIGHT_TOKENS;
  const m = "light";

  it("foreground on background >= 4.5:1", () =>
    assertContrast("foreground", "background", t, 4.5, m));
  it("card-foreground on card >= 4.5:1", () =>
    assertContrast("card-foreground", "card", t, 4.5, m));
  it("popover-foreground on popover >= 4.5:1", () =>
    assertContrast("popover-foreground", "popover", t, 4.5, m));
  it("primary-foreground on primary >= 4.5:1", () =>
    assertContrast("primary-foreground", "primary", t, 4.5, m));
  it("secondary-foreground on secondary >= 4.5:1", () =>
    assertContrast("secondary-foreground", "secondary", t, 4.5, m));
  it("muted-foreground on background >= 4.5:1", () =>
    assertContrast("muted-foreground", "background", t, 4.5, m));
  it("muted-foreground on card >= 4.5:1", () =>
    assertContrast("muted-foreground", "card", t, 4.5, m));
  it("muted-foreground on muted >= 4.5:1", () =>
    assertContrast("muted-foreground", "muted", t, 4.5, m));
  it("accent-foreground on accent >= 4.5:1", () =>
    assertContrast("accent-foreground", "accent", t, 4.5, m));
  it("destructive-foreground on destructive >= 4.5:1", () =>
    assertContrast("destructive-foreground", "destructive", t, 4.5, m));
});

// ---------------------------------------------------------------------------
// Theme color contrast (all 4 palettes, both modes)
// ---------------------------------------------------------------------------

describe("Theme color contrast (all palettes, both modes)", () => {
  const darkBg = rgbFor(DARK_TOKENS, "background");

  for (const [name, { primary, foreground }] of Object.entries(THEME_COLORS)) {
    const theme = hexToRgb(primary);
    const fg = hexToRgb(foreground);

    it(`${name}: foreground on primary >= 4.5:1`, () => {
      const ratio = contrastRatioRgb(fg, theme);
      if (ratio < 4.5) {
        throw new Error(
          `${name} foreground ${foreground} on ${primary}: ${ratio.toFixed(2)}:1 < 4.5:1`
        );
      }
    });

    it(`${name}: primary text on dark bg >= 3:1 (links/UI)`, () => {
      const ratio = contrastRatioRgb(theme, darkBg);
      if (ratio < 3.0) {
        throw new Error(
          `${name} ${primary} on dark bg: ${ratio.toFixed(2)}:1 < 3:1`
        );
      }
    });
  }
});
