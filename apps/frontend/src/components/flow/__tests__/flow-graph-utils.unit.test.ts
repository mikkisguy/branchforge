import { describe, it, expect } from "vitest";
import { MarkerType } from "@xyflow/react";
import {
  buildRouteColorMap,
  buildEdges,
  getEdgeColor,
  getEdgeWidth,
  getRouteColor,
  layoutNodes,
  ROUTE_COLORS,
} from "../flow-graph-utils";
import type { FlowNode, FlowEdge } from "@branchforge/shared";

const mockFlowNodes: FlowNode[] = [
  {
    id: "node-1",
    labelId: "node-1",
    title: "Scene 1",
    labelName: "scene_1",
    routeKey: "common",
    status: "DRAFT",
    fileName: "act_i.rpy",
    sequenceOrder: 1,
    labelNumber: 1,
  },
  {
    id: "node-2",
    labelId: "node-2",
    title: "Scene 2",
    labelName: "scene_2",
    routeKey: "heroine_a",
    status: "REVIEW",
    fileName: "act_i.rpy",
    sequenceOrder: 2,
    labelNumber: 2,
  },
];

describe("ROUTE_COLORS", () => {
  it("has 8 colors in the palette", () => {
    expect(ROUTE_COLORS).toHaveLength(8);
  });
});

describe("buildRouteColorMap", () => {
  it("returns empty map for empty nodes array", () => {
    const map = buildRouteColorMap([]);
    expect(map.size).toBe(0);
  });

  it("assigns colors to each unique routeKey", () => {
    const map = buildRouteColorMap(mockFlowNodes);
    expect(map.size).toBe(2);
    expect(map.has("common")).toBe(true);
    expect(map.has("heroine_a")).toBe(true);
    expect(map.get("common")).toBe(ROUTE_COLORS[0]);
    expect(map.get("heroine_a")).toBe(ROUTE_COLORS[1]);
  });

  it("nodes with null routeKey are not included in the map", () => {
    const nodes: FlowNode[] = [
      ...mockFlowNodes,
      {
        id: "node-3",
        labelId: "node-3",
        title: "Scene 3",
        labelName: "scene_3",
        routeKey: null,
        status: "DRAFT",
        fileName: "act_i.rpy",
        sequenceOrder: 3,
        labelNumber: 3,
      },
    ];
    const map = buildRouteColorMap(nodes);
    expect(map.size).toBe(2);
    expect(map.has("common")).toBe(true);
    expect(map.has("heroine_a")).toBe(true);
  });

  it("cycles through ROUTE_COLORS when there are more routes than colors", () => {
    const nodes: FlowNode[] = Array.from({ length: 10 }, (_, i) => ({
      id: `node-${i + 1}`,
      labelId: `node-${i + 1}`,
      title: `Scene ${i + 1}`,
      labelName: `scene_${i + 1}`,
      routeKey: `route_${i + 1}`,
      status: "DRAFT" as const,
      fileName: "act_i.rpy",
      sequenceOrder: i + 1,
      labelNumber: i + 1,
    }));
    const map = buildRouteColorMap(nodes);
    expect(map.size).toBe(10);
    // route_1 gets index 0; route_9 wraps to index 0: (9-1) % 8 = 0
    expect(map.get("route_1")).toBe(ROUTE_COLORS[0]);
    expect(map.get("route_9")).toBe(ROUTE_COLORS[0]);
  });

  it("same routeKey always gets same color", () => {
    const nodes: FlowNode[] = [
      mockFlowNodes[0],
      mockFlowNodes[0],
      {
        ...mockFlowNodes[1],
        id: "node-3",
        labelId: "node-3",
      },
    ];
    const map = buildRouteColorMap(nodes);
    expect(map.size).toBe(2);
    expect(map.get("common")).toBe(ROUTE_COLORS[0]);
    expect(map.get("heroine_a")).toBe(ROUTE_COLORS[1]);
  });
});

