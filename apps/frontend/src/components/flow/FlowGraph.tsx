/**
 * FlowGraph - ReactFlow-based flow graph visualization for label routes
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeMouseHandler,
} from "@xyflow/react";
import type { LabelNodeData } from "./LabelNode";
import { useFlowGraph } from "@/hooks/useFlowGraph";
import { useFlowGraphLayout } from "@/hooks/useFlowGraphLayout";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useRouteConfigs } from "@/hooks/useRouteConfigs";
import { useCharacters } from "@/hooks/useCharacters";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  buildRouteColorMap,
  buildEdges,
  buildLayoutNodes,
  buildRouteOptions,
} from "./flow-graph-utils";
import { useFlowLayoutPositions } from "@/hooks/useFlowLayoutPositions";
import { LAYOUT_MODE_STORAGE_KEY, isFlowLayoutMode } from "./flow-layout-mode";
import type { FlowLayoutMode } from "@branchforge/shared";
import {
  EMPTY_FLOW_FILTERS,
  filterFlowNodes,
  isFlowFilterEmpty,
  pruneFlowFilters,
  type FlowGraphFilters,
} from "@/components/flow/flow-filters";
import { sameData, sameStyle } from "./flow-graph-helpers";
import { FlowGraphStatus } from "./FlowGraphStatus";
import { FlowGraphEmpty } from "./FlowGraphEmpty";
import { FlowGraphCanvas } from "./FlowGraphCanvas";
import { FLOW_SEARCH_DEBOUNCE_MS } from "@/lib/constants";

interface FlowGraphProps {
  projectId: string;
  onNodeClick?: (labelId: string) => void;
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

  // Filter state
  const [filters, setFilters] = useState<FlowGraphFilters>(EMPTY_FLOW_FILTERS);

  const debouncedSearchQuery = useDebouncedValue(
    filters.searchQuery,
    FLOW_SEARCH_DEBOUNCE_MS
  );

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

  const routeOptions = useMemo(
    () => buildRouteOptions(flowNodes, routeConfigs),
    [flowNodes, routeConfigs]
  );

  // Prune filter keys that no longer exist after a data refetch
  const validRouteKeys = useMemo(() => {
    const s = new Set<string | null>();
    for (const opt of routeOptions) s.add(opt.key);
    return s;
  }, [routeOptions]);
  const validCharacterIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of characters) s.add(c.id);
    return s;
  }, [characters]);
  const validFilters = useMemo(
    () => pruneFlowFilters(filters, validRouteKeys, validCharacterIds),
    [filters, validRouteKeys, validCharacterIds]
  );

  // Apply filters — uses debounced search to avoid O(n) on every keystroke
  const effectiveFilters = useMemo(
    () => ({ ...validFilters, searchQuery: debouncedSearchQuery }),
    [validFilters, debouncedSearchQuery]
  );
  const filteredNodes = useMemo(
    () => filterFlowNodes(flowNodes, effectiveFilters),
    [flowNodes, effectiveFilters]
  );
  const filteredNodeIds = useMemo(
    () => new Set(filteredNodes.map((n) => n.id)),
    [filteredNodes]
  );

  // Node view state (dimmed/highlighted) for filter matches
  const trimmedQuery = debouncedSearchQuery.trim();
  const nodeViewState = useMemo(() => {
    const filtersActive = !isFlowFilterEmpty(effectiveFilters);
    const trimmed = trimmedQuery.toLowerCase();
    const map = new Map<string, { dimmed: boolean; highlighted: boolean }>();
    for (const node of flowNodes) {
      const passes = filteredNodeIds.has(node.id);
      let matchesQuery = false;
      if (trimmed.length > 0) {
        const title = node.title.toLowerCase();
        const labelName = node.labelName?.toLowerCase() ?? "";
        // react-doctor-disable-next-line react-doctor/js-set-map-lookups -- String.prototype.includes FP; react-doctor reports ×2 on same line
        matchesQuery = title.includes(trimmed) || labelName.includes(trimmed);
      }
      map.set(node.id, {
        dimmed: filtersActive && !passes,
        highlighted: matchesQuery,
      });
    }
    return map;
  }, [flowNodes, filteredNodeIds, effectiveFilters, trimmedQuery]);

  // Auto-layout (Web Worker for large graphs)
  const { positions: autoLayout, isComputing: layoutComputing } =
    useFlowLayoutPositions(layoutMode, flowNodes, flowEdges);

  // Overlay saved positions on auto-layout
  const layoutNodesResult = useMemo(
    () =>
      buildLayoutNodes(flowNodes, autoLayout, routeColorMap, savedPositions),
    [flowNodes, autoLayout, routeColorMap, savedPositions]
  );

  // Decorate nodes with view-state flags (dimmed / highlighted)
  const decoratedNodes = useMemo(() => {
    return layoutNodesResult.map((n) => {
      const data = n.data as LabelNodeData;
      const view = nodeViewState.get(n.id);
      const dimmed = view?.dimmed ?? false;
      const highlighted = view?.highlighted ?? false;
      if (data.dimmed === dimmed && data.highlighted === highlighted) return n;
      return { ...n, data: { ...data, dimmed, highlighted } };
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

  // Sync decoratedNodes → ReactFlow nodes (preserves existing Node objects)
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
        if (!posChanged && !dataChanged && !styleChanged) return existing;
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

  // Sync layoutEdgesResult → ReactFlow edges
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
      if (onNodeClick && node.data?.labelId) onNodeClick(node.data.labelId);
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

  // Guard: loading / error / empty / computing
  if (isLoading)
    return <FlowGraphStatus loading>Loading flow graph...</FlowGraphStatus>;
  if (error)
    return (
      <FlowGraphStatus tone="error">
        Failed to load flow graph: {error.message}
      </FlowGraphStatus>
    );
  if (flowNodes.length === 0) return <FlowGraphEmpty />;
  if (layoutComputing)
    return (
      <FlowGraphStatus
        loading
        subtitle="This one-time layout is cached — reopening will be instant."
      >
        Arranging {flowNodes.length} nodes...
      </FlowGraphStatus>
    );

  return (
    <FlowGraphCanvas
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={handleNodeClick as NodeMouseHandler}
      onNodeDragStop={onNodeDragStop}
      flowNodesLength={flowNodes.length}
      characters={characters}
      validFilters={validFilters}
      onFiltersChange={setFilters}
      routeOptions={routeOptions}
      routeColorMap={routeColorMap}
      layoutMode={layoutMode}
      isBusy={isSaving || isResetting}
      onLayoutModeChange={setLayoutMode}
      onResetLayout={handleResetLayout}
    />
  );
}
