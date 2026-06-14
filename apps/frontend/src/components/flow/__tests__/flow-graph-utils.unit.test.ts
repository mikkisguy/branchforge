import { describe, it, expect } from "vitest";
import { MarkerType } from "@xyflow/react";
import {
  buildRouteColorMap,
  buildEdges,
  getEdgeColor,
  getEdgeWidth,
  getRouteColor,
  layoutNodes,
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
    characterIds: [],
    wordCount: 0,
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
    characterIds: [],
    wordCount: 0,
  },
];

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
    // Colors are generated deterministically via HSL
    const commonColor = map.get("common");
    const heroineAColor = map.get("heroine_a");
    expect(commonColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(heroineAColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(commonColor).not.toBe(heroineAColor);
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
        characterIds: [],
        wordCount: 0,
      },
    ];
    const map = buildRouteColorMap(nodes);
    expect(map.size).toBe(2);
    expect(map.has("common")).toBe(true);
    expect(map.has("heroine_a")).toBe(true);
  });

  it("generates distinct HSL colors for each route (no collisions)", () => {
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
      characterIds: [],
      wordCount: 0,
    }));
    const map = buildRouteColorMap(nodes);
    expect(map.size).toBe(10);
    // All generated colors should be valid 6-digit hex strings
    for (let i = 1; i <= 10; i++) {
      const color = map.get(`route_${i}`);
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
    // All 10 colors should be distinct (no collisions)
    const colors = Array.from(map.values());
    const uniqueColors = new Set(colors);
    expect(uniqueColors.size).toBe(10);
    // First color should be a valid hex (hue 0° -> reddish with s=70%, l=55%)
    expect(map.get("route_1")).toMatch(/^#[0-9a-f]{6}$/i);
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
    // Colors are deterministic based on the order routes are first encountered
    const commonColor = map.get("common");
    const heroineAColor = map.get("heroine_a");
    expect(commonColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(heroineAColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(commonColor).not.toBe(heroineAColor);
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
      wordCount: 0,
      characterIds: [],
    });

    expect(nodes[1].data).toEqual({
      labelId: "node-2",
      title: "Scene 2",
      labelName: "scene_2",
      routeKey: "heroine_a",
      status: "REVIEW",
      fileName: "act_i.rpy",
      routeColor: "#ef4444",
      wordCount: 0,
      characterIds: [],
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

  it("defaults to FLOW mode (backward compatible)", () => {
    // Omitting the mode argument must produce the same positions as the
    // explicit "FLOW" mode, preserving the previous public contract.
    const implicit = layoutNodes(mockFlowNodes, flowEdges, routeColorMap, {});
    const explicit = layoutNodes(
      mockFlowNodes,
      flowEdges,
      routeColorMap,
      {},
      "FLOW"
    );
    expect(implicit.map((n) => n.position)).toEqual(
      explicit.map((n) => n.position)
    );
  });
});

describe("layoutNodes — ROUTE mode", () => {
  const routeColorMap = new Map<string, string>([
    ["common", "#3b82f6"],
    ["heroine_a", "#ef4444"],
    ["heroine_b", "#10b981"],
  ]);

  const routeNodes: FlowNode[] = [
    {
      id: "n-common-2",
      labelId: "n-common-2",
      title: "Common 2",
      labelName: "common_2",
      routeKey: "common",
      status: "DRAFT",
      fileName: "common.rpy",
      sequenceOrder: 2,
      labelNumber: 2,
      characterIds: [],
      wordCount: 0,
    },
    {
      id: "n-heroine-b-1",
      labelId: "n-heroine-b-1",
      title: "Heroine B",
      labelName: "heroine_b_1",
      routeKey: "heroine_b",
      status: "DRAFT",
      fileName: "heroine_b.rpy",
      sequenceOrder: 1,
      labelNumber: 1,
      characterIds: [],
      wordCount: 0,
    },
    {
      id: "n-unassigned",
      labelId: "n-unassigned",
      title: "Unassigned",
      labelName: "unassigned",
      routeKey: null,
      status: "DRAFT",
      fileName: "misc.rpy",
      sequenceOrder: 1,
      labelNumber: 1,
      characterIds: [],
      wordCount: 0,
    },
    {
      id: "n-unassigned-2",
      labelId: "n-unassigned-2",
      title: "Unassigned 2",
      labelName: "unassigned_2",
      routeKey: null,
      status: "DRAFT",
      fileName: "misc.rpy",
      sequenceOrder: 2,
      labelNumber: 2,
      characterIds: [],
      wordCount: 0,
    },
    {
      id: "n-common-1",
      labelId: "n-common-1",
      title: "Common 1",
      labelName: "common_1",
      routeKey: "common",
      status: "DRAFT",
      fileName: "common.rpy",
      sequenceOrder: 1,
      labelNumber: 1,
      characterIds: [],
      wordCount: 0,
    },
    {
      id: "n-heroine-a-1",
      labelId: "n-heroine-a-1",
      title: "Heroine A",
      labelName: "heroine_a_1",
      routeKey: "heroine_a",
      status: "DRAFT",
      fileName: "heroine_a.rpy",
      sequenceOrder: 1,
      labelNumber: 1,
      characterIds: [],
      wordCount: 0,
    },
  ];

  const routeEdges: FlowEdge[] = [];

  const positionOf = (
    nodes: ReturnType<typeof layoutNodes>,
    id: string
  ): { x: number; y: number } => {
    const node = nodes.find((n) => n.id === id);
    if (!node) throw new Error(`missing node ${id}`);
    return node.position;
  };

  it("places all nodes in the same route on the same row (y constant)", () => {
    const nodes = layoutNodes(
      routeNodes,
      routeEdges,
      routeColorMap,
      {},
      "ROUTE"
    );
    const common1 = positionOf(nodes, "n-common-1");
    const common2 = positionOf(nodes, "n-common-2");
    expect(common1.y).toBe(common2.y);
  });

  it("puts unassigned route (null) on the first row, then alphabetical", () => {
    const nodes = layoutNodes(
      routeNodes,
      routeEdges,
      routeColorMap,
      {},
      "ROUTE"
    );

    // Row y positions: row 0 = nullish (unassigned), then common,
    // heroine_a, heroine_b.
    expect(positionOf(nodes, "n-unassigned").y).toBe(0);
    expect(positionOf(nodes, "n-common-1").y).toBe(160);
    expect(positionOf(nodes, "n-heroine-a-1").y).toBe(320);
    expect(positionOf(nodes, "n-heroine-b-1").y).toBe(480);
  });

  it("places two null-routeKey nodes on the same row with distinct x", () => {
    const nodes = layoutNodes(
      routeNodes,
      routeEdges,
      routeColorMap,
      {},
      "ROUTE"
    );

    const u1 = positionOf(nodes, "n-unassigned");
    const u2 = positionOf(nodes, "n-unassigned-2");
    expect(u1.y).toBe(u2.y);
    expect(u1.y).toBe(0);
    expect(u1.x).not.toBe(u2.x);
  });

  it("orders nodes within a row by sequenceOrder ascending (left to right)", () => {
    const nodes = layoutNodes(
      routeNodes,
      routeEdges,
      routeColorMap,
      {},
      "ROUTE"
    );
    const common1 = positionOf(nodes, "n-common-1");
    const common2 = positionOf(nodes, "n-common-2");
    expect(common1.y).toBe(common2.y);
    expect(common1.x).toBeLessThan(common2.x);
  });

  it("honors saved positions over the auto ROUTE layout", () => {
    const saved = {
      "n-common-1": { x: 9999, y: 8888 },
    };
    const nodes = layoutNodes(
      routeNodes,
      routeEdges,
      routeColorMap,
      saved,
      "ROUTE"
    );
    expect(positionOf(nodes, "n-common-1")).toEqual({ x: 9999, y: 8888 });
    // Other nodes in the same row still fall back to auto positions.
    const common2 = positionOf(nodes, "n-common-2");
    expect(common2.y).toBe(160);
    expect(common2.x).toBeGreaterThanOrEqual(0);
  });
});

describe("layoutNodes — FILE mode", () => {
  const routeColorMap = new Map<string, string>([["common", "#3b82f6"]]);

  const fileNodes: FlowNode[] = [
    {
      id: "f-a-2",
      labelId: "f-a-2",
      title: "act_a_2",
      labelName: "act_a_2",
      routeKey: "common",
      status: "DRAFT",
      fileName: "act_a.rpy",
      sequenceOrder: 2,
      labelNumber: 2,
      characterIds: [],
      wordCount: 0,
    },
    {
      id: "f-b-1",
      labelId: "f-b-1",
      title: "act_b_1",
      labelName: "act_b_1",
      routeKey: "common",
      status: "DRAFT",
      fileName: "act_b.rpy",
      sequenceOrder: 1,
      labelNumber: 1,
      characterIds: [],
      wordCount: 0,
    },
    {
      id: "f-a-1",
      labelId: "f-a-1",
      title: "act_a_1",
      labelName: "act_a_1",
      routeKey: "common",
      status: "DRAFT",
      fileName: "act_a.rpy",
      sequenceOrder: 1,
      labelNumber: 1,
      characterIds: [],
      wordCount: 0,
    },
    {
      id: "f-empty-name",
      labelId: "f-empty-name",
      title: "no-file",
      labelName: "no_file",
      routeKey: "common",
      status: "DRAFT",
      fileName: "",
      sequenceOrder: 1,
      labelNumber: 1,
      characterIds: [],
      wordCount: 0,
    },
    {
      id: "f-empty-name-2",
      labelId: "f-empty-name-2",
      title: "no-file-2",
      labelName: "no_file_2",
      routeKey: "common",
      status: "DRAFT",
      fileName: "",
      sequenceOrder: 2,
      labelNumber: 2,
      characterIds: [],
      wordCount: 0,
    },
  ];

  const positionOf = (
    nodes: ReturnType<typeof layoutNodes>,
    id: string
  ): { x: number; y: number } => {
    const node = nodes.find((n) => n.id === id);
    if (!node) throw new Error(`missing node ${id}`);
    return node.position;
  };

  it("groups nodes by fileName into rows, ordered alphabetically", () => {
    const nodes = layoutNodes(fileNodes, [], routeColorMap, {}, "FILE");

    expect(positionOf(nodes, "f-empty-name").y).toBe(0);
    expect(positionOf(nodes, "f-a-1").y).toBe(160);
    expect(positionOf(nodes, "f-b-1").y).toBe(320);
  });

  it("places two empty-fileName nodes on the same row with distinct x", () => {
    const nodes = layoutNodes(fileNodes, [], routeColorMap, {}, "FILE");

    const empty1 = positionOf(nodes, "f-empty-name");
    const empty2 = positionOf(nodes, "f-empty-name-2");
    expect(empty1.y).toBe(empty2.y);
    expect(empty1.y).toBe(0);
    expect(empty1.x).not.toBe(empty2.x);
  });

  it("orders nodes within a file by sequenceOrder ascending (left to right)", () => {
    const nodes = layoutNodes(fileNodes, [], routeColorMap, {}, "FILE");
    const a1 = positionOf(nodes, "f-a-1");
    const a2 = positionOf(nodes, "f-a-2");
    expect(a1.y).toBe(a2.y);
    expect(a1.x).toBeLessThan(a2.x);
  });

  it("honors saved positions over the auto FILE layout", () => {
    const saved = { "f-b-1": { x: 1234, y: 5678 } };
    const nodes = layoutNodes(fileNodes, [], routeColorMap, saved, "FILE");
    expect(positionOf(nodes, "f-b-1")).toEqual({ x: 1234, y: 5678 });
  });
});

describe("layoutNodes — mode switching", () => {
  const routeColorMap = new Map<string, string>([
    ["common", "#3b82f6"],
    ["heroine_a", "#ef4444"],
  ]);

  const nodes: FlowNode[] = [
    {
      id: "switch-1",
      labelId: "switch-1",
      title: "Common",
      labelName: "common_1",
      routeKey: "common",
      status: "DRAFT",
      fileName: "act_i.rpy",
      sequenceOrder: 1,
      labelNumber: 1,
      characterIds: [],
      wordCount: 0,
    },
    {
      id: "switch-2",
      labelId: "switch-2",
      title: "Heroine A",
      labelName: "heroine_a_1",
      routeKey: "heroine_a",
      status: "DRAFT",
      fileName: "act_i.rpy",
      sequenceOrder: 2,
      labelNumber: 2,
      characterIds: [],
      wordCount: 0,
    },
  ];

  it("FLOW and ROUTE produce different positions for the same nodes", () => {
    const flow = layoutNodes(nodes, [], routeColorMap, {}, "FLOW");
    const route = layoutNodes(nodes, [], routeColorMap, {}, "ROUTE");
    const flowPos = flow.find((n) => n.id === "switch-1")!.position;
    const routePos = route.find((n) => n.id === "switch-1")!.position;
    // Both are deterministic but use different algorithms, so positions
    // should differ for at least one of the two nodes.
    const flowPos2 = flow.find((n) => n.id === "switch-2")!.position;
    const routePos2 = route.find((n) => n.id === "switch-2")!.position;
    const allSame =
      flowPos.x === routePos.x &&
      flowPos.y === routePos.y &&
      flowPos2.x === routePos2.x &&
      flowPos2.y === routePos2.y;
    expect(allSame).toBe(false);
  });

  it("saved position survives a mode change (user drags are sticky)", () => {
    const saved = { "switch-1": { x: 42, y: 4242 } };
    const flow = layoutNodes(nodes, [], routeColorMap, saved, "FLOW");
    const route = layoutNodes(nodes, [], routeColorMap, saved, "ROUTE");
    const file = layoutNodes(nodes, [], routeColorMap, saved, "FILE");
    expect(flow.find((n) => n.id === "switch-1")!.position).toEqual({
      x: 42,
      y: 4242,
    });
    expect(route.find((n) => n.id === "switch-1")!.position).toEqual({
      x: 42,
      y: 4242,
    });
    expect(file.find((n) => n.id === "switch-1")!.position).toEqual({
      x: 42,
      y: 4242,
    });
  });
});
