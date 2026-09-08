/**
 * FlowGraphToolbar - Layout mode selector + reset button for FlowGraph
 */

import { RotateCcw } from "lucide-react";
import { LayoutModeSelector } from "./LayoutModeSelector";
import { FLOW_LAYOUT_MODE_LABELS } from "@branchforge/shared";
import type { FlowLayoutMode } from "@branchforge/shared";

interface FlowGraphToolbarProps {
  layoutMode: FlowLayoutMode;
  isBusy: boolean;
  onLayoutModeChange: (mode: FlowLayoutMode) => void;
  onResetLayout: () => void;
}

export function FlowGraphToolbar({
  layoutMode,
  isBusy,
  onLayoutModeChange,
  onResetLayout,
}: FlowGraphToolbarProps) {
  return (
    <>
      <LayoutModeSelector disabled={isBusy} onChange={onLayoutModeChange} />
      <button
        type="button"
        onClick={onResetLayout}
        disabled={isBusy}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground bg-raised border border-border rounded-lg hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title={`Reset ${FLOW_LAYOUT_MODE_LABELS[layoutMode].toLowerCase()} positions to auto-arrange`}
        aria-label="Reset label positions to auto-arrange"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        Reset {FLOW_LAYOUT_MODE_LABELS[layoutMode]}
      </button>
    </>
  );
}
