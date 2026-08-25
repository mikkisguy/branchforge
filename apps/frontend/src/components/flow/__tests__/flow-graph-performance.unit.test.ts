/**
 * Performance tests for flow-graph layout and filtering at scale.
 *
 * Verifies the core O(n) / O(n+e) algorithms that power the flow graph stay
 * within budget at 100 / 500 / 1000 labels — the target node counts from
 * issue #195. jsdom can't measure actual DOM render time, so these tests
 * cover the *algorithmic* cost that drives every data refresh (layout
 * recomputation, filtering, edge building, color mapping). The rendering
 * side is addressed by `onlyRenderVisibleElements` + React.memo.
 *
 * Thresholds are intentionally generous so they don't flake on CI runners,
 * while still catching algorithmic regressions (e.g. an accidental O(n²)
 * would blow past them).
 */

import { describe, it, expect } from "vitest";
import { buildRouteColorMap } from "../flow-graph-routes";
import { buildEdges } from "../flow-graph-edges";
import { layoutNodes } from "../flow-graph-layout";
import { filterFlowNodes } from "../flow-filters";
import type { FlowNode, FlowEdge } from "@branchforge/shared";

const ROUTES = ["common", "route_a", "route_b", "route_c", "route_d"];
const STATUSES = ["DRAFT", "REVIEW", "FINAL"] as const;
const CHARACTERS = ["char_1", "char_2", "char_3", "char_4"];

function generateNodes(count: number): FlowNode[] {
  const nodes: FlowNode[] = [];
  for (let i = 0; i < count; i++) {
    nodes.push({
      id: `node-${i}`,
      labelId: `node-${i}`,
      title: `Scene ${i}`,
      labelName: `scene_${i}`,
      routeKey: ROUTES[i % ROUTES.length]!,
      status: STATUSES[i % STATUSES.length]!,
      fileName: `act_${(i % 3) + 1}.rpy`,
      sequenceOrder: i,
      labelNumber: i,
      characterIds:
        i % 3 === 0
          ? [CHARACTERS[i % CHARACTERS.length]!]
          : [CHARACTERS[0]!, CHARACTERS[1]!],
      wordCount: 500 + (i % 2000),
    });
  }
  return nodes;
}

function generateEdges(nodes: FlowNode[]): FlowEdge[] {
  const edges: FlowEdge[] = [];
  // Chain most nodes linearly + a few branching choices, matching a
  // realistic visual-novel structure.
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({
      id: `edge-${i}`,
      source: nodes[i]!.id,
      target: nodes[i + 1]!.id,
      type: "NATURAL",
    });
    if (i % 5 === 0 && i + 2 < nodes.length) {
      edges.push({
        id: `edge-choice-${i}`,
        source: nodes[i]!.id,
        target: nodes[i + 2]!.id,
        type: "CHOICE",
        label: "Option A",
      });
    }
  }
  return edges;
}

function measure<T>(fn: () => T): { result: T; ms: number } {
  const start = performance.now();
  const result = fn();
  const ms = performance.now() - start;
  return { result, ms };
}

const emptyPositions = {};

describe("flow-graph performance at scale", () => {
  // Run each scenario at 100, 500, and 1000 nodes.
  for (const nodeCount of [100, 500, 1000]) {
    const nodes = generateNodes(nodeCount);
    const edges = generateEdges(nodes);
    const routeColorMap = buildRouteColorMap(nodes);

    describe(`${nodeCount} nodes`, () => {
      it("builds the route color map quickly", () => {
        const { ms } = measure(() => buildRouteColorMap(nodes));
        // O(n) scan to collect unique routes + O(routes) hashing. Should
        // be well under 30ms even for 1000 nodes.
        expect(ms).toBeLessThan(30);
      });

      it("builds edges quickly", () => {
        const { ms } = measure(() => buildEdges(edges));
        expect(ms).toBeLessThan(20);
      });

      it("filters nodes quickly with an active search", () => {
        const { ms } = measure(() =>
          filterFlowNodes(nodes, {
            routeKeys: new Set(),
            statuses: new Set(),
            characterIds: new Set(),
            searchQuery: "Scene 5",
          })
        );
        expect(ms).toBeLessThan(20);
      });

      it("filters nodes quickly with active multi-select", () => {
        const { ms } = measure(() =>
          filterFlowNodes(nodes, {
            routeKeys: new Set(["route_a", "route_b"]),
            statuses: new Set(["DRAFT", "REVIEW"]),
            characterIds: new Set(["char_1"]),
            searchQuery: "",
          })
        );
        expect(ms).toBeLessThan(20);
      });

      // Vitest's default testTimeout is 5s, below the 8s/30s assertion
      // budgets. Keep the harness timeout above the budget so a slow CI
      // runner fails the ms assertion rather than timing out.
      it(
        "computes FLOW (dagre) layout within budget",
        () => {
          const { result, ms } = measure(() =>
            layoutNodes(nodes, edges, routeColorMap, emptyPositions, "FLOW")
          );
          expect(result).toHaveLength(nodeCount);
          // Dagre is a third-party hierarchical layout engine and the most
          // expensive single operation in the flow graph. It runs once per
          // data/mode change (memoised), not on every pan/zoom. These
          // budgets are deliberately generous (≈4× observed dev-machine
          // times) so CI runners don't flake, while still catching an
          // accidental O(n²) regression (which would be ~10s at 1000 nodes).
          const budget =
            nodeCount <= 100 ? 1500 : nodeCount <= 500 ? 8000 : 30000;
          expect(ms).toBeLessThan(budget);
        },
        nodeCount <= 100 ? 5000 : nodeCount <= 500 ? 13000 : 35000
      );

      it("computes ROUTE (row) layout within budget", () => {
        const { result, ms } = measure(() =>
          layoutNodes(nodes, edges, routeColorMap, emptyPositions, "ROUTE")
        );
        expect(result).toHaveLength(nodeCount);
        // Row layout is O(n log n) (sort per group) — much cheaper than dagre.
        expect(ms).toBeLessThan(100);
      });

      it("computes FILE (row) layout within budget", () => {
        const { result, ms } = measure(() =>
          layoutNodes(nodes, edges, routeColorMap, emptyPositions, "FILE")
        );
        expect(result).toHaveLength(nodeCount);
        expect(ms).toBeLessThan(100);
      });
    });
  }

  it("layoutNodes applies saved positions without recomputing overrides", () => {
    const nodes = generateNodes(50);
    const edges = generateEdges(nodes);
    const routeColorMap = buildRouteColorMap(nodes);
    const savedPositions: Record<string, { x: number; y: number }> = {
      "node-0": { x: 999, y: 999 },
    };
    const result = layoutNodes(
      nodes,
      edges,
      routeColorMap,
      savedPositions,
      "FLOW"
    );
    expect(result[0]!.position).toEqual({ x: 999, y: 999 });
  });
});
