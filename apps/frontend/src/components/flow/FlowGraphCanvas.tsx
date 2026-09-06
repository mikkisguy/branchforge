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
import { FlowCharacterProvider } from "./flow-character-provider";
import { FlowGraphFiltersPanel } from "@/components/flow/FlowGraphFiltersPanel";
import { FlowFiltersDock } from "@/components/flow/FlowFiltersDock";
import { FlowGraphToolbar } from "./FlowGraphToolbar";
import { LabelNodeMemo } from "./LabelNode";
import {
  FLOW_MINIMAP_HIDE_THRESHOLD,
  FLOW_VIRTUALIZATION_THRESHOLD,
} from "@/lib/constants";
import type { FlowLayoutMode, Character } from "@branchforge/shared";
import type { FlowGraphFilters } from "@/components/flow/flow-filters";
import { useTheme } from "@/contexts/useTheme";
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
  const borderColor = useHslCssVar("--border", "hsl(0 0% 20%)");
  const canvasMaskColor = useHslCssVarAlpha(
    "--canvas",
    0.7,
    "hsl(0 0% 5% / 0.7)"
  );
  const mutedNodeColor = useHslCssVar("--muted-foreground", "hsl(0 0% 55%)");

  return (
    <FlowFiltersDock
      filters={({ onCollapse }) => (
        <FlowGraphFiltersPanel
          filters={validFilters}
          onChange={onFiltersChange}
          routes={routeOptions}
          routeColors={routeColorMap}
          characters={characters}
          onCollapse={onCollapse}
          className="h-full min-h-0"
        />
      )}
    >
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
    </FlowFiltersDock>
  );
}
