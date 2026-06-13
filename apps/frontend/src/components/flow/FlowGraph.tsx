/**
 * FlowGraph - ReactFlow-based flow graph visualization for label routes
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { RotateCcw } from "lucide-react";
import { LabelNodeMemo, type LabelNodeData } from "./LabelNode";
import { LayoutModeSelector } from "./LayoutModeSelector";
import { useFlowGraph } from "@/hooks/useFlowGraph";
import { useFlowGraphLayout } from "@/hooks/useFlowGraphLayout";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useRouteConfigs } from "@/hooks/useRouteConfigs";
import { useCharacters } from "@/hooks/useCharacters";
import {
  buildRouteColorMap,
  buildEdges,
  layoutNodes,
} from "./flow-graph-utils";
import { LAYOUT_MODE_STORAGE_KEY, isFlowLayoutMode } from "./flow-layout-mode";
import type { FlowLayoutMode } from "@branchforge/shared";
import { FLOW_LAYOUT_MODE_LABELS } from "@branchforge/shared";
import {
  EMPTY_FLOW_FILTERS,
  filterFlowNodes,
  isFlowFilterEmpty,
  type FlowGraphFilters,
} from "./flow-filters";
import { FlowGraphFiltersPanel } from "./FlowGraphFiltersPanel";

interface FlowGraphProps {
  projectId: string;
  onNodeClick?: (labelId: string) => void;
}

const nodeTypes = {
  label: LabelNodeMemo,
};

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

  const { routeConfigs } = useRouteConfigs(projectId);
  const { characters } = useCharacters(projectId);

  // Filter state (search + multi-select filters). Lives here, not in
  // localStorage, so each dialog open session starts clean — filters
  // are an in-context "what am I looking at right now" tool.
  const [filters, setFilters] = useState<FlowGraphFilters>(EMPTY_FLOW_FILTERS);

  const routeColorMap = useMemo(
    () => buildRouteColorMap(flowNodes),
    [flowNodes]
  );

  const [layoutModeRaw, setLayoutMode] = useLocalStorage<string>(
    LAYOUT_MODE_STORAGE_KEY,
    "FLOW",
    {
      validate: (value) => typeof value === "string" && isFlowLayoutMode(value),
    }
  );
  const layoutMode: FlowLayoutMode = isFlowLayoutMode(layoutModeRaw)
    ? layoutModeRaw
    : "FLOW";

  const {
    positions: savedPositions,
    handleNodeDragStop: handleLayoutDragStop,
    handleResetLayout,
    isSaving,
    isResetting,
  } = useFlowGraphLayout(projectId, layoutMode);

  // Routes available in the project. Always include an "Unassigned" bucket
  // so users can find labels without a routeKey.
  const routeOptions = useMemo(() => {
    const presentKeys = new Set<string>();
    for (const node of flowNodes) {
      if (node.routeKey) presentKeys.add(node.routeKey);
    }
    const fromConfigs = routeConfigs
      .filter((c) => presentKeys.has(c.routeKey))
      .map((c) => ({ key: c.routeKey, label: c.routeName }));
    // Add any present routes that don't have a config (defensive — labels
    // can have routeKey values not present in route_configs).
    const known = new Set(fromConfigs.map((r) => r.key));
    for (const k of presentKeys) {
      if (!known.has(k)) fromConfigs.push({ key: k, label: k });
    }
    const options: Array<{ key: string | null; label: string }> = [
      ...fromConfigs.sort((a, b) => a.label.localeCompare(b.label)),
    ];
    const hasUnassigned = flowNodes.some((n) => !n.routeKey);
    if (hasUnassigned) {
      options.push({ key: null, label: "Unassigned" });
    }
    return options;
  }, [flowNodes, routeConfigs]);

  // Apply the active filter set. The filter is purely a *view* on the data:
  // the layout, edges, and saved positions all still reference the
  // original (unfiltered) node set so re-running the predicate is cheap
  // and doesn't disturb the user's drag positions.
  const filteredNodes = useMemo(
    () => filterFlowNodes(flowNodes, filters),
    [flowNodes, filters]
  );
  const filteredNodeIds = useMemo(
    () => new Set(filteredNodes.map((n) => n.id)),
    [filteredNodes]
  );

  // We render every node, but mark the ones that failed the filter as
  // `dimmed` so the user retains spatial context. A node with a matching
  // search query is also `highlighted` (additive on top of `dimmed`).
  const trimmedQuery = filters.searchQuery.trim();
  const nodeViewState = useMemo(() => {
    const filtersActive = !isFlowFilterEmpty(filters);
    const trimmed = trimmedQuery.toLowerCase();
    const map = new Map<string, { dimmed: boolean; highlighted: boolean }>();
    for (const node of flowNodes) {
      const passes = filteredNodeIds.has(node.id);
      let matchesQuery = false;
      if (trimmed.length > 0) {
        const title = node.title.toLowerCase();
        const labelName = node.labelName?.toLowerCase() ?? "";
        matchesQuery = title.includes(trimmed) || labelName.includes(trimmed);
      }
      map.set(node.id, {
        dimmed: filtersActive && !passes,
        highlighted: matchesQuery,
      });
    }
    return map;
  }, [flowNodes, filteredNodeIds, filters, trimmedQuery]);

  const layoutNodesResult = useMemo(
    () =>
      layoutNodes(
        flowNodes,
        flowEdges,
        routeColorMap,
        savedPositions,
        layoutMode
      ),
    [flowNodes, flowEdges, routeColorMap, savedPositions, layoutMode]
  );

  // Decorate each layout node with the view-state flags so LabelNode can
  // render dimmed/highlighted styles. Done as a separate pass so the
  // position-comparison effect downstream can short-circuit on the
  // (cheap) data-shape equality check.
  const decoratedNodes = useMemo(() => {
    return layoutNodesResult.map((n) => {
      const view = nodeViewState.get(n.id);
      if (!view) return n;
      const data = n.data as LabelNodeData;
      if (
        data.dimmed === view.dimmed &&
        data.highlighted === view.highlighted
      ) {
        return n;
      }
      return {
        ...n,
        data: { ...data, dimmed: view.dimmed, highlighted: view.highlighted },
      };
    });
  }, [layoutNodesResult, nodeViewState]);

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
      let changed = prevById.size !== decoratedNodes.length;
      const next = decoratedNodes.map((layoutNode) => {
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
  }, [decoratedNodes, setNodes]);

  useEffect(() => {
    const key = layoutEdgesResult
      .map(
        (e) =>
          `${e.id}:${e.source}:${e.target}:${e.sourceHandle ?? ""}:${e.targetHandle ?? ""}:${JSON.stringify(e.style ?? {})}:${JSON.stringify(e.data ?? {})}`
      )
      .join("|");
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
        colorMode="dark"
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
        <div className="absolute top-4 left-4 z-10">
          <FlowGraphFiltersPanel
            filters={filters}
            onChange={setFilters}
            routes={routeOptions}
            routeColors={routeColorMap}
            characters={characters}
          />
        </div>
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
          <LayoutModeSelector
            disabled={isSaving || isResetting}
            onChange={setLayoutMode}
          />
          <button
            type="button"
            onClick={handleResetLayout}
            disabled={isSaving || isResetting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 border border-slate-600 rounded-lg hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={`Reset ${FLOW_LAYOUT_MODE_LABELS[layoutMode].toLowerCase()} positions to auto-arrange`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset {FLOW_LAYOUT_MODE_LABELS[layoutMode]}
          </button>
        </div>
      </ReactFlow>
    </div>
  );
}
