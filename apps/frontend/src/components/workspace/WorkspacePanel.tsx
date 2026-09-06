import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import {
  PANEL_RESIZE_STEP,
  PANEL_RESIZE_STEP_LARGE,
  type WorkspacePanelConfig,
} from "@/lib/workspace-panels";
import {
  useWorkspacePanel,
  type WorkspacePanelState,
} from "@/hooks/useWorkspacePanel";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PanelResizeHandleProps {
  config: WorkspacePanelConfig;
  width: number;
  ariaLabel: string;
  onPointerResize: WorkspacePanelState["onPointerResize"];
  onKeyboardResize: (delta: number) => void;
  onReset: () => void;
}

function PanelResizeHandle({
  config,
  width,
  ariaLabel,
  onPointerResize,
  onKeyboardResize,
  onReset,
}: PanelResizeHandleProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();

    const step = event.shiftKey ? PANEL_RESIZE_STEP_LARGE : PANEL_RESIZE_STEP;
    const direction =
      event.key === "ArrowRight"
        ? config.side === "left"
          ? 1
          : -1
        : config.side === "left"
          ? -1
          : 1;

    onKeyboardResize(direction * step);
  };

  return (
    /* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- ARIA window splitter */
    <div
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-valuemin={config.minWidth}
      aria-valuemax={config.maxWidth}
      aria-valuenow={width}
      aria-label={ariaLabel}
      className="relative w-2.5 shrink-0 cursor-col-resize touch-none bg-transparent"
      onPointerDown={onPointerResize.onPointerDown}
      onPointerMove={onPointerResize.onPointerMove}
      onPointerUp={onPointerResize.onPointerUp}
      onPointerCancel={onPointerResize.onPointerUp}
      onKeyDown={handleKeyDown}
      onDoubleClick={onReset}
      draggable={false}
      onDragStart={(event) => event.preventDefault()}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border"
      />
    </div>
    /* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
  );
}

export interface WorkspacePanelViewProps {
  panel: WorkspacePanelState;
  config: WorkspacePanelConfig;
  children: ReactNode;
  id: string;
  labelledBy?: string;
  className?: string;
  forceCollapsed?: boolean;
  onOverlayDismiss?: () => void;
}

export function WorkspacePanelView({
  panel,
  config,
  children,
  id,
  labelledBy,
  className,
  forceCollapsed,
  onOverlayDismiss,
}: WorkspacePanelViewProps) {
  const collapsed = forceCollapsed ?? panel.collapsed;
  const panelRef = useRef<HTMLElement>(null);
  useFocusTrap(panelRef, !collapsed && panel.isOverlay);
  const isLeft = config.side === "left";
  const innerBorderClass = isLeft ? "border-r" : "border-l";
  const showHandle = panel.canResize && !collapsed && !panel.isOverlay;
  const resizeLabel = `Resize ${config.side} panel`;

  useEffect(() => {
    if (!panel.isOverlay || collapsed || !onOverlayDismiss) {
      return;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      onOverlayDismiss();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [panel.isOverlay, collapsed, onOverlayDismiss]);

  if (collapsed) {
    return null;
  }

  const panelClassName = cn(
    "bg-panel",
    innerBorderClass,
    "border-border",
    panel.isOverlay
      ? cn("absolute inset-y-0 z-50 shadow", isLeft ? "left-0" : "right-0")
      : "h-full shrink-0",
    className
  );

  const panelElement = (
    <aside
      ref={panelRef}
      id={id}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : config.label}
      className={cn(panelClassName, panel.isOverlay && "flex flex-col")}
      style={{ width: panel.width }}
    >
      {panel.isOverlay ? (
        <div className="flex h-10 shrink-0 items-center justify-end border-b border-border px-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Close ${config.label}`}
            onClick={onOverlayDismiss}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      ) : null}
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</div>
    </aside>
  );

  if (!showHandle) {
    return panelElement;
  }

  if (isLeft) {
    return (
      <>
        {panelElement}
        <PanelResizeHandle
          config={config}
          width={panel.width}
          ariaLabel={resizeLabel}
          onPointerResize={panel.onPointerResize}
          onKeyboardResize={panel.onKeyboardResize}
          onReset={panel.resetWidth}
        />
      </>
    );
  }

  return (
    <>
      <PanelResizeHandle
        config={config}
        width={panel.width}
        ariaLabel={resizeLabel}
        onPointerResize={panel.onPointerResize}
        onKeyboardResize={panel.onKeyboardResize}
        onReset={panel.resetWidth}
      />
      {panelElement}
    </>
  );
}

export interface WorkspacePanelProps {
  config: WorkspacePanelConfig;
  children: ReactNode;
  id: string;
  labelledBy?: string;
  className?: string;
  forceCollapsed?: boolean;
  onOverlayDismiss?: () => void;
}

export function WorkspacePanel({
  config,
  children,
  id,
  labelledBy,
  className,
  forceCollapsed,
  onOverlayDismiss,
}: WorkspacePanelProps) {
  const panel = useWorkspacePanel(config);

  return (
    <WorkspacePanelView
      panel={panel}
      config={config}
      id={id}
      labelledBy={labelledBy}
      className={className}
      forceCollapsed={forceCollapsed}
      onOverlayDismiss={onOverlayDismiss}
    >
      {children}
    </WorkspacePanelView>
  );
}
