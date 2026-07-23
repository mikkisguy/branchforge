// Default excluded character tags (special Ren'Py characters)
export const DEFAULT_EXCLUDED_TAGS = ["n", "u", "narrator", "extend"] as const;
export type DefaultExcludedTag = (typeof DEFAULT_EXCLUDED_TAGS)[number];

/**
 * Regex for detecting Ren'Py variable interpolation expressions in strings.
 *
 * Known limitation: cannot tell the difference between a Ren'Py variable
 * interpolation (`"[player_name]"`) and a decorative bracket pair in a
 * literal string (`"[END]"`). Both are classified as `interpolated`.
 * The wizard's badge is informational; authors can override the display
 * name on import.
 */
export const INTERPOLATION_REGEX =
  /\[[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*\]/;

/** Ren'Py named color to hex mapping used by normalizeColor */
export const RENPY_NAMED_COLORS: Record<string, string> = {
  white: "#ffffff",
  black: "#000000",
  red: "#ff0000",
  green: "#00ff00",
  blue: "#0000ff",
  yellow: "#ffff00",
  cyan: "#00ffff",
  magenta: "#ff00ff",
};
