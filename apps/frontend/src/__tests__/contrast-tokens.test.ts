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
import { DARK_TOKENS, LIGHT_TOKENS } from "@/test/theme-tokens";

// ---------------------------------------------------------------------------
// CSS token definitions
// ---------------------------------------------------------------------------

type TokenMap = Record<string, string>;

const THEME_COLORS: Record<
  string,
  {
    primary: string;
    foreground: string;
    hover: string;
    hoverForeground: string;
  }
> = {
  forest: {
    primary: "#26714e",
    foreground: "#ffffff",
    hover: "#339668",
    hoverForeground: "#0a0a0a",
  },
  periwinkle: {
    primary: "#5b6ae0",
    foreground: "#ffffff",
    hover: "#727ae8",
    hoverForeground: "#0a0a0a",
  },
  "dark-amethyst": {
    primary: "#9549b6",
    foreground: "#ffffff",
    hover: "#a960c7",
    hoverForeground: "#0a0a0a",
  },
  graphite: {
    primary: "#686a71",
    foreground: "#ffffff",
    hover: "#b0b7c4",
    hoverForeground: "#0a0a0a",
  },
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
  it("canvas-foreground on canvas >= 4.5:1", () =>
    assertContrast("canvas-foreground", "canvas", t, 4.5, m));
  it("panel-foreground on panel >= 4.5:1", () =>
    assertContrast("panel-foreground", "panel", t, 4.5, m));
  it("raised-foreground on raised >= 4.5:1", () =>
    assertContrast("raised-foreground", "raised", t, 4.5, m));
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

  // FlowGraphStatus error tone uses text-destructive; paired with
  // destructive-foreground on destructive for AA body text.
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
  it("canvas-foreground on canvas >= 4.5:1", () =>
    assertContrast("canvas-foreground", "canvas", t, 4.5, m));
  it("panel-foreground on panel >= 4.5:1", () =>
    assertContrast("panel-foreground", "panel", t, 4.5, m));
  it("raised-foreground on raised >= 4.5:1", () =>
    assertContrast("raised-foreground", "raised", t, 4.5, m));
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
  const lightBg = rgbFor(LIGHT_TOKENS, "background");

  for (const [
    name,
    { primary, foreground, hover, hoverForeground },
  ] of Object.entries(THEME_COLORS)) {
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

    it(`${name}: hover foreground on hover >= 4.5:1`, () => {
      const hBg = hexToRgb(hover);
      const hFg = hexToRgb(hoverForeground);
      const ratio = contrastRatioRgb(hFg, hBg);
      if (ratio < 4.5) {
        throw new Error(
          `${name} hoverForeground ${hoverForeground} on ${hover}: ${ratio.toFixed(2)}:1 < 4.5:1`
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

    it(`${name}: primary text on light bg >= 3:1 (links/UI)`, () => {
      const ratio = contrastRatioRgb(theme, lightBg);
      if (ratio < 3.0) {
        throw new Error(
          `${name} ${primary} on light bg: ${ratio.toFixed(2)}:1 < 3:1`
        );
      }
    });
  }
});

describe("CodeMirror primary button contrast", () => {
  for (const [name, { primary, foreground }] of Object.entries(THEME_COLORS)) {
    it(`${name}: theme foreground on primary >= 4.5:1`, () => {
      const ratio = contrastRatioRgb(hexToRgb(foreground), hexToRgb(primary));
      if (ratio < 4.5) {
        throw new Error(
          `${name} theme foreground ${foreground} on ${primary}: ${ratio.toFixed(2)}:1 < 4.5:1`
        );
      }
    });
  }
});

describe("Label status chip contrast", () => {
  const reviewBg = hexToRgb("#f59e0b");
  const reviewFg = hexToRgb("#451a03");
  const finalBg = hexToRgb("#047857");
  const finalFg = hexToRgb("#ffffff");

  it("REVIEW chip: amber-950 on amber-500 >= 4.5:1", () => {
    const ratio = contrastRatioRgb(reviewFg, reviewBg);
    if (ratio < 4.5) {
      throw new Error(`REVIEW chip contrast ${ratio.toFixed(2)}:1 < 4.5:1`);
    }
  });

  it("REVIEW chip: black on amber-500 >= 4.5:1", () => {
    const ratio = contrastRatioRgb(hexToRgb("#000000"), reviewBg);
    if (ratio < 4.5) {
      throw new Error(
        `REVIEW chip black contrast ${ratio.toFixed(2)}:1 < 4.5:1`
      );
    }
  });

  it("FINAL chip: white on emerald-700 >= 4.5:1", () => {
    const ratio = contrastRatioRgb(finalFg, finalBg);
    if (ratio < 4.5) {
      throw new Error(`FINAL chip contrast ${ratio.toFixed(2)}:1 < 4.5:1`);
    }
  });
});

describe("Flow graph chrome contrast", () => {
  it("muted-foreground on canvas >= 4.5:1 in dark mode", () =>
    assertContrast("muted-foreground", "canvas", DARK_TOKENS, 4.5, "dark"));

  it("muted-foreground on canvas >= 4.5:1 in light mode", () =>
    assertContrast("muted-foreground", "canvas", LIGHT_TOKENS, 4.5, "light"));

  it("foreground on raised >= 4.5:1 in dark mode", () =>
    assertContrast("foreground", "raised", DARK_TOKENS, 4.5, "dark"));

  it("foreground on raised >= 4.5:1 in light mode", () =>
    assertContrast("foreground", "raised", LIGHT_TOKENS, 4.5, "light"));

  const darkCanvas = rgbFor(DARK_TOKENS, "canvas");
  const lightCanvas = rgbFor(LIGHT_TOKENS, "canvas");

  for (const [name, { primary }] of Object.entries(THEME_COLORS)) {
    const theme = hexToRgb(primary);

    it(`${name}: primary on canvas >= 3:1 in dark mode`, () => {
      const ratio = contrastRatioRgb(theme, darkCanvas);
      if (ratio < 3.0) {
        throw new Error(
          `${name} ${primary} on dark canvas: ${ratio.toFixed(2)}:1 < 3:1`
        );
      }
    });

    it(`${name}: primary on canvas >= 3:1 in light mode`, () => {
      const ratio = contrastRatioRgb(theme, lightCanvas);
      if (ratio < 3.0) {
        throw new Error(
          `${name} ${primary} on light canvas: ${ratio.toFixed(2)}:1 < 3:1`
        );
      }
    });
  }
});
