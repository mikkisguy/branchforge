import { useSyncExternalStore } from "react";

export type WorkspaceBreakpoint = "wide" | "medium" | "narrow" | "mobile";

export interface WorkspaceBreakpointState {
  breakpoint: WorkspaceBreakpoint;
  canResize: boolean;
}

const WIDE_QUERY = "(min-width: 1280px)";
const MEDIUM_QUERY = "(min-width: 1024px)";
const NARROW_QUERY = "(min-width: 768px)";

const TRACKED_QUERIES = [WIDE_QUERY, MEDIUM_QUERY, NARROW_QUERY];

function getBreakpointSnapshot(): WorkspaceBreakpoint {
  if (window.matchMedia(WIDE_QUERY).matches) {
    return "wide";
  }
  if (window.matchMedia(MEDIUM_QUERY).matches) {
    return "medium";
  }
  if (window.matchMedia(NARROW_QUERY).matches) {
    return "narrow";
  }
  return "mobile";
}

function getBreakpointServerSnapshot(): WorkspaceBreakpoint {
  return "wide";
}

function subscribeToBreakpoint(callback: () => void) {
  const mediaQueries = TRACKED_QUERIES.map((query) => window.matchMedia(query));

  for (const mediaQuery of mediaQueries) {
    mediaQuery.addEventListener("change", callback);
  }

  return () => {
    for (const mediaQuery of mediaQueries) {
      mediaQuery.removeEventListener("change", callback);
    }
  };
}

function canResizeAtBreakpoint(breakpoint: WorkspaceBreakpoint): boolean {
  return breakpoint === "wide" || breakpoint === "medium";
}

export function useWorkspaceBreakpoint(): WorkspaceBreakpointState {
  const breakpoint = useSyncExternalStore(
    subscribeToBreakpoint,
    getBreakpointSnapshot,
    getBreakpointServerSnapshot
  );

  return {
    breakpoint,
    canResize: canResizeAtBreakpoint(breakpoint),
  };
}
