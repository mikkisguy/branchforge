import { useCallback, type ReactNode } from "react";
import { ChevronRight, Filter } from "lucide-react";
import { WorkspacePanelView } from "@/components/workspace/WorkspacePanel";
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
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-raised px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Filter className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Filters</span>
            <ChevronRight
              className="h-4 w-4 text-muted-foreground"
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
