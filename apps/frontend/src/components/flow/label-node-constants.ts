/**
 * Status chip + dot palette for the LabelNode and its tooltip.
 *
 * Status chips use semantic tokens for DRAFT and fixed vivid palettes for
 * REVIEW/FINAL so statuses stay distinguishable on both light and dark
 * canvases. FINAL green follows the app-wide convention
 * (--theme-final-color, set in ThemeContext).
 */
export const statusColors: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground border-border",
  REVIEW: "bg-amber-500 text-amber-950 border-amber-400",
  FINAL: "bg-emerald-700 text-white border-emerald-600",
};

export const statusDotColors: Record<string, string> = {
  DRAFT: "bg-muted-foreground",
  REVIEW: "bg-amber-500",
  FINAL: "bg-[var(--theme-final-color)]",
};

/** Hover delay before showing the tooltip (ms). */
export const TOOLTIP_DELAY_MS = 350;
export const TOOLTIP_ESTIMATED_WIDTH = 280;
export const VIEWPORT_PADDING = 8;
export const TOOLTIP_GAP = 10;
