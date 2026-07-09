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
import { RotateCcw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { LabelNodeMemo, type LabelNodeData } from "./LabelNode";
import { LayoutModeSelector } from "./LayoutModeSelector";
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
} from "./flow-graph-utils";
import { useFlowLayoutPositions } from "@/hooks/useFlowLayoutPositions";
import { LAYOUT_MODE_STORAGE_KEY, isFlowLayoutMode } from "./flow-layout-mode";
import type { FlowLayoutMode } from "@branchforge/shared";
import { FLOW_LAYOUT_MODE_LABELS } from "@branchforge/shared";
import {
  EMPTY_FLOW_FILTERS,
  filterFlowNodes,
  isFlowFilterEmpty,
  type FlowGraphFilters,
} from "@/components/flow/flow-filters";
import { FlowGraphFiltersPanel } from "@/components/flow/FlowGraphFiltersPanel";
import { FlowCharacterProvider } from "./flow-character-provider";
import {
  FLOW_MINIMAP_HIDE_THRESHOLD,
  FLOW_SEARCH_DEBOUNCE_MS,
  FLOW_VIRTUALIZATION_THRESHOLD,
} from "@/lib/constants";

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

  // Debounce the search query so the O(n) filter + view-state passes run
  // once after the user stops typing, not on every keystroke. The text
  // field stays responsive (bound to the immediate `filters` state).
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

  // Routes available in the project. Always include an "Unassigned" bucket
  // so users can find labels without a routeKey.
  const routeOptions = useMemo(() => {
    const presentKeys = new Set<string>();
    let hasUnassigned = false;
    for (const node of flowNodes) {
      if (node.routeKey) {
        presentKeys.add(node.routeKey);
      } else {
        hasUnassigned = true;
      }
    }
    const fromConfigs: Array<{ key: string; label: string }> = [];
    for (const c of routeConfigs) {
      if (presentKeys.has(c.routeKey)) {
        fromConfigs.push({ key: c.routeKey, label: c.routeName });
      }
    }
    // Add any present routes that don't have a config (defensive — labels
    // can have routeKey values not present in route_configs).
    const known = new Set(fromConfigs.map((r) => r.key));
    for (const k of presentKeys) {
      if (!known.has(k)) fromConfigs.push({ key: k, label: k });
    }
    fromConfigs.sort((a, b) => a.label.localeCompare(b.label));
    const options: Array<{ key: string | null; label: string }> = [
      ...fromConfigs,
    ];
    if (hasUnassigned) {
      options.push({ key: null, label: "Unassigned" });
    }
    return options;
  }, [flowNodes, routeConfigs]);

  // Prune any selected filter keys that no longer exist after a refetch —
  // e.g. a route that was deleted server-side, or a character that was
  // removed. Derived during render (not via a useEffect + setState) to
  // avoid an extra render cascade.
  const validFilters = useMemo(() => {
    const validRouteKeys = new Set<string | null>();
    for (const opt of routeOptions) validRouteKeys.add(opt.key);
    const validCharacterIds = new Set(characters.map((c) => c.id));

    const nextRouteKeys = new Set<string | null>();
    for (const k of filters.routeKeys) {
      if (validRouteKeys.has(k)) nextRouteKeys.add(k);
    }
    const nextCharacterIds = new Set<string>();
    for (const id of filters.characterIds) {
      if (validCharacterIds.has(id)) nextCharacterIds.add(id);
    }

    if (
      nextRouteKeys.size === filters.routeKeys.size &&
      nextCharacterIds.size === filters.characterIds.size
    ) {
      return filters;
    }
    return {
      ...filters,
      routeKeys: nextRouteKeys,
      characterIds: nextCharacterIds,
    };
  }, [filters, routeOptions, characters]);

  // Apply the active filter set. The filter is purely a *view* on the data:
  // the layout, edges, and saved positions all still reference the
  // original (unfiltered) node set so re-running the predicate is cheap
  // and doesn't disturb the user's drag positions.
  //
  // `effectiveFilters` substitutes the debounced search query so the O(n)
  // predicate runs once after the user stops typing, not on every keystroke.
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

  // We render every node, but mark the ones that failed the filter as
  // `dimmed` so the user retains spatial context. A node with a matching
  // search query is also `highlighted` (additive on top of `dimmed`).
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
        // Substring searches against a bounded label set — not array
        // membership checks. The js-set-map-lookups rule fires on any
        // `.includes` inside a loop, but the alternative (a Set of
        // n-grams) is over-engineering for short title strings.
        // react-doctor-disable-next-line react-doctor/js-set-map-lookups
        matchesQuery =
          // react-doctor-disable-next-line react-doctor/js-set-map-lookups
          title.includes(trimmed) || labelName.includes(trimmed);
      }
      map.set(node.id, {
        dimmed: filtersActive && !passes,
        highlighted: matchesQuery,
      });
    }
    return map;
  }, [flowNodes, filteredNodeIds, effectiveFilters, trimmedQuery]);

  // Auto-layout (dagre for FLOW, row grouping for ROUTE/FILE) depends only
  // on the graph topology and mode — NOT on saved positions. For large
  // graphs the layout runs in a Web Worker so dagre's multi-second
  // computation doesn't block the main thread.
  const { positions: autoLayout, isComputing: layoutComputing } =
    useFlowLayoutPositions(layoutMode, flowNodes, flowEdges);

  // Overlay saved positions on top of the auto-layout — cheap O(n) map that
  // only allocates new node objects, no layout algorithm involved.
  const layoutNodesResult = useMemo(
    () =>
      buildLayoutNodes(flowNodes, autoLayout, routeColorMap, savedPositions),
    [flowNodes, autoLayout, routeColorMap, savedPositions]
  );

  // Decorate each layout node with the view-state flags (dimmed /
  // highlighted) so LabelNode can render the correct styles. Character
  // appearances are now resolved lazily by the tooltip via context, so they
  // no longer need to be pre-computed and injected here — this removes an
  // O(n) pass and a per-node array allocation from every data refresh.
  const decoratedNodes = useMemo(() => {
    return layoutNodesResult.map((n) => {
      const data = n.data as LabelNodeData;
      const view = nodeViewState.get(n.id);
      const dimmed = view?.dimmed ?? false;
      const highlighted = view?.highlighted ?? false;

      if (data.dimmed === dimmed && data.highlighted === highlighted) {
        return n;
      }
      return {
        ...n,
        data: { ...data, dimmed, highlighted },
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
    return <FlowGraphStatus loading>Loading flow graph...</FlowGraphStatus>;
  }

  if (error) {
    return (
      <FlowGraphStatus tone="error">
        Failed to load flow graph: {error.message}
      </FlowGraphStatus>
    );
  }

  if (flowNodes.length === 0) {
    return <FlowGraphEmpty />;
  }

  if (layoutComputing) {
    return (
      <FlowGraphStatus
        loading
        subtitle="This one-time layout is cached — reopening will be instant."
      >
        Arranging {flowNodes.length} nodes...
      </FlowGraphStatus>
    );
  }

  return (
    <div className="h-full w-full absolute inset-0">
      <FlowCharacterProvider characters={characters}>
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
          fitViewOptions={{
            padding: 0.2,
            // For large graphs, cap how far fitView zooms out. Without
            // this, 500 nodes zoom out to ~0.1, making every node "visible"
            // and defeating virtualization — all 500 mount as DOM at once.
            // At 0.3 the user sees a meaningful region of the graph and
            // can zoom out manually for the full overview.
            ...(flowNodes.length > FLOW_VIRTUALIZATION_THRESHOLD && {
              minZoom: 0.3,
            }),
          }}
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          // Touch-device interaction: pan with drag, pinch to zoom,
          // don't auto-select nodes on drag (avoids accidental
          // selections while panning on touch screens).
          panOnDrag={[0, 1]}
          selectNodesOnDrag={false}
          // Only render nodes/edges inside the viewport for large graphs.
          // Below the threshold, keeping all nodes mounted is cheaper than
          // the mount/unmount churn that virtualization triggers when nodes
          // cross the viewport boundary during panning (which causes a
          // noticeable stutter with the heavyweight LabelNode component).
          onlyRenderVisibleElements={
            flowNodes.length > FLOW_VIRTUALIZATION_THRESHOLD
          }
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="#334155"
          />
          <Controls className="!bg-slate-800 !border-slate-600 !rounded-lg" />
          {flowNodes.length <= FLOW_MINIMAP_HIDE_THRESHOLD && (
            <MiniMap
              className="!bg-slate-800 !border-slate-600 !rounded-lg"
              maskColor="rgba(15, 23, 42, 0.7)"
              nodeColor={(node) => {
                const data = node.data as { routeColor?: string };
                return data.routeColor ?? "#64748b";
              }}
            />
          )}
          <div className="absolute top-4 left-4 z-10">
            <FlowGraphFiltersPanel
              filters={validFilters}
              onChange={setFilters}
              routes={routeOptions}
              routeColors={routeColorMap}
              characters={characters}
            />
          </div>
          <div className="absolute top-4 right-4 z-10 flex items-center gap-2 flex-wrap max-sm:flex-col max-sm:items-end">
            <FlowGraphToolbar
              layoutMode={layoutMode}
              isBusy={isSaving || isResetting}
              onLayoutModeChange={setLayoutMode}
              onResetLayout={handleResetLayout}
            />
          </div>
        </ReactFlow>
      </FlowCharacterProvider>
    </div>
  );
}

function FlowGraphStatus({
  tone = "muted",
  loading = false,
  subtitle,
  children,
}: {
  tone?: "muted" | "error";
  loading?: boolean;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-1.5">
        <div
          className={cn(
            "flex items-center gap-2.5",
            tone === "error" ? "text-red-400" : "text-slate-400"
          )}
        >
          {loading && (
            <Loader2 className="size-4 animate-spin text-[var(--theme-color)]" />
          )}
          <span className={loading ? "animate-pulse" : undefined}>
            {children}
          </span>
        </div>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
    </div>
  );
}

function FlowGraphEmpty() {
  return (
    <FlowGraphStatus>
      <div className="text-center">
        <p className="text-lg font-medium mb-2">No labels found</p>
        <p className="text-sm">
          Add labels to your project to see the flow visualization.
        </p>
      </div>
    </FlowGraphStatus>
  );
}

interface FlowGraphToolbarProps {
  layoutMode: FlowLayoutMode;
  isBusy: boolean;
  onLayoutModeChange: (mode: FlowLayoutMode) => void;
  onResetLayout: () => void;
}

function FlowGraphToolbar({
  layoutMode,
  isBusy,
  onLayoutModeChange,
  onResetLayout,
}: FlowGraphToolbarProps) {
  return (
    <>
      <LayoutModeSelector disabled={isBusy} onChange={onLayoutModeChange} />
      <button
        type="button"
        onClick={onResetLayout}
        disabled={isBusy}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 border border-slate-600 rounded-lg hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title={`Reset ${FLOW_LAYOUT_MODE_LABELS[layoutMode].toLowerCase()} positions to auto-arrange`}
      >
        <RotateCcw className="w-3.5 h-3.5" />
        Reset {FLOW_LAYOUT_MODE_LABELS[layoutMode]}
      </button>
    </>
  );
}
