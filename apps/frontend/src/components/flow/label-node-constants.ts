/**
 * Status chip + dot palette for the LabelNode and its tooltip.
 *
 * Status chips use a fixed vivid slate/amber/green palette instead of
 * tints of the theme CSS vars. On the dark slate-800 node those tints
 * wash out and make the statuses look near-identical (an earlier pass
 * with /30 tints left DRAFT and FINAL indistinguishable). Solid fills
 * keep DRAFT (grey), REVIEW (amber) and FINAL (green) instantly
 * distinguishable; each text color is tuned for contrast against its
 * fill. FINAL green is the app-wide convention (--theme-final-color,
 * set in ThemeContext); the dot references that var directly, while the
 * badge uses a darker emerald-600 fill so light chip text stays legible.
 */
export const statusColors: Record<string, string> = {
  DRAFT: "bg-slate-500 text-slate-50 border-slate-400",
  REVIEW: "bg-amber-500 text-slate-950 border-amber-400",
  FINAL: "bg-emerald-600 text-slate-50 border-emerald-500",
};

export const statusDotColors: Record<string, string> = {
  DRAFT: "bg-slate-400",
  REVIEW: "bg-amber-500",
  FINAL: "bg-[var(--theme-final-color)]",
};

/** Hover delay before showing the tooltip (ms). */
export const TOOLTIP_DELAY_MS = 350;
export const TOOLTIP_ESTIMATED_WIDTH = 280;
export const VIEWPORT_PADDING = 8;
export const TOOLTIP_GAP = 10;
