import { describe, it, expect } from "vitest";
import {
  EMPTY_FLOW_FILTERS,
  countActiveFilters,
  filterFlowNodes,
  isFlowFilterEmpty,
  type FlowGraphFilters,
} from "../flow-filters";
import type { FlowNode } from "@branchforge/shared";

const baseNode: FlowNode = {
  id: "n-1",
  labelId: "n-1",
  title: "Opening Scene",
  labelName: "opening",
  routeKey: "common",
  status: "DRAFT",
  fileName: "act_i.rpy",
  sequenceOrder: 1,
  labelNumber: 1,
  characterIds: [],
};

const nodes: FlowNode[] = [
  baseNode,
  {
    ...baseNode,
    id: "n-2",
    labelId: "n-2",
    title: "Heroine Confession",
    labelName: "heroine_confession",
    routeKey: "heroine_a",
    status: "REVIEW",
    sequenceOrder: 2,
    labelNumber: 2,
    characterIds: ["char-1"],
  },
  {
    ...baseNode,
    id: "n-3",
    labelId: "n-3",
    title: "Final Battle",
    labelName: "final_battle",
    routeKey: "heroine_a",
    status: "FINAL",
    sequenceOrder: 3,
    labelNumber: 3,
    characterIds: ["char-1", "char-2"],
  },
  {
    ...baseNode,
    id: "n-4",
    labelId: "n-4",
    title: "Lone Memory",
    labelName: null,
    routeKey: null,
    status: null,
    sequenceOrder: 4,
    labelNumber: 4,
    characterIds: [],
  },
];

describe("isFlowFilterEmpty", () => {
  it("returns true for the empty default", () => {
    expect(isFlowFilterEmpty(EMPTY_FLOW_FILTERS)).toBe(true);
  });

  it("returns false when any single field has a value", () => {
    expect(isFlowFilterEmpty({ ...EMPTY_FLOW_FILTERS, searchQuery: "x" })).toBe(
      false
    );
    expect(
      isFlowFilterEmpty({ ...EMPTY_FLOW_FILTERS, routeKeys: new Set(["x"]) })
    ).toBe(false);
    expect(
      isFlowFilterEmpty({ ...EMPTY_FLOW_FILTERS, statuses: new Set(["DRAFT"]) })
    ).toBe(false);
    expect(
      isFlowFilterEmpty({
        ...EMPTY_FLOW_FILTERS,
        characterIds: new Set(["c"]),
      })
    ).toBe(false);
  });

  it("treats whitespace-only search as empty", () => {
    expect(
      isFlowFilterEmpty({ ...EMPTY_FLOW_FILTERS, searchQuery: "   " })
    ).toBe(true);
  });
});

describe("countActiveFilters", () => {
  it("returns 0 for empty filters", () => {
    expect(countActiveFilters(EMPTY_FLOW_FILTERS)).toBe(0);
  });

  it("counts each non-empty field once regardless of cardinality", () => {
    const f: FlowGraphFilters = {
      routeKeys: new Set<string | null>(["a", "b", "c"]),
      statuses: new Set(["DRAFT"]),
      characterIds: new Set(["x"]),
      searchQuery: "  hero  ",
    };
    expect(countActiveFilters(f)).toBe(4);
  });

  it("counts search only when non-whitespace is present", () => {
    expect(
      countActiveFilters({ ...EMPTY_FLOW_FILTERS, searchQuery: "   " })
    ).toBe(0);
  });
});