describe("buildEdges", () => {
  const mockFlowEdges: FlowEdge[] = [
    { id: "edge-1", source: "node-1", target: "node-2", type: "JUMP" },
    {
      id: "edge-2",
      source: "node-1",
      target: "node-2",
      type: "CHOICE",
      label: "Yes",
    },
    { id: "edge-3", source: "node-1", target: "node-2", type: "NATURAL" },
  ];

  it("converts FlowEdge to ReactFlow Edge with correct structure", () => {
    const edges = buildEdges(mockFlowEdges);
    expect(edges).toHaveLength(3);

    const edge = edges[0];
    expect(edge).toHaveProperty("id", "edge-1");
    expect(edge).toHaveProperty("source", "node-1");
    expect(edge).toHaveProperty("target", "node-2");
    expect(edge).toHaveProperty("markerEnd");
    expect(edge.markerEnd).toEqual(
      expect.objectContaining({ type: MarkerType.ArrowClosed })
    );
    expect(edge).toHaveProperty("labelStyle", {
      fill: "#94a3b8",
      fontSize: 11,
    });
  });

  it("JUMP edges get amber color and width 2", () => {
    const edges = buildEdges(mockFlowEdges);
    const jumpEdge = edges[0];
    expect(jumpEdge.style).toEqual(
      expect.objectContaining({
        stroke: "#f59e0b",
        strokeWidth: 2,
      })
    );
    expect((jumpEdge.markerEnd as { color: string }).color).toBe("#f59e0b");
    expect(jumpEdge.animated).toBe(false);
  });

  it("CHOICE edges get blue color and width 2", () => {
    const edges = buildEdges(mockFlowEdges);
    const choiceEdge = edges[1];
    expect(choiceEdge.style).toEqual(
      expect.objectContaining({
        stroke: "#3b82f6",
        strokeWidth: 2,
      })
    );
    expect((choiceEdge.markerEnd as { color: string }).color).toBe("#3b82f6");
    expect(choiceEdge.animated).toBe(false);
  });

  it("NATURAL edges get slate color, width 1, and animated: true", () => {
    const edges = buildEdges(mockFlowEdges);
    const naturalEdge = edges[2];
    expect(naturalEdge.style).toEqual(
      expect.objectContaining({
        stroke: "#475569",
        strokeWidth: 1,
      })
    );
    expect((naturalEdge.markerEnd as { color: string }).color).toBe("#475569");
    expect(naturalEdge.animated).toBe(true);
  });

  it("edge label is preserved (for CHOICE edges)", () => {
    const edges = buildEdges(mockFlowEdges);
    const choiceEdge = edges[1];
    expect(choiceEdge.label).toBe("Yes");
  });

  it("MarkerType.ArrowClosed is used for markerEnd", () => {
    const edges = buildEdges(mockFlowEdges);
    for (const edge of edges) {
      expect(edge.markerEnd).toEqual(
        expect.objectContaining({ type: MarkerType.ArrowClosed })
      );
    }
  });
});

describe("getEdgeColor", () => {
  it('JUMP returns "#f59e0b"', () => {
    expect(getEdgeColor("JUMP")).toBe("#f59e0b");
  });

  it('CHOICE returns "#3b82f6"', () => {
    expect(getEdgeColor("CHOICE")).toBe("#3b82f6");
  });

  it('NATURAL returns "#475569"', () => {
    expect(getEdgeColor("NATURAL")).toBe("#475569");
  });

  it('unknown type returns "#64748b"', () => {
    expect(getEdgeColor("UNKNOWN")).toBe("#64748b");
    expect(getEdgeColor("")).toBe("#64748b");
  });
});

describe("getEdgeWidth", () => {
  it("JUMP returns 2", () => {
    expect(getEdgeWidth("JUMP")).toBe(2);
  });

  it("CHOICE returns 2", () => {
    expect(getEdgeWidth("CHOICE")).toBe(2);
  });

  it("NATURAL returns 1", () => {
    expect(getEdgeWidth("NATURAL")).toBe(1);
  });

  it("unknown type returns 1", () => {
    expect(getEdgeWidth("UNKNOWN")).toBe(1);
    expect(getEdgeWidth("")).toBe(1);
  });
});

