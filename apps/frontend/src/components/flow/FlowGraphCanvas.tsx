/**
 * FlowGraphCanvas - Graph canvas rendering (ReactFlow, background, controls, minimap, overlays)
 */

import { useEffect, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeMouseHandler,
  type OnNodesChange,
  type OnEdgesChange,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ChevronRight, Filter } from "lucide-react";
import { FlowCharacterProvider } from "./flow-character-provider";
import { FlowGraphFiltersPanel } from "@/components/flow/FlowGraphFiltersPanel";
import { FlowGraphToolbar } from "./FlowGraphToolbar";
import { LabelNodeMemo } from "./LabelNode";
import {
  FLOW_MINIMAP_HIDE_THRESHOLD,
  FLOW_VIRTUALIZATION_THRESHOLD,
} from "@/lib/constants";
import type { FlowLayoutMode, Character } from "@branchforge/shared";
import type { FlowGraphFilters } from "@/components/flow/flow-filters";
import { useTheme } from "@/contexts/useTheme";
import { WorkspacePanelView } from "@/components/workspace/WorkspacePanel";
import { FLOW_FILTERS_PANEL } from "@/lib/workspace-panels";
import { useWorkspacePanel } from "@/hooks/useWorkspacePanel";
import { cn } from "@/lib/utils";

const nodeTypes = {
  label: LabelNodeMemo,
};

function useHslCssVar(name: string, fallback: string): string {
  const { isDarkMode, theme } = useTheme();
  const [color, setColor] = useState(fallback);

  useEffect(() => {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    if (raw) {
      setColor(`hsl(${raw})`);
    }
  }, [name, isDarkMode, theme]);

  return color;
}

function useHslCssVarAlpha(
  name: string,
  alpha: number,
  fallback: string
): string {
  const { isDarkMode, theme } = useTheme();
  const [color, setColor] = useState(fallback);

  useEffect(() => {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    if (raw) {
      setColor(`hsl(${raw} / ${alpha})`);
    }
  }, [alpha, name, isDarkMode, theme]);

  return color;
}

interface FlowGraphCanvasProps {
  // ReactFlow state
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onNodeClick: NodeMouseHandler;
  onNodeDragStop: () => void;
  flowNodesLength: number;

  // Characters context
  characters: Character[];

  // Filters panel
  validFilters: FlowGraphFilters;
  onFiltersChange: (filters: FlowGraphFilters) => void;
  routeOptions: ReadonlyArray<{ key: string | null; label: string }>;
  routeColorMap: ReadonlyMap<string, string>;

  // Toolbar
  layoutMode: FlowLayoutMode;
  isBusy: boolean;
  onLayoutModeChange: (mode: FlowLayoutMode) => void;
  onResetLayout: () => void;
}

export function FlowGraphCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onNodeClick,
  onNodeDragStop,
  flowNodesLength,
  characters,
  validFilters,
  onFiltersChange,
  routeOptions,
  routeColorMap,
  layoutMode,
  isBusy,
  onLayoutModeChange,
  onResetLayout,
}: FlowGraphCanvasProps) {
  const { isDarkMode } = useTheme();
  const filtersPanel = useWorkspacePanel(FLOW_FILTERS_PANEL);
  const borderColor = useHslCssVar("--border", "hsl(0 0% 20%)");
  const canvasMaskColor = useHslCssVarAlpha(
    "--canvas",
    0.7,
    "hsl(0 0% 5% / 0.7)"
  );
  const mutedNodeColor = useHslCssVar("--muted-foreground", "hsl(0 0% 55%)");

  return (
    <div className="relative flex h-full w-full min-h-0">
      {(filtersPanel.collapsed || filtersPanel.isOverlay) && (
        <div
          className={
            filtersPanel.collapsed
              ? "shrink-0 border-r border-border bg-panel px-2 py-3"
              : "sr-only"
          }
        >
          <button
            type="button"
            onClick={() => filtersPanel.setCollapsed(false)}
            aria-label="Open filters"
            aria-expanded={!filtersPanel.collapsed}
            title="Open filters"
            className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-border bg-raised text-muted-foreground text-xs font-medium hover:bg-accent hover:text-foreground transition-colors"
          >
            <Filter className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Filters</span>
            <ChevronRight
              className="w-4 h-4 text-muted-foreground"
              aria-hidden="true"
            />
          </button>
        </div>
      )}
      {!filtersPanel.collapsed && (
        <>
          {filtersPanel.isOverlay ? (
            <button
              type="button"
              aria-label="Close overlays"
              className="absolute inset-0 z-40 bg-black/40"
              onClick={() => filtersPanel.setCollapsed(true)}
            />
          ) : null}
          <WorkspacePanelView
            panel={filtersPanel}
            config={FLOW_FILTERS_PANEL}
            id="flow-filters-panel"
            className="min-h-0 flex flex-col"
            onOverlayDismiss={() => filtersPanel.setCollapsed(true)}
          >
            <FlowGraphFiltersPanel
              filters={validFilters}
              onChange={onFiltersChange}
              routes={routeOptions}
              routeColors={routeColorMap}
              characters={characters}
              onCollapse={() => filtersPanel.setCollapsed(true)}
              className="h-full min-h-0"
            />
          </WorkspacePanelView>
        </>
      )}

      <div className="relative flex-1 min-h-0 min-w-0">
        <FlowCharacterProvider characters={characters}>
          <ReactFlow
            colorMode={isDarkMode ? "dark" : "light"}
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onNodeDragStop={onNodeDragStop}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{
              padding: 0.2,
              ...(flowNodesLength > FLOW_VIRTUALIZATION_THRESHOLD && {
                minZoom: 0.3,
              }),
            }}
            minZoom={0.1}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            panOnDrag={[0, 1]}
            selectNodesOnDrag={false}
            onlyRenderVisibleElements={
              flowNodesLength > FLOW_VIRTUALIZATION_THRESHOLD
            }
            className="bg-canvas"
          >
            <Background
              variant={BackgroundVariant.Lines}
              gap={24}
              size={1}
              color={borderColor}
            />
            <Controls className="!bg-raised !border-border !rounded-lg" />
            {flowNodesLength <= FLOW_MINIMAP_HIDE_THRESHOLD && (
              <MiniMap
                className="!bg-raised !border-border !rounded-lg"
                maskColor={canvasMaskColor}
                nodeColor={(node) => {
                  const data = node.data as { routeColor?: string };
                  return data.routeColor ?? mutedNodeColor;
                }}
              />
            )}
            <div
              className={cn(
                "absolute top-3 right-3 z-10 flex items-center gap-2",
                "flex-wrap max-sm:flex-col max-sm:items-end"
              )}
            >
              <FlowGraphToolbar
                layoutMode={layoutMode}
                isBusy={isBusy}
                onLayoutModeChange={onLayoutModeChange}
                onResetLayout={onResetLayout}
              />
            </div>
          </ReactFlow>
        </FlowCharacterProvider>
      </div>
    </div>
  );
}
