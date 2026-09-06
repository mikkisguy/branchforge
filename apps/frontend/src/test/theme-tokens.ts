/**
 * Shared CSS token definitions for dark/light modes.
 *
 * Imported by both axe-helper.tsx (CSS variable presets) and
 * contrast-tokens.test.ts (token-level contrast verification)
 * so values cannot diverge from each other or the CSS source.
 */

/** Dark-mode design tokens (HSL triplets for CS variables). */
export const DARK_TOKENS: Record<string, string> = {
  background: "0 0% 6%",
  foreground: "0 0% 95%",
  card: "0 0% 8%",
  "card-foreground": "0 0% 95%",
  canvas: "0 0% 5%",
  "canvas-foreground": "0 0% 95%",
  panel: "0 0% 8%",
  "panel-foreground": "0 0% 95%",
  raised: "0 0% 11%",
  "raised-foreground": "0 0% 95%",
  popover: "0 0% 10%",
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

/** Light-mode design tokens (HSL triplets for CS variables). */
export const LIGHT_TOKENS: Record<string, string> = {
  background: "220 20% 97%",
  foreground: "222 47% 11%",
  card: "220 25% 99%",
  "card-foreground": "222 47% 11%",
  canvas: "220 18% 96%",
  "canvas-foreground": "222 47% 11%",
  panel: "220 25% 99%",
  "panel-foreground": "222 47% 11%",
  raised: "0 0% 100%",
  "raised-foreground": "222 47% 11%",
  popover: "220 30% 100%",
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

/** Convert design tokens to CSS variable presets (--prefix keys). */
export function tokensToVars(
  tokens: Record<string, string>
): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [name, value] of Object.entries(tokens)) {
    vars[`--${name}`] = value;
  }
  return vars;
}
