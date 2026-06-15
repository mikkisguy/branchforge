/**
 * LabelNode - Custom ReactFlow node for displaying label information.
 *
 * Includes a hover tooltip (portal-rendered) that shows label details:
 * title, status, character appearances, word count, route, and file name.
 */

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { createPortal } from "react-dom";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { cn } from "@/lib/utils";

export interface CharacterAppearance {
  id: string;
  name: string;
  color: string;
  avatarUrl: string | null;
}

export interface LabelNodeData {
  labelId: string;
  title: string;
  labelName: string | null;
  routeKey: string | null;
  status: string | null;
  fileName: string;
  /**
   * `true` when this node does not satisfy the active filter set. The
   * component renders at reduced opacity to keep matching nodes visually
   * prominent (dim/highlight pattern).
   */
  dimmed?: boolean;
  /**
   * `true` when a search query is active AND this node matches it. Adds
   * a subtle ring so the user can spot hits at a glance.
   */
  highlighted?: boolean;
  /** Character IDs that speak in this label (from the FlowNode). */
  characterIds?: string[];
  /** Total word count across all label_lines for this label. */
  wordCount?: number;
  /**
   * Resolved character display info, injected by FlowGraph so the tooltip
   * can show names/colors without each node re-fetching. Stable reference
   * (from a useMemo in FlowGraph) so the data-equality check in the sync
   * effect doesn't thrash on every render.
   */
  characters?: CharacterAppearance[];
  [key: string]: unknown;
}

export type LabelNodeType = Node<LabelNodeData, "label">;

// Status chips use a fixed vivid slate/amber/green palette instead of
// tints of the theme CSS vars. On the dark slate-800 node those tints
// wash out and make the statuses look near-identical (an earlier pass
// with /30 tints left DRAFT and FINAL indistinguishable). Solid fills
// keep DRAFT (grey), REVIEW (amber) and FINAL (green) instantly
// distinguishable; each text color is tuned for contrast against its
// fill. FINAL green is the app-wide convention (--theme-final-color,
// set in ThemeContext); the dot references that var directly, while the
// badge uses a darker emerald-600 fill so light chip text stays legible.
const statusColors: Record<string, string> = {
  DRAFT: "bg-slate-500 text-slate-50 border-slate-400",
  REVIEW: "bg-amber-500 text-slate-950 border-amber-400",
  FINAL: "bg-emerald-600 text-slate-50 border-emerald-500",
};

const statusDotColors: Record<string, string> = {
  DRAFT: "bg-slate-400",
  REVIEW: "bg-amber-500",
  FINAL: "bg-[var(--theme-final-color)]",
};

// ─── Tooltip constants ────────────────────────────────────────────────────

/** Hover delay before showing the tooltip (ms). */
const TOOLTIP_DELAY_MS = 350;
const TOOLTIP_ESTIMATED_WIDTH = 280;
const VIEWPORT_PADDING = 8;
const TOOLTIP_GAP = 10;

// ─── Node body (shared between node and tooltip) ──────────────────────────

function NodeBody({ data }: { data: LabelNodeData }) {
  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2 mb-1">
        {data.status && (
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              statusDotColors[data.status] ?? ""
            }`}
          />
        )}
        <span className="text-sm font-medium text-slate-100 truncate">
          {data.title}
        </span>
      </div>
      {data.labelName && (
        <div className="text-xs text-slate-400 truncate font-mono">
          {data.labelName}
        </div>
      )}
      <div className="flex items-center gap-2 mt-1">
        {data.routeKey && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
            {data.routeKey}
          </span>
        )}
        {data.status && (
          <span
            className={`text-xs px-1.5 py-0.5 rounded border ${
              statusColors[data.status] ?? ""
            }`}
          >
            {data.status}
          </span>
        )}
      </div>
      <div className="text-xs text-slate-500 mt-1 truncate">
        {data.fileName}
      </div>
    </div>
  );
}

// ─── Tooltip panel ────────────────────────────────────────────────────────

function TooltipRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2 py-0.5">
      <span className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase w-20 shrink-0">
        {label}
      </span>
      <span className="flex-1 min-w-0">{children}</span>
    </div>
  );
}

function LabelTooltipContent({ data }: { data: LabelNodeData }) {
  const characters = data.characters ?? [];
  const wordCount = data.wordCount ?? 0;

  return (
    <>
      {/* Header: status dot + title + status badge */}
      <div className="flex items-center gap-2 mb-2">
        {data.status && (
          <span
            className={`inline-block w-2 h-2 rounded-full shrink-0 ${
              statusDotColors[data.status] ?? ""
            }`}
          />
        )}
        <span className="text-sm font-semibold text-slate-100 truncate flex-1">
          {data.title}
        </span>
        {data.status && (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${
              statusColors[data.status] ?? ""
            }`}
          >
            {data.status}
          </span>
        )}
      </div>

      {/* Character appearances */}
      <TooltipRow label="Characters">
        {characters.length > 0 ? (
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {characters.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 text-slate-300"
              >
                {c.avatarUrl ? (
                  <img
                    src={c.avatarUrl}
                    alt=""
                    className="w-4 h-4 rounded-full object-cover"
                  />
                ) : (
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ backgroundColor: c.color }}
                  />
                )}
                {c.name}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-slate-500 italic">None</span>
        )}
      </TooltipRow>

      {/* Word count */}
      <TooltipRow label="Words">
        <span className="text-slate-300 tabular-nums">
          {wordCount.toLocaleString()}
        </span>
      </TooltipRow>

      {/* Route affiliation */}
      <TooltipRow label="Route">
        <span className="text-slate-300">{data.routeKey ?? "Unassigned"}</span>
      </TooltipRow>

      {/* File name */}
      <TooltipRow label="File">
        <span className="text-slate-400 font-mono text-[11px]">
          {data.fileName}
        </span>
      </TooltipRow>
    </>
  );
}

