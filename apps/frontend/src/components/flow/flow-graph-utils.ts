/**
 * Flow graph utility functions extracted from FlowGraph component
 */

import dagre from "dagre";
import { MarkerType, type Node, type Edge } from "@xyflow/react";
import type { FlowNode, FlowEdge } from "@branchforge/shared";

// Route color palette for node borders
export const ROUTE_COLORS = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#10b981", // green
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
];

export function getRouteColor(
  routeKey: string | null,
  routeColorMap: Map<string, string>
): string {
  if (!routeKey) return "#64748b"; // slate-500 for unassigned
  const color = routeColorMap.get(routeKey);
  return color ?? "#64748b";
}

export function buildRouteColorMap(nodes: FlowNode[]): Map<string, string> {
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

export function getEdgeColor(type: string): string {
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

export function getEdgeWidth(type: string): number {
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

export function buildEdges(flowEdges: FlowEdge[]): Edge[] {
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

// Dagre-based hierarchical layout
export function layoutNodes(
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
