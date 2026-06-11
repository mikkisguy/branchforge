/**
 * FlowGraph - ReactFlow-based flow graph visualization for label routes
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeMouseHandler,
  MarkerType,
  BackgroundVariant,
} from "@xyflow/react";
import dagre from "dagre";
import "@xyflow/react/dist/style.css";
import { RotateCcw } from "lucide-react";
import { LabelNodeMemo, type LabelNodeData } from "./LabelNode";
import { useFlowGraph } from "@/hooks/useFlowGraph";
import { useFlowGraphLayout } from "@/hooks/useFlowGraphLayout";
import type { FlowNode, FlowEdge } from "@branchforge/shared";

interface FlowGraphProps {
  projectId: string;
  onNodeClick?: (labelId: string) => void;
}

const nodeTypes = {
  label: LabelNodeMemo,
};

// Route color palette for node borders
const ROUTE_COLORS = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#10b981", // green
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
];

function getRouteColor(
  routeKey: string | null,
  routeColorMap: Map<string, string>
): string {
  if (!routeKey) return "#64748b"; // slate-500 for unassigned
  const color = routeColorMap.get(routeKey);
  return color ?? "#64748b";
}

function buildRouteColorMap(nodes: FlowNode[]): Map<string, string> {
  const routes = new Set<string>();
  for (const node of nodes) {
    if (node.routeKey) routes.add(node.routeKey);
  }
  const map = new Map<string, string>();
  let i = 0;
  for (const route of routes) {
    map.set(route, ROUTE_COLORS[i % ROUTE_COLORS.length]);
    i++;
  }
  return map;
}

// Dagre-based hierarchical layout
function layoutNodes(
  flowNodes: FlowNode[],
  flowEdges: FlowEdge[],
  routeColorMap: Map<string, string>,
  savedPositions: Record<string, { x: number; y: number }>
): Node[] {
  const g = new dagre.graphlib.Graph();

  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "TB", // Top to bottom
    nodesep: 80, // Horizontal spacing between nodes
    ranksep: 120, // Vertical spacing between ranks
    edgesep: 40, // Spacing between edges
    marginx: 40,
    marginy: 40,
  });

  const nodeWidth = 240;
  const nodeHeight = 120;

  // Add nodes to dagre graph
  for (const node of flowNodes) {
    g.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  }

  // Add edges to dagre graph
  for (const edge of flowEdges) {
    g.setEdge(edge.source, edge.target);
  }

  // Run layout
  dagre.layout(g);

  // Convert dagre positions to ReactFlow nodes
  return flowNodes.map((node) => {
    const routeColor = getRouteColor(node.routeKey, routeColorMap);

    // Use saved position if available, otherwise use dagre position
    const savedPos = savedPositions[node.id];
    let position: { x: number; y: number };
    if (savedPos) {
      position = savedPos;
    } else {
      const dagreNode = g.node(node.id);
      position = {
        x: dagreNode.x - nodeWidth / 2,
        y: dagreNode.y - nodeHeight / 2,
      };
    }

    return {
      id: node.id,
      type: "label",
      position,
      data: {
        labelId: node.labelId,
        title: node.title,
        labelName: node.labelName,
        routeKey: node.routeKey,
        status: node.status,
        fileName: node.fileName,
        routeColor,
      },
      style: {
        borderLeft: `3px solid ${routeColor}`,
      },
    };
  });
}

function buildEdges(flowEdges: FlowEdge[]): Edge[] {
  return flowEdges.map((edge) => {
    const edgeStyle: Edge = {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: getEdgeColor(edge.type),
      },
      style: {
        stroke: getEdgeColor(edge.type),
        strokeWidth: getEdgeWidth(edge.type),
      },
      labelStyle: { fill: "#94a3b8", fontSize: 11 },
      animated: edge.type === "NATURAL",
    };
    return edgeStyle;
  });
}

function getEdgeColor(type: string): string {
  switch (type) {
    case "JUMP":
      return "#f59e0b"; // amber
    case "CHOICE":
      return "#3b82f6"; // blue
    case "NATURAL":
      return "#475569"; // slate-600
    default:
      return "#64748b";
  }
}

function getEdgeWidth(type: string): number {
  switch (type) {
    case "JUMP":
      return 2;
    case "CHOICE":
      return 2;
    case "NATURAL":
      return 1;
    default:
      return 1;
  }
}

function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  const ak = a as Record<string, unknown>;
  const bk = b as Record<string, unknown>;
  const aKeys = Object.keys(ak);
  if (aKeys.length !== Object.keys(bk).length) return false;
  for (const k of aKeys) {
    if (ak[k] !== bk[k]) return false;
  }
  return true;
}

function sameStyle(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  const ak = a as Record<string, unknown>;
  const bk = b as Record<string, unknown>;
  const aKeys = Object.keys(ak);
  if (aKeys.length !== Object.keys(bk).length) return false;
  for (const k of aKeys) {
    if (ak[k] !== bk[k]) return false;
  }
  return true;
}

export function FlowGraph({ projectId, onNodeClick }: FlowGraphProps) {
  const {
    nodes: flowNodes,
    edges: flowEdges,
    isLoading,
    error,
  } = useFlowGraph(projectId);

  const routeColorMap = useMemo(
    () => buildRouteColorMap(flowNodes),
    [flowNodes]
  );

  const {
    positions: savedPositions,
    handleNodeDragStop: handleLayoutDragStop,
    handleResetLayout,
    isSaving,
    isResetting,
  } = useFlowGraphLayout(projectId);

  const layoutNodesResult = useMemo(
    () => layoutNodes(flowNodes, flowEdges, routeColorMap, savedPositions),
    [flowNodes, flowEdges, routeColorMap, savedPositions]
  );

  const layoutEdgesResult = useMemo(() => buildEdges(flowEdges), [flowEdges]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const nodesRef = useRef(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const lastSyncedEdgesKey = useRef<string>("");

  useEffect(() => {
    setNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]));
      let changed = false;
      const next = layoutNodesResult.map((layoutNode) => {
        const existing = prevById.get(layoutNode.id);
        if (!existing) {
          changed = true;
          return layoutNode;
        }

        const posChanged =
          existing.position.x !== layoutNode.position.x ||
          existing.position.y !== layoutNode.position.y;
        const dataChanged = !sameData(existing.data, layoutNode.data);
        const styleChanged = !sameStyle(existing.style, layoutNode.style);

        if (!posChanged && !dataChanged && !styleChanged) {
          return existing;
        }
        changed = true;
        return {
          ...existing,
          position: layoutNode.position,
          data: layoutNode.data,
          style: layoutNode.style,
        };
      });

      if (!changed) return prev;
      return next;
    });
  }, [layoutNodesResult, setNodes]);

  useEffect(() => {
    const key = layoutEdgesResult.map((e) => e.id).join("|");
    if (key === lastSyncedEdgesKey.current) return;
    lastSyncedEdgesKey.current = key;
    setEdges(layoutEdgesResult);
  }, [layoutEdgesResult, setEdges]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node<LabelNodeData>) => {
      if (onNodeClick && node.data?.labelId) {
        onNodeClick(node.data.labelId);
      }
    },
    [onNodeClick]
  );

  const onNodeDragStop = useCallback(() => {
    const nodePositions: Record<string, { x: number; y: number }> = {};
    for (const node of nodesRef.current) {
      nodePositions[node.id] = { x: node.position.x, y: node.position.y };
    }
    handleLayoutDragStop(nodePositions);
  }, [handleLayoutDragStop]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        Loading flow graph...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-400">
        Failed to load flow graph: {error.message}
      </div>
    );
  }

  if (flowNodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <div className="text-center">
          <p className="text-lg font-medium mb-2">No labels found</p>
          <p className="text-sm">
            Add labels to your project to see the flow visualization.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full absolute inset-0">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick as NodeMouseHandler}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#334155"
        />
        <Controls className="!bg-slate-800 !border-slate-600 !rounded-lg" />
        <MiniMap
          className="!bg-slate-800 !border-slate-600 !rounded-lg"
          maskColor="rgba(15, 23, 42, 0.7)"
          nodeColor={(node) => {
            const data = node.data as { routeColor?: string };
            return data.routeColor ?? "#64748b";
          }}
        />
        <div className="absolute top-4 right-4 z-10">
          <button
            type="button"
            onClick={handleResetLayout}
            disabled={isSaving || isResetting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 border border-slate-600 rounded-lg hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Reset layout to auto-arrange"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Layout
          </button>
        </div>
      </ReactFlow>
    </div>
  );
}
