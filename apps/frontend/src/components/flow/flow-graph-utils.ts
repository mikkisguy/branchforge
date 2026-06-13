/**
 * Flow graph utility functions extracted from FlowGraph component
 */

import dagre from "dagre";
import { MarkerType, type Node, type Edge } from "@xyflow/react";
import type {
  FlowLayoutMode,
  FlowNode,
  FlowEdge,
  FlowGraphPositions,
} from "@branchforge/shared";

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

// Node dimensions used by all layout algorithms. Kept in sync with the
// `LabelNode` component's intrinsic size.
const NODE_WIDTH = 240;
const NODE_HEIGHT = 120;

// Spacing for row-based layouts (ROUTE, FILE).
//
// Each group (route / file) is a horizontal band: groups stack top-to-bottom
// (y = row index), and nodes within a group sit side-by-side (x = column
// index). This keeps the natural reading order ("name the group, scan its
// labels left to right") and matches the FLOW view, which also flows
// left-to-right.
const NODE_GAP_X = 80; // horizontal gap between nodes within a row
const ROW_GAP_Y = 160; // vertical gap between rows (node height + padding)

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

/**
 * Build the ReactFlow node envelope (data, style) shared by every layout
 * mode. The caller supplies the position.
 */
function buildReactFlowNode(
  flowNode: FlowNode,
  position: { x: number; y: number },
  routeColor: string
): Node {
  return {
    id: flowNode.id,
    type: "label",
    position,
    data: {
      labelId: flowNode.labelId,
      title: flowNode.title,
      labelName: flowNode.labelName,
      routeKey: flowNode.routeKey,
      status: flowNode.status,
      fileName: flowNode.fileName,
      routeColor,
    },
    style: {
      borderLeft: `3px solid ${routeColor}`,
    },
  };
}

/**
 * Group nodes into rows keyed by the provided key extractor. Within each
 * row, nodes are sorted by `sequenceOrder` (then by id for stability).
 *
 * Returns the row keys in a stable order: keys appear in the order they
 * are first encountered in `nodes`, except for `null`/empty keys which are
 * always placed first (used as the "common" / "unassigned" row).
 */
function groupNodesIntoRows<K extends string | null>(
  nodes: FlowNode[],
  keyOf: (node: FlowNode) => K
): K[] {
  const encountered: K[] = [];
  const seen = new Set<K>();
  const nullishKey = null as unknown as K;

  for (const node of nodes) {
    const key = keyOf(node);
    if (key === null || key === ("" as K)) {
      if (!seen.has(nullishKey)) {
        seen.add(nullishKey);
        encountered.push(nullishKey);
      }
      continue;
    }
    if (!seen.has(key)) {
      seen.add(key);
      encountered.push(key);
    }
  }

  // Put the "unassigned"/null row first so it reads as the common/shared
  // lane; remaining rows keep first-seen order.
  return encountered;
}

/**
 * Compute positions for a row-based layout. Nodes sharing the same row key
 * sit side-by-side horizontally; rows are laid out top-to-bottom.
 */
function layoutRows<K extends string | null>(
  flowNodes: FlowNode[],
  keyOf: (node: FlowNode) => K,
  sortRows?: (keys: K[]) => K[]
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

  const rowKeysRaw = groupNodesIntoRows(flowNodes, keyOf);
  const rowKeys = sortRows ? sortRows(rowKeysRaw) : rowKeysRaw;

  // Group nodes by row, sorted by sequenceOrder then id for stability.
  const byRow = new Map<K, FlowNode[]>();
  for (const key of rowKeys) {
    byRow.set(key, []);
  }
  for (const node of flowNodes) {
    // Normalize the key the same way `groupNodesIntoRows` does (empty string
    // is treated as the nullish sentinel) so a node whose raw key is ""
    // lands in the pre-seeded nullish bucket instead of being dropped (and
    // then silently falling back to { x: 0, y: 0 } downstream).
    let key = keyOf(node);
    if (key === ("" as K) || key === (null as unknown as K)) {
      key = null as unknown as K;
    }
    byRow.get(key)?.push(node);
  }
  for (const list of byRow.values()) {
    list.sort((a, b) => {
      if (a.sequenceOrder !== b.sequenceOrder) {
        return a.sequenceOrder - b.sequenceOrder;
      }
      return a.id.localeCompare(b.id);
    });
  }

  rowKeys.forEach((key, rowIndex) => {
    const rowNodes = byRow.get(key) ?? [];
    const y = rowIndex * ROW_GAP_Y;
    rowNodes.forEach((node, columnIndex) => {
      const x = columnIndex * (NODE_WIDTH + NODE_GAP_X);
      positions.set(node.id, { x, y });
    });
  });

  return positions;
}