// ─── Node component (with hover tooltip) ──────────────────────────────────

/**
 * Portal-rendered hover tooltip for LabelNode. Shows on hover (after a
 * small delay), hides on mouse leave. Positioned below the node (or above
 * if near the bottom edge), clamped horizontally to the viewport.
 *
 * The tooltip tracks the node element's screen position via a rAF loop so
 * it stays glued to the node even if the ReactFlow canvas is panned/zoomed.
 */
function LabelNodeTooltip({ data }: NodeProps<LabelNodeType>) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [portalContainer, setPortalContainer] = useState<Element>(
    () => document.body
  );
  const nodeRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setNodeRef = useCallback((el: HTMLDivElement | null) => {
    nodeRef.current = el;
    if (el) {
      const dialog = el.closest("dialog");
      if (dialog) setPortalContainer(dialog);
    }
  }, []);

  // Continuously sync the tooltip's screen position to the node's bounding
  // rect so panning / zooming the canvas keeps the tooltip aligned.
  const syncPosition = useCallback(() => {
    const el = nodeRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();

    let left = rect.left + rect.width / 2 - TOOLTIP_ESTIMATED_WIDTH / 2;
    left = Math.max(
      VIEWPORT_PADDING,
      Math.min(
        left,
        window.innerWidth - TOOLTIP_ESTIMATED_WIDTH - VIEWPORT_PADDING
      )
    );

    let top = rect.bottom + TOOLTIP_GAP;
    // Flip above if there's no room below (generous height estimate).
    if (top + 220 > window.innerHeight) {
      top = Math.max(VIEWPORT_PADDING, rect.top - TOOLTIP_GAP - 220);
    }

    setPosition((prev) => {
      if (prev.top === top && prev.left === left) return prev;
      return { top, left };
    });
  }, []);

  // rAF loop — only active while visible — keeps position in sync.
  // react-doctor-disable-next-line react-doctor/prefer-use-effect-event
  // react-doctor-disable-next-line react-doctor/no-cascading-set-state
  useEffect(() => {
    if (!visible) return;
    let rafId: number;
    const tick = () => {
      syncPosition();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [visible, syncPosition]);

  const handleMouseEnter = useCallback(() => {
    timerRef.current = setTimeout(() => {
      // Compute position synchronously before showing so the tooltip
      // never flashes at {0,0}. Both setState calls are batched in the
      // same tick (React 18 automatic batching in timers).
      syncPosition();
      setVisible(true);
    }, TOOLTIP_DELAY_MS);
  }, [syncPosition]);

  const handleMouseLeave = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(false);
  }, []);

  // react-doctor-disable-next-line react-doctor/exhaustive-deps
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [timerRef]);

  return (
    <>
      {/* This is a ReactFlow custom node — a <button> would break Handle
           composition. The role conveys the interactive nature (tooltip on
           focus/hover). */}
      {/* react-doctor-disable-next-line react-doctor/prefer-tag-over-role */}
      <div
        ref={setNodeRef}
        role="button"
        tabIndex={0}
        onFocus={handleMouseEnter}
        onBlur={handleMouseLeave}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          "bg-slate-800 border border-slate-600 rounded-lg shadow-lg min-w-[180px] max-w-[240px] transition-opacity duration-150",
          data.dimmed && "opacity-25",
          data.highlighted && "ring-2 ring-[var(--theme-color)]/70"
        )}
      >
        <Handle
          type="target"
          position={Position.Left}
          className="!bg-slate-400 !w-2 !h-2"
        />
        <NodeBody data={data} />
        <Handle
          type="source"
          position={Position.Right}
          className="!bg-slate-400 !w-2 !h-2"
        />
      </div>
      {visible &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: "fixed",
              top: position.top,
              left: position.left,
              width: TOOLTIP_ESTIMATED_WIDTH,
            }}
            className="z-[100] rounded-lg border border-slate-600 bg-slate-900/95 backdrop-blur-sm px-3 py-2.5 text-xs text-slate-200 shadow-xl shadow-black/40 ring-1 ring-white/5 pointer-events-none"
          >
            <LabelTooltipContent data={data} />
          </div>,
          portalContainer
        )}
    </>
  );
}

/**
 * The memoized node component exported for ReactFlow's `nodeTypes`.
 */
export const LabelNodeMemo: ComponentType<NodeProps<LabelNodeType>> =
  memo(LabelNodeTooltip);
