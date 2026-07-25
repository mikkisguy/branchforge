/**
 * Web Worker for computing flow graph layouts off the main thread.
 *
 * For large graphs (300+ nodes) dagre's network-simplex rank assignment
 * takes multiple seconds. Running it in a worker keeps the main thread
 * responsive so the browser can paint a loading indicator and doesn't
 * show an "unresponsive page" warning.
 *
 * The worker receives `{ mode, nodes, edges }` and returns a plain
 * `Record<string, { x, y }>` of positions (structured-clone friendly).
 */

/// <reference lib="webworker" />

import dagre from "dagre";
import type { FlowLayoutMode, FlowNode, FlowEdge } from "@branchforge/shared";

// Node dimensions — kept in sync with flow-graph-utils.ts and LabelNode.
const NODE_WIDTH = 240;
const NODE_HEIGHT = 120;
const NODE_GAP_X = 80;
const ROW_GAP_Y = 160;

// ── FLOW layout (dagre) ──────────────────────────────────────────────

function layoutFlow(
  nodes: FlowNode[],
  edges: FlowEdge[]
): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  if (nodes.length === 0) return positions;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "LR",
    ranker: "tight-tree", // ~3-4x faster than default network-simplex
    nodesep: 80,
    ranksep: 120,
    edgesep: 40,
    marginx: 40,
    marginy: 40,
  });

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }
  dagre.layout(g);

  for (const node of nodes) {
    const dn = g.node(node.id);
    positions[node.id] = {
      x: dn.x - NODE_WIDTH / 2,
      y: dn.y - NODE_HEIGHT / 2,
    };
  }
  return positions;
}

// ── ROW layout (ROUTE / FILE) ────────────────────────────────────────

function isNullishKey(key: string | null | undefined): boolean {
  return key === null || key === undefined || key === "";
}

function sortRowsNullishFirst(keys: string[]): string[] {
  return keys.toSorted((a, b) => {
    const aNull = isNullishKey(a);
    const bNull = isNullishKey(b);
    if (aNull && !bNull) return -1;
    if (!aNull && bNull) return 1;
    if (aNull && bNull) return 0;
    return a.localeCompare(b);
  });
}

function layoutRows(
  nodes: FlowNode[],
  keyOf: (node: FlowNode) => string | null | undefined
): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};

  // Collect unique row keys in first-seen order (null/empty → "" sentinel).
  const seen = new Set<string>();
  const rowKeysRaw: string[] = [];
  for (const node of nodes) {
    const rawKey = keyOf(node);
    const key = isNullishKey(rawKey) ? "" : (rawKey as string);
    if (!seen.has(key)) {
      seen.add(key);
      rowKeysRaw.push(key);
    }
  }
  const rowKeys = sortRowsNullishFirst(rowKeysRaw);

  // Group nodes by row, sorted by sequenceOrder then id for stability.
  const byRow = new Map<string, FlowNode[]>();
  for (const key of rowKeys) {
    byRow.set(key, []);
  }
  for (const node of nodes) {
    const rawKey = keyOf(node);
    const key = isNullishKey(rawKey) ? "" : (rawKey as string);
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
      positions[node.id] = { x, y };
    });
  });

  return positions;
}

// ── Message handler ──────────────────────────────────────────────────

self.onmessage = (
  e: MessageEvent<{
    jobId: number;
    mode: FlowLayoutMode;
    nodes: FlowNode[];
    edges: FlowEdge[];
  }>
) => {
  const { jobId, mode, nodes, edges } = e.data;

  let positions: Record<string, { x: number; y: number }>;
  switch (mode) {
    case "FLOW":
      positions = layoutFlow(nodes, edges);
      break;
    case "ROUTE":
      positions = layoutRows(nodes, (n) => n.routeKey);
      break;
    case "FILE":
      positions = layoutRows(nodes, (n) => n.fileName || "");
      break;
    default:
      positions = layoutFlow(nodes, edges);
  }

  (self as unknown as Worker).postMessage({ jobId, positions });
};
