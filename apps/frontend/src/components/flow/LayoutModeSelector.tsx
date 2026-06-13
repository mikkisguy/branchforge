/**
 * LayoutModeSelector Component
 *
 * Compact segmented control for switching the flow graph layout mode.
 * Three modes: Flow (dagre), Route (columns by routeKey), File (columns
 * by source file). Selection persists to localStorage and is shared across
 * projects — the user's preferred mode sticks.
 */

import {
  FLOW_LAYOUT_MODE_LABELS,
  type FlowLayoutMode,
} from "@branchforge/shared";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { GitBranch, Network, Route as RouteIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "flow:layout-mode";

const LAYOUT_MODES: ReadonlyArray<{
  value: FlowLayoutMode;
  label: string;
  icon: typeof Network;
}> = [
  { value: "FLOW", label: FLOW_LAYOUT_MODE_LABELS.FLOW, icon: Network },
  { value: "ROUTE", label: FLOW_LAYOUT_MODE_LABELS.ROUTE, icon: RouteIcon },
  { value: "FILE", label: FLOW_LAYOUT_MODE_LABELS.FILE, icon: GitBranch },
];

const DEFAULT_MODE: FlowLayoutMode = "FLOW";

function isFlowLayoutMode(value: string): value is FlowLayoutMode {
  return LAYOUT_MODES.some((mode) => mode.value === value);
}

export interface LayoutModeSelectorProps {
  /** Disable all controls (e.g. while layout is being saved/reset). */
  disabled?: boolean;
  className?: string;
  /**
   * Optional callback fired whenever the user picks a different mode. The
   * selector still writes to localStorage on its own; this hook lets the
   * parent re-derive state synchronously from the same write.
   */
  onChange?: (mode: FlowLayoutMode) => void;
}

/**
 * Layout mode selector for the flow graph. Renders as a segmented control
 * with one button per available mode. The selected mode is persisted to
 * localStorage so it survives reloads and re-opens of the flow dialog.
 */
export function LayoutModeSelector({
  disabled = false,
  className,
  onChange,
}: LayoutModeSelectorProps) {
  const [mode, setMode] = useLocalStorage<string>(STORAGE_KEY, DEFAULT_MODE, {
    validate: (value): value is FlowLayoutMode => isFlowLayoutMode(value),
  });

  // `mode` is typed as string from the hook, but our validator guarantees
  // it's a valid FlowLayoutMode (or the default fell back).
  const currentMode: FlowLayoutMode = isFlowLayoutMode(mode)
    ? mode
    : DEFAULT_MODE;

  const handleSelect = (next: FlowLayoutMode) => {
    setMode(next);
    onChange?.(next);
  };

  return (
    <div
      role="radiogroup"
      aria-label="Layout mode"
      className={cn(
        "inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-slate-600 bg-slate-800",
        disabled && "opacity-50",
        className
      )}
    >
      {LAYOUT_MODES.map(({ value, label, icon: Icon }) => {
        const isActive = currentMode === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={label}
            title={label}
            disabled={disabled}
            onClick={() => handleSelect(value)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
              isActive
                ? "bg-slate-600 text-white shadow-sm"
                : "text-slate-300 hover:text-white hover:bg-slate-700/60"
            )}
          >
            <Icon className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
