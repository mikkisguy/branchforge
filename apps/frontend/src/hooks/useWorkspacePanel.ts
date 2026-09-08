import { useCallback, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  clampPanelWidth,
  type WorkspacePanelConfig,
} from "@/lib/workspace-panels";
import {
  useLocalStorageBoolean,
  useLocalStorageNumber,
} from "@/hooks/useLocalStorage";
import { useWorkspaceBreakpoint } from "@/hooks/useWorkspaceBreakpoint";

export interface WorkspacePanelPointerHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
}

export interface WorkspacePanelState {
  width: number;
  collapsed: boolean;
  setCollapsed: (value: boolean | ((prev: boolean) => boolean)) => void;
  canResize: boolean;
  breakpoint: ReturnType<typeof useWorkspaceBreakpoint>["breakpoint"];
  isOverlay: boolean;
  onPointerResize: WorkspacePanelPointerHandlers;
  onKeyboardResize: (delta: number) => void;
  resetWidth: () => void;
  setWidth: (width: number) => void;
}

export function isPanelOverlay(
  side: WorkspacePanelConfig["side"],
  breakpoint: ReturnType<typeof useWorkspaceBreakpoint>["breakpoint"]
): boolean {
  if (side === "left") {
    return breakpoint === "narrow" || breakpoint === "mobile";
  }

  return (
    breakpoint === "medium" ||
    breakpoint === "narrow" ||
    breakpoint === "mobile"
  );
}

export function useWorkspacePanel(
  config: WorkspacePanelConfig
): WorkspacePanelState {
  const { breakpoint, canResize } = useWorkspaceBreakpoint();
  const [width, setStoredWidth] = useLocalStorageNumber(
    config.widthKey,
    config.defaultWidth,
    {
      validate: (value) => {
        const clamped = clampPanelWidth(value, config);
        return Number.isFinite(value) && clamped === value;
      },
    }
  );
  const [storedCollapsed, setStoredCollapsed] = useLocalStorageBoolean(
    config.collapseKey,
    false
  );
  const [overlayCollapsed, setOverlayCollapsed] = useState(true);

  const isOverlay = isPanelOverlay(config.side, breakpoint);
  const [prevIsOverlay, setPrevIsOverlay] = useState(isOverlay);

  if (isOverlay !== prevIsOverlay) {
    setPrevIsOverlay(isOverlay);
    if (isOverlay) {
      setOverlayCollapsed(true);
    }
  }

  const collapsed = isOverlay ? overlayCollapsed : storedCollapsed;

  const setCollapsed = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      if (isOverlay) {
        setOverlayCollapsed(value);
      } else {
        setStoredCollapsed(value);
      }
    },
    [isOverlay, setStoredCollapsed]
  );

  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const setWidth = useCallback(
    (nextWidth: number) => {
      const clamped = clampPanelWidth(nextWidth, config);
      if (clamped !== width) {
        setStoredWidth(clamped);
      }
    },
    [config, setStoredWidth, width]
  );

  const resetWidth = useCallback(() => {
    setWidth(config.defaultWidth);
  }, [config.defaultWidth, setWidth]);

  const onKeyboardResize = useCallback(
    (delta: number) => {
      setWidth(width + delta);
    },
    [setWidth, width]
  );

  const onPointerResize: WorkspacePanelPointerHandlers = {
    onPointerDown: useCallback(
      (event: ReactPointerEvent<HTMLElement>) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { startX: event.clientX, startWidth: width };
      },
      [width]
    ),
    onPointerMove: useCallback(
      (event: ReactPointerEvent<HTMLElement>) => {
        if (
          dragRef.current === null ||
          !event.currentTarget.hasPointerCapture(event.pointerId)
        ) {
          return;
        }

        const dx = event.clientX - dragRef.current.startX;
        const delta = config.side === "left" ? dx : -dx;
        setWidth(dragRef.current.startWidth + delta);
      },
      [config.side, setWidth]
    ),
    onPointerUp: useCallback((event: ReactPointerEvent<HTMLElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      dragRef.current = null;
    }, []),
  };

  return {
    width,
    collapsed,
    setCollapsed,
    canResize,
    breakpoint,
    isOverlay,
    onPointerResize,
    onKeyboardResize,
    resetWidth,
    setWidth,
  };
}
