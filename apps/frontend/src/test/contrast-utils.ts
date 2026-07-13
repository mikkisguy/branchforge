/**
 * WCAG contrast ratio calculation utilities.
 *
 * Computes contrast ratios for pairs of HSL/RGB colors and validates
 * against WCAG AA thresholds:
 *   - 4.5:1 for normal text
 *   - 3:1 for large text / UI components
 */

// ---------------------------------------------------------------------------
// HSL parsing
// ---------------------------------------------------------------------------

export interface HSL {
  h: number;
  s: number; // 0-100
  l: number; // 0-100
}

/** Parse "h s% l%" or "h, s%, l%" format (supports decimal values). */
export function parseHSLTuple(str: string): HSL {
  const match = str.match(
    /(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/
  );
  if (!match) throw new Error(`Invalid HSL tuple: "${str}"`);
  return {
    h: parseFloat(match[1]),
    s: parseFloat(match[2]),
    l: parseFloat(match[3]),
  };
}

/** Parse "hsl(h, s%, l%)" format */
export function parseHSL(str: string): HSL {
  const match = str.match(/hsl\(\s*(\d+)\s*[,]\s*(\d+)%\s*[,]\s*(\d+)%\s*\)/);
  if (match) {
    return {
      h: parseFloat(match[1]),
      s: parseFloat(match[2]),
      l: parseFloat(match[3]),
    };
  }
  return parseHSLTuple(str);
}

// ---------------------------------------------------------------------------
// Color conversion
// ---------------------------------------------------------------------------

export interface RGB {
  r: number; // 0-255
  g: number;
  b: number;
}

/** Convert HSL to RGB. Algorithm from CSS Color Module Level 4. */
export function hslToRgb(hsl: HSL): RGB {
  const h = ((hsl.h % 360) + 360) % 360;
  const s = hsl.s / 100;
  const l = hsl.l / 100;

  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }

  const hueToRgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hNorm = h / 360;

  return {
    r: Math.round(hueToRgb(p, q, hNorm + 1 / 3) * 255),
    g: Math.round(hueToRgb(p, q, hNorm) * 255),
    b: Math.round(hueToRgb(p, q, hNorm - 1 / 3) * 255),
  };
}

/** Hex string (e.g. "#3d4ac2") to RGB */
export function hexToRgb(hex: string): RGB {
  const clean = hex.replace(/^#/, "");
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
}

/** Parse "rgba(r, g, b, a)" string to RGB */
export function rgbaToRgb(rgba: string): RGB {
  const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) throw new Error(`Invalid rgba: "${rgba}"`);
  return {
    r: parseInt(match[1]),
    g: parseInt(match[2]),
    b: parseInt(match[3]),
  };
}

// ---------------------------------------------------------------------------
// Luminance and contrast
// ---------------------------------------------------------------------------

/** Linearize a single sRGB channel. */
function linearize(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance. */
export function relativeLuminance(rgb: RGB): number {
  return (
    0.2126 * linearize(rgb.r) +
    0.7152 * linearize(rgb.g) +
    0.0722 * linearize(rgb.b)
  );
}

/** WCAG contrast ratio between two luminances. Lighter must be first arg. */
export function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Contrast ratio between two RGB colors. */
export function contrastRatioRgb(a: RGB, b: RGB): number {
  return contrastRatio(relativeLuminance(a), relativeLuminance(b));
}

/** Contrast ratio on a background color, for a foreground expressed as an HSL tuple string. */
export function contrastOnBg(
  bg: { r: number; g: number; b: number },
  fgHslTuple: string
): number {
  const fgRgb = hslToRgb(parseHSLTuple(fgHslTuple));
  return contrastRatioRgb(fgRgb, bg);
}

// ---------------------------------------------------------------------------
// WCAG thresholds
// ---------------------------------------------------------------------------

export const WCAG_AA_NORMAL = 4.5;
export const WCAG_AA_LARGE = 3.0;

export interface ContrastCheck {
  pair: string; // "foreground / background"
  fg: string; // foreground token name
  bg: string; // background token name
  ratio: number;
  passes: boolean;
}

/** Check foreground/background pairs and return a report. */
export function checkPairs(
  bgToken: string,
  bgRgb: RGB,
  pairs: { token: string; hslTuple: string; threshold: number }[],
  _mode: string
): ContrastCheck[] {
  return pairs.map(({ token, hslTuple, threshold }) => {
    const fgRgb = hslToRgb(parseHSLTuple(hslTuple));
    const ratio = contrastRatioRgb(fgRgb, bgRgb);
    return {
      pair: `${token} / ${bgToken}`,
      fg: token,
      bg: bgToken,
      ratio: Math.round(ratio * 100) / 100,
      passes: ratio >= threshold,
    };
  });
}
