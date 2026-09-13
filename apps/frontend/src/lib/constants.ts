import type { ThemePalette } from "@/contexts/ThemeContext";

/** Normalize configured base URL for consistent route concatenation. */
export function normalizeBaseUrl(url: string): string {
  if (!url || url === "/") {
    return "/";
  }
  const withLeadingSlash = url.startsWith("/") ? url : `/${url}`;
  return withLeadingSlash.endsWith("/")
    ? withLeadingSlash
    : `${withLeadingSlash}/`;
}

export const BASE_URL = normalizeBaseUrl(
  import.meta.env.VITE_FRONTEND_BASE_URL ?? "/"
);

// ─── Flow graph performance tuning ──────────────────────────────────────────
//
// Thresholds that switch the flow graph into a "large project" mode so it
// stays responsive past 100+ labels (see issue #195).

/**
 * Number of nodes above which the MiniMap is hidden. The minimap renders a
 * rectangle per node and becomes both illegible and a measurable cost once
 * the canvas is densely packed.
 */
export const FLOW_MINIMAP_HIDE_THRESHOLD = 200;

/**
 * Number of nodes above which viewport virtualization
 * (`onlyRenderVisibleElements`) is enabled. Below this threshold every node
 * stays mounted at all times — cheaper than the mount/unmount churn that
 * ReactFlow's virtualization triggers when nodes cross the viewport boundary
 * during panning. Above it, the constant cost of N DOM elements outweighs the
 * periodic boundary-crossing cost, so virtualization becomes a net win.
 */
export const FLOW_VIRTUALIZATION_THRESHOLD = 300;

/**
 * Debounce window (ms) for the flow-graph search field. Keeps the text input
 * responsive while collapsing the O(n) filter + view-state recomputation into
 * a single pass after the user stops typing.
 */
export const FLOW_SEARCH_DEBOUNCE_MS = 200;

export const themePalettes: {
  name: string;
  key: ThemePalette;
  color: string;
}[] = [
  { name: "Forest", key: "forest", color: "#26714e" },
  { name: "Periwinkle", key: "periwinkle", color: "#5b6ae0" },
  { name: "Dark Amethyst", key: "dark-amethyst", color: "#9549b6" },
  { name: "Graphite", key: "graphite", color: "#686a71" },
];