describe("getRouteColor", () => {
  const routeColorMap = new Map<string, string>([
    ["common", "#3b82f6"],
    ["heroine_a", "#ef4444"],
  ]);

  it("returns mapped color for known routeKey", () => {
    expect(getRouteColor("common", routeColorMap)).toBe("#3b82f6");
    expect(getRouteColor("heroine_a", routeColorMap)).toBe("#ef4444");
  });

  it('returns "#64748b" for null routeKey', () => {
    expect(getRouteColor(null, routeColorMap)).toBe("#64748b");
  });

  it('returns "#64748b" for unknown routeKey', () => {
    expect(getRouteColor("nonexistent", routeColorMap)).toBe("#64748b");
  });
});

describe("layoutNodes", () => {
  const routeColorMap = new Map<string, string>([
    ["common", "#3b82f6"],
    ["heroine_a", "#ef4444"],
  ]);

  const flowEdges: FlowEdge[] = [
    { id: "edge-1", source: "node-1", target: "node-2", type: "NATURAL" },
  ];

  it("returns nodes with dagre-computed positions when no saved positions", () => {
    const nodes = layoutNodes(mockFlowNodes, flowEdges, routeColorMap, {});

    expect(nodes).toHaveLength(2);

    for (const node of nodes) {
      expect(node).toHaveProperty("id");
      expect(node).toHaveProperty("type", "label");
      expect(node).toHaveProperty("position");
      expect(typeof node.position.x).toBe("number");
      expect(typeof node.position.y).toBe("number");
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
    }
  });

  it("uses saved positions when available (overrides dagre)", () => {
    const savedPositions: Record<string, { x: number; y: number }> = {
      "node-1": { x: 100, y: 200 },
      "node-2": { x: 300, y: 400 },
    };

    const nodes = layoutNodes(
      mockFlowNodes,
      flowEdges,
      routeColorMap,
      savedPositions
    );

    expect(nodes).toHaveLength(2);
    expect(nodes[0].position).toEqual({ x: 100, y: 200 });
    expect(nodes[1].position).toEqual({ x: 300, y: 400 });
  });

  it("mixes saved and dagre positions (some nodes saved, others computed)", () => {
    const savedPositions: Record<string, { x: number; y: number }> = {
      "node-1": { x: 500, y: 600 },
    };

    const nodes = layoutNodes(
      mockFlowNodes,
      flowEdges,
      routeColorMap,
      savedPositions
    );

    expect(nodes[0].position).toEqual({ x: 500, y: 600 }); // saved
    expect(typeof nodes[1].position.x).toBe("number"); // dagre-computed
    expect(typeof nodes[1].position.y).toBe("number");
    expect(Number.isFinite(nodes[1].position.x)).toBe(true);
  });

  it("sets correct node data", () => {
    const nodes = layoutNodes(mockFlowNodes, flowEdges, routeColorMap, {});

    expect(nodes[0].data).toEqual({
      labelId: "node-1",
      title: "Scene 1",
      labelName: "scene_1",
      routeKey: "common",
      status: "DRAFT",
      fileName: "act_i.rpy",
      routeColor: "#3b82f6",
    });

    expect(nodes[1].data).toEqual({
      labelId: "node-2",
      title: "Scene 2",
      labelName: "scene_2",
      routeKey: "heroine_a",
      status: "REVIEW",
      fileName: "act_i.rpy",
      routeColor: "#ef4444",
    });
  });

  it("sets borderLeft style with route color", () => {
    const nodes = layoutNodes(mockFlowNodes, flowEdges, routeColorMap, {});

    expect(nodes[0].style).toEqual({
      borderLeft: "3px solid #3b82f6",
    });
    expect(nodes[1].style).toEqual({
      borderLeft: "3px solid #ef4444",
    });
  });
});
