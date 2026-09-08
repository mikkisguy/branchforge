/**
 * Flow graph edge builders / styling.
 */

import { MarkerType, type Edge } from "@xyflow/react";
import type { FlowEdge } from "@branchforge/shared";

const MUTED_EDGE_COLOR = "hsl(var(--muted-foreground))";

export function getEdgeColor(type: string): string {
  switch (type) {
    case "JUMP":
      return "#f59e0b"; // amber
    case "CHOICE":
      // The primary branching action — follow the active theme so the
      // graph's main interaction color matches the rest of the app.
      return "var(--theme-color)";
    case "NATURAL":
      return MUTED_EDGE_COLOR;
    default:
      return MUTED_EDGE_COLOR;
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
      labelStyle: { fill: "hsl(var(--muted-foreground))", fontSize: 11 },
      animated: false,
    };
    return edgeStyle;
  });
}
