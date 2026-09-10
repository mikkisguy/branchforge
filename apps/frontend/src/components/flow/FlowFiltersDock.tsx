import { useCallback, type ReactNode } from "react";
import { WorkspacePanelView } from "@/components/workspace/WorkspacePanel";
import { WorkspacePanelToggle } from "@/components/workspace/WorkspacePanelToggle";
import { FLOW_FILTERS_PANEL } from "@/lib/workspace-panels";
import { useWorkspacePanel } from "@/hooks/useWorkspacePanel";

interface FlowFiltersDockProps {
  filters: ReactNode | ((controls: { onCollapse: () => void }) => ReactNode);
  children: ReactNode;
}

export function FlowFiltersDock({ filters, children }: FlowFiltersDockProps) {
  const filtersPanel = useWorkspacePanel(FLOW_FILTERS_PANEL);
  const setCollapsed = filtersPanel.setCollapsed;
  const onCollapse = useCallback(() => {
    setCollapsed(true);
  }, [setCollapsed]);
  const filterContent =
    typeof filters === "function" ? filters({ onCollapse }) : filters;

  return (
    <div className="relative flex h-full w-full min-h-0">
      {filtersPanel.collapsed && (
        <div className="absolute left-3 top-3 z-10">
          <WorkspacePanelToggle
            side="left"
            collapsed
            panelId="flow-filters-panel"
            label="filters"
            onToggle={() => filtersPanel.setCollapsed(false)}
            className="border border-border bg-raised shadow-sm"
          />
        </div>
      )}
      {!filtersPanel.collapsed && (
        <>
          {filtersPanel.isOverlay ? (
            <button
              type="button"
              aria-label="Close overlays"
              tabIndex={-1}
              className="absolute inset-0 z-40 bg-black/40"
              onClick={() => filtersPanel.setCollapsed(true)}
            />
          ) : null}
          <WorkspacePanelView
            panel={filtersPanel}
            config={FLOW_FILTERS_PANEL}
            id="flow-filters-panel"
            className="flex min-h-0 flex-col"
            onOverlayDismiss={() => filtersPanel.setCollapsed(true)}
          >
            {filterContent}
          </WorkspacePanelView>
        </>
      )}
      <div className="relative min-h-0 min-w-0 flex-1">{children}</div>
    </div>
  );
}
