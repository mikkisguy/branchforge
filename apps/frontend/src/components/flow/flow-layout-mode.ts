/**
 * Shared constants and helpers for the flow graph layout mode.
 *
 * Centralizes the canonical list of layout modes, the localStorage key
 * used to persist the user's selection, and the type guard for runtime
 * validation. Both `FlowGraph` and `LayoutModeSelector` import from here
 * so they can never drift on what counts as a valid mode.
 */

import type { FlowLayoutMode } from "@branchforge/shared";

export const LAYOUT_MODE_STORAGE_KEY = "flow:layout-mode";

export const LAYOUT_MODES: readonly FlowLayoutMode[] = [
  "FLOW",
  "ROUTE",
  "FILE",
];

export function isFlowLayoutMode(value: string): value is FlowLayoutMode {
  return (LAYOUT_MODES as readonly string[]).includes(value);
}
