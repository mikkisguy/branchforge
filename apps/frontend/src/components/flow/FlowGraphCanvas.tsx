/**
 * FlowGraphCanvas - Graph canvas rendering (ReactFlow, background, controls, minimap, overlays)
 */

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
import { FlowGraphToolbar } from "./FlowGraphToolbar";
import { LabelNodeMemo } from "./LabelNode";
import {
  FLOW_MINIMAP_HIDE_THRESHOLD,
  FLOW_VIRTUALIZATION_THRESHOLD,
} from "@/lib/constants";
import type { FlowLayoutMode, Character } from "@branchforge/shared";
import type { FlowGraphFilters } from "@/components/flow/flow-filters";

const nodeTypes = {
  label: LabelNodeMemo,
};

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
  return (
    <div className="h-full w-full absolute inset-0">
      <FlowCharacterProvider characters={characters}>
        <ReactFlow
          colorMode="dark"
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
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="#334155"
          />
          <Controls className="!bg-slate-800 !border-slate-600 !rounded-lg" />
          {flowNodesLength <= FLOW_MINIMAP_HIDE_THRESHOLD && (
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
              onChange={onFiltersChange}
              routes={routeOptions}
              routeColors={routeColorMap}
              characters={characters}
            />
          </div>
          <div className="absolute top-4 right-4 z-10 flex items-center gap-2 flex-wrap max-sm:flex-col max-sm:items-end">
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
  );
}