describe("filterFlowNodes", () => {
  it("returns a new array (not the same reference) with all nodes when no filters are active", () => {
    const result = filterFlowNodes(nodes, EMPTY_FLOW_FILTERS);
    expect(result).toHaveLength(nodes.length);
    expect(result).not.toBe(nodes);
  });

  it("filters by route key", () => {
    const result = filterFlowNodes(nodes, {
      ...EMPTY_FLOW_FILTERS,
      routeKeys: new Set(["heroine_a"]),
    });
    expect(result.map((n) => n.id)).toEqual(["n-2", "n-3"]);
  });

  it("a node with null routeKey does NOT match a real route filter", () => {
    const result = filterFlowNodes(nodes, {
      ...EMPTY_FLOW_FILTERS,
      routeKeys: new Set(["common"]),
    });
    expect(result.map((n) => n.id)).toEqual(["n-1"]);
  });

  it("a null entry in the route filter matches only nodes with null routeKey", () => {
    const result = filterFlowNodes(nodes, {
      ...EMPTY_FLOW_FILTERS,
      routeKeys: new Set([null]),
    });
    expect(result.map((n) => n.id)).toEqual(["n-4"]);
  });

  it("a null + a real key in the route filter matches both buckets", () => {
    const result = filterFlowNodes(nodes, {
      ...EMPTY_FLOW_FILTERS,
      routeKeys: new Set<string | null>([null, "heroine_a"]),
    });
    expect(result.map((n) => n.id).sort()).toEqual(["n-2", "n-3", "n-4"]);
  });

  it("filters by status (multiple selection is OR)", () => {
    const result = filterFlowNodes(nodes, {
      ...EMPTY_FLOW_FILTERS,
      statuses: new Set(["DRAFT", "FINAL"]),
    });
    expect(result.map((n) => n.id)).toEqual(["n-1", "n-3"]);
  });

  it("does not match nodes with null status against any status filter", () => {
    const result = filterFlowNodes(nodes, {
      ...EMPTY_FLOW_FILTERS,
      statuses: new Set(["DRAFT"]),
    });
    expect(result.find((n) => n.id === "n-4")).toBeUndefined();
  });

  it("filters by character (matches if the node speaks ANY selected character)", () => {
    const result = filterFlowNodes(nodes, {
      ...EMPTY_FLOW_FILTERS,
      characterIds: new Set(["char-2"]),
    });
    expect(result.map((n) => n.id)).toEqual(["n-3"]);
  });

  it("character filter excludes labels with no characters", () => {
    const result = filterFlowNodes(nodes, {
      ...EMPTY_FLOW_FILTERS,
      characterIds: new Set(["char-1"]),
    });
    expect(result.find((n) => n.id === "n-1")).toBeUndefined();
    expect(result.find((n) => n.id === "n-4")).toBeUndefined();
  });

  it("search matches title (case-insensitive)", () => {
    const result = filterFlowNodes(nodes, {
      ...EMPTY_FLOW_FILTERS,
      searchQuery: "HEROINE",
    });
    expect(result.map((n) => n.id)).toEqual(["n-2"]);
  });

  it("search matches labelName", () => {
    const result = filterFlowNodes(nodes, {
      ...EMPTY_FLOW_FILTERS,
      searchQuery: "final_battle",
    });
    expect(result.map((n) => n.id)).toEqual(["n-3"]);
  });

  it("search still finds a node via title when its labelName is null", () => {
    const result = filterFlowNodes(nodes, {
      ...EMPTY_FLOW_FILTERS,
      searchQuery: "lone",
    });
    // "Lone Memory" matches the title, so it should still be found
    expect(result.map((n) => n.id)).toEqual(["n-4"]);
  });

  it("search trims surrounding whitespace", () => {
    const result = filterFlowNodes(nodes, {
      ...EMPTY_FLOW_FILTERS,
      searchQuery: "  opening  ",
    });
    expect(result.map((n) => n.id)).toEqual(["n-1"]);
  });

  it("combines all filter fields as AND", () => {
    const result = filterFlowNodes(nodes, {
      routeKeys: new Set(["heroine_a"]),
      statuses: new Set(["FINAL"]),
      characterIds: new Set(["char-2"]),
      searchQuery: "battle",
    });
    expect(result.map((n) => n.id)).toEqual(["n-3"]);
  });

  it("returns empty when constraints are mutually exclusive", () => {
    const result = filterFlowNodes(nodes, {
      ...EMPTY_FLOW_FILTERS,
      routeKeys: new Set(["common"]),
      statuses: new Set(["FINAL"]),
    });
    expect(result).toEqual([]);
  });
});
