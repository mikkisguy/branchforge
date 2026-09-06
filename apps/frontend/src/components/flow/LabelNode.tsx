/**
 * LabelNode - Custom ReactFlow node for displaying label information.
 *
 * Includes a hover tooltip (portal-rendered) that shows label details:
 * title, status, character appearances, word count, route, and file name.
 */

import { memo, useCallback, useRef, useState, type ComponentType } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { LabelNodeTooltipPortal } from "./label-node-tooltip-portal";
import { NodeBody } from "./label-node-body";

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
  [key: string]: unknown;
}

export type LabelNodeType = Node<LabelNodeData, "label">;

/**
 * Custom ReactFlow node. Intentionally minimal: just the node body, handles,
 * and a hover flag. The tooltip (with its rAF loop, portal, and position
 * state) only mounts via {@link LabelNodeTooltipPortal} when this specific
 * node is hovered — keeping the per-node mount cost at 4 hooks instead of 11.
 */
function LabelNodeImpl({ data }: NodeProps<LabelNodeType>) {
  const [isHovered, setIsHovered] = useState(false);
  const nodeRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleMouseLeave = useCallback(() => setIsHovered(false), []);

  return (
    <>
      {/* This is a ReactFlow custom node — a <button> would break Handle
           composition. The role conveys the interactive nature (tooltip on
           focus/hover). */}
      {/* react-doctor-disable-next-line react-doctor/prefer-tag-over-role */}
      <div
        ref={nodeRef}
        role="button"
        tabIndex={0}
        onFocus={handleMouseEnter}
        onBlur={handleMouseLeave}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          "bg-raised border border-border rounded-lg shadow-lg min-w-[180px] max-w-[240px] transition-opacity duration-150",
          data.dimmed && "opacity-25",
          data.highlighted && "ring-2 ring-[var(--theme-color)]/70"
        )}
      >
        <Handle
          type="target"
          position={Position.Left}
          className="!bg-muted-foreground !w-2 !h-2"
        />
        <NodeBody data={data} />
        <Handle
          type="source"
          position={Position.Right}
          className="!bg-muted-foreground !w-2 !h-2"
        />
      </div>
      {isHovered && <LabelNodeTooltipPortal data={data} nodeRef={nodeRef} />}
    </>
  );
}

/**
 * The memoized node component exported for ReactFlow's `nodeTypes`.
 */
export const LabelNodeMemo: ComponentType<NodeProps<LabelNodeType>> =
  memo(LabelNodeImpl);