/**
 * Dagre-based hierarchical layout. Left-to-right, based on graph edges.
 */
function layoutFlow(
  flowNodes: FlowNode[],
  flowEdges: FlowEdge[]
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  if (flowNodes.length === 0) return positions;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "LR", // Left to right
    nodesep: 80, // Horizontal spacing between nodes
    ranksep: 120, // Vertical spacing between ranks
    edgesep: 40, // Spacing between edges
    marginx: 40,
    marginy: 40,
  });

  for (const node of flowNodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of flowEdges) {
    g.setEdge(edge.source, edge.target);
  }
  dagre.layout(g);

  for (const node of flowNodes) {
    const dagreNode = g.node(node.id);
    positions.set(node.id, {
      x: dagreNode.x - NODE_WIDTH / 2,
      y: dagreNode.y - NODE_HEIGHT / 2,
    });
  }
  return positions;
}

/**
 * Compute the auto-layout positions for the requested mode. Saved positions
 * (i.e. the user's manual drags) are layered on top of the auto layout
 * downstream, so this function ignores them.
 */
function isNullishRowKey<K>(key: K): boolean {
  return key === null || key === undefined || key === "";
}

function sortRowsNullishFirst<K>(keys: K[]): K[] {
  return [...keys].sort((a, b) => {
    const aNull = isNullishRowKey(a);
    const bNull = isNullishRowKey(b);
    if (aNull && !bNull) return -1;
    if (!aNull && bNull) return 1;
    if (aNull && bNull) return 0;
    return String(a).localeCompare(String(b));
  });
}

function computeAutoLayout(
  mode: FlowLayoutMode,
  flowNodes: FlowNode[],
  flowEdges: FlowEdge[]
): Map<string, { x: number; y: number }> {
  switch (mode) {
    case "FLOW":
      return layoutFlow(flowNodes, flowEdges);
    case "ROUTE":
      return layoutRows(
        flowNodes,
        (n: FlowNode) => n.routeKey,
        sortRowsNullishFirst
      );
    case "FILE":
      return layoutRows(
        flowNodes,
        (n: FlowNode) => (n.fileName || "") as string,
        sortRowsNullishFirst
      );
    default: {
      // Exhaustiveness check: FlowLayoutMode is a closed union.
      const _exhaustive: never = mode;
      void _exhaustive;
      return layoutFlow(flowNodes, flowEdges);
    }
  }
}

/**
 * Build ReactFlow nodes for the requested layout mode.
 *
 * The active mode decides how auto-layout positions are computed (dagre for
 * `FLOW`, column-grouped for `ROUTE` and `FILE`). Saved positions — i.e. the
 * user's manual drags — always win over the auto layout, regardless of the
 * mode. This means switching modes preserves the user's deliberate moves
 * while recomputing the position of any node that was only placed by the
 * previous auto-layout.
 */
export function layoutNodes(
  flowNodes: FlowNode[],
  flowEdges: FlowEdge[],
  routeColorMap: Map<string, string>,
  savedPositions: FlowGraphPositions,
  mode: FlowLayoutMode = "FLOW"
): Node[] {
  const autoLayout = computeAutoLayout(mode, flowNodes, flowEdges);

  return flowNodes.map((node) => {
    const routeColor = getRouteColor(node.routeKey, routeColorMap);
    const saved = savedPositions[node.id];
    const auto = autoLayout.get(node.id) ?? { x: 0, y: 0 };
    const position = saved ?? auto;

    return buildReactFlowNode(node, position, routeColor);
  });
}
