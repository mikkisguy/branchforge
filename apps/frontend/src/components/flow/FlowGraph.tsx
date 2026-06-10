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
import { LabelNodeMemo, type LabelNodeData } from "./LabelNode";
import { useFlowGraph } from "@/hooks/useFlowGraph";
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
  routeColorMap: Map<string, string>
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
    const dagreNode = g.node(node.id);
    const routeColor = getRouteColor(node.routeKey, routeColorMap);

    return {
      id: node.id,
      type: "label",
      position: {
        x: dagreNode.x - nodeWidth / 2,
        y: dagreNode.y - nodeHeight / 2,
      },
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

  const layoutNodesResult = useMemo(
    () => layoutNodes(flowNodes, flowEdges, routeColorMap),
    [flowNodes, flowEdges, routeColorMap]
  );

  const layoutEdgesResult = useMemo(() => buildEdges(flowEdges), [flowEdges]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const lastSyncedNodesKey = useRef<string>("");
  const lastSyncedEdgesKey = useRef<string>("");

  useEffect(() => {
    const key = layoutNodesResult.map((n) => n.id).join("|");
    if (key === lastSyncedNodesKey.current) return;
    lastSyncedNodesKey.current = key;

    setNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]));
      return layoutNodesResult.map((next) => {
        const existing = prevById.get(next.id);
        if (existing) {
          return { ...existing, data: next.data, style: next.style };
        }
        return next;
      });
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
      </ReactFlow>
    </div>
  );
}
