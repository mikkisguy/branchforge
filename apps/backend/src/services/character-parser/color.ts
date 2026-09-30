import { RENPY_NAMED_COLORS } from "./constants.js";

/**
 * Normalize color string to hex format
 */
export function normalizeColor(color: string | undefined): string {
  if (!color) return "#cfcfcf"; // Default Ren'Py color

  // Expand shorthand for the import API's #RRGGBB contract.
  if (color.startsWith("#")) {
    if (/^#[0-9a-fA-F]{3}$/.test(color)) {
      return "#" + [...color.slice(1)].map((digit) => digit + digit).join("");
    }
    return color;
  }

  // Handle named colors (common Ren'Py colors)
  const normalized = RENPY_NAMED_COLORS[color.toLowerCase()];
  if (normalized) return normalized;

  // Try to extract hex from color string
  const hexMatch = color.match(/#[0-9a-fA-F]{6}/);
  if (hexMatch) return hexMatch[0];

  // Default color
  return "#cfcfcf";
}

/**
 * Extract color (who_color first, then color) from an options string.
 */
export function extractColor(options: string | undefined): string | undefined {
  if (!options) return undefined;
  const whoColorMatch = options.match(/who_color\s*=\s*["']?([^"')\s]+)/);
  if (whoColorMatch) return whoColorMatch[1];
  const colorMatch = options.match(/\bcolor\s*=\s*["']?([^"')\s]+)/);
  if (colorMatch) return colorMatch[1];
  return undefined;
}

/**
 * Canonicalize a color for comparison.
 *
 * - Lowercases hex strings.
 * - Expands 3-digit hex to 6-digit.
 * - Passes through named colors already normalized by `normalizeColor`.
 */
export function canonicalizeColor(color: string | undefined): string {
  return normalizeColor(color).toLowerCase();
}
