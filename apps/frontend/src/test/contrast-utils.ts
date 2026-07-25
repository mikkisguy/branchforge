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

// ---------------------------------------------------------------------------
// Luminance and contrast
// ---------------------------------------------------------------------------

/** Linearize a single sRGB channel. */
function linearize(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance. */
function relativeLuminance(rgb: RGB): number {
  return (
    0.2126 * linearize(rgb.r) +
    0.7152 * linearize(rgb.g) +
    0.0722 * linearize(rgb.b)
  );
}

/** WCAG contrast ratio between two luminances. Lighter must be first arg. */
function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Contrast ratio between two RGB colors. */
export function contrastRatioRgb(a: RGB, b: RGB): number {
  return contrastRatio(relativeLuminance(a), relativeLuminance(b));
}
