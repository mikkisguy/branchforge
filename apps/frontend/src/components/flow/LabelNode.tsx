/**
 * LabelNode - Custom ReactFlow node for displaying label information
 */

import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { cn } from "@/lib/utils";

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
  [key: string]: unknown;
}

export type LabelNodeType = Node<LabelNodeData, "label">;

const statusColors: Record<string, string> = {
  DRAFT: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  REVIEW: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  FINAL: "bg-green-500/20 text-green-400 border-green-500/30",
};

const statusDotColors: Record<string, string> = {
  DRAFT: "bg-yellow-400",
  REVIEW: "bg-blue-400",
  FINAL: "bg-green-400",
};

function LabelNodeComponent({ data }: NodeProps<LabelNodeType>) {
  const statusClass = data.status ? (statusColors[data.status] ?? "") : "";
  const dotClass = data.status ? (statusDotColors[data.status] ?? "") : "";

  return (
    <div
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
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 mb-1">
          {data.status && (
            <span className={`inline-block w-2 h-2 rounded-full ${dotClass}`} />
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
              className={`text-xs px-1.5 py-0.5 rounded border ${statusClass}`}
            >
              {data.status}
            </span>
          )}
        </div>
        <div className="text-xs text-slate-500 mt-1 truncate">
          {data.fileName}
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-slate-400 !w-2 !h-2"
      />
    </div>
  );
}

export const LabelNodeMemo = memo(LabelNodeComponent);
