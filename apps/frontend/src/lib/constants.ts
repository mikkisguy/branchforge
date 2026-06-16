import type { ThemePalette } from "@/contexts/ThemeContext";

export const BASE_URL = import.meta.env.VITE_FRONTEND_BASE_URL ?? "/";

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
  { name: "Forest", key: "forest", color: "#40bb82" },
  { name: "Periwinkle", key: "periwinkle", color: "#3d4ac2" },
  { name: "Dark Amethyst", key: "dark-amethyst", color: "#9549b6" },
  { name: "Graphite", key: "graphite", color: "#9ca3af" },
];
