/**
 * Tests for the useWorkspacePanel hook.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  PANEL_RESIZE_STEP,
  PANEL_RESIZE_STEP_LARGE,
  SCRIPT_LEFT_PANEL,
  WRITE_LEFT_PANEL,
} from "@/lib/workspace-panels";
import { useWorkspacePanel } from "../useWorkspacePanel";

type MqlHandler = (e: MediaQueryListEvent) => void;

interface StubMql {
  matches: boolean;
  media: string;
  addEventListener: ReturnType<
    typeof vi.fn<(event: string, handler: MqlHandler) => void>
  >;
  removeEventListener: ReturnType<
    typeof vi.fn<(event: string, handler: MqlHandler) => void>
  >;
}

function installBreakpointMatchMedia(options: {
  wide: boolean;
  medium: boolean;
  narrow: boolean;
}) {
  const createStub = (media: string, matches: boolean): StubMql => ({
    matches,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });

  const stubs = {
    wide: createStub("(min-width: 1280px)", options.wide),
    medium: createStub("(min-width: 1024px)", options.medium),
    narrow: createStub("(min-width: 768px)", options.narrow),
    mobile: createStub("(min-width: 768px)", options.narrow),
  };

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn((query: string) => {
      if (query === "(min-width: 1280px)") {
        return stubs.wide as unknown as MediaQueryList;
      }
      if (query === "(min-width: 1024px)") {
        return stubs.medium as unknown as MediaQueryList;
      }
      if (query === "(min-width: 768px)") {
        return stubs.narrow as unknown as MediaQueryList;
      }

      return createStub(query, false) as unknown as MediaQueryList;
    }),
  });
}

function setStoredNumber(key: string, value: number) {
  window.localStorage.setItem(`branchforge:${key}`, String(value));
}

function getStoredNumber(key: string): string | null {
  return window.localStorage.getItem(`branchforge:${key}`);
}

function setStoredBoolean(key: string, value: boolean) {
  window.localStorage.setItem(`branchforge:${key}`, String(value));
}

describe("useWorkspacePanel", () => {
  beforeEach(() => {
    installBreakpointMatchMedia({ wide: true, medium: true, narrow: true });
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("uses the default width when no stored width exists", () => {
    const { result } = renderHook(() => useWorkspacePanel(WRITE_LEFT_PANEL));
    expect(result.current.width).toBe(248);
  });

  it("persists width changes under the config width key", () => {
    const { result } = renderHook(() => useWorkspacePanel(WRITE_LEFT_PANEL));

    act(() => {
      result.current.setWidth(300);
    });

    expect(result.current.width).toBe(300);
    expect(getStoredNumber("write:left-panel-width")).toBe("300");
  });

  it("preserves the existing collapse key", () => {
    setStoredBoolean("write:left-sidebar-collapsed", true);
    const { result } = renderHook(() => useWorkspacePanel(WRITE_LEFT_PANEL));

    expect(result.current.collapsed).toBe(true);

    act(() => {
      result.current.setCollapsed(false);
    });

    expect(result.current.collapsed).toBe(false);
    expect(
      window.localStorage.getItem("branchforge:write:left-sidebar-collapsed")
    ).toBe("false");
  });

  it("clamps stored and updated widths", () => {
    setStoredNumber("write:left-panel-width", 999);
    const { result } = renderHook(() => useWorkspacePanel(WRITE_LEFT_PANEL));
    expect(result.current.width).toBe(248);

    act(() => {
      result.current.setWidth(180);
    });

    expect(result.current.width).toBe(208);
  });

  it("resets width to the panel default", () => {
    setStoredNumber("write:left-panel-width", 300);
    const { result } = renderHook(() => useWorkspacePanel(WRITE_LEFT_PANEL));

    act(() => {
      result.current.resetWidth();
    });

    expect(result.current.width).toBe(248);
    expect(getStoredNumber("write:left-panel-width")).toBe("248");
  });

  it("applies keyboard resize steps", () => {
    const { result } = renderHook(() => useWorkspacePanel(WRITE_LEFT_PANEL));

    act(() => {
      result.current.onKeyboardResize(PANEL_RESIZE_STEP);
    });
    expect(result.current.width).toBe(256);

    act(() => {
      result.current.onKeyboardResize(PANEL_RESIZE_STEP_LARGE);
    });
    expect(result.current.width).toBe(288);
  });

  it("keeps write and script panel widths independent", () => {
    const write = renderHook(() => useWorkspacePanel(WRITE_LEFT_PANEL));
    const script = renderHook(() => useWorkspacePanel(SCRIPT_LEFT_PANEL));

    act(() => {
      write.result.current.setWidth(280);
    });

    expect(write.result.current.width).toBe(280);
    expect(script.result.current.width).toBe(248);
    expect(getStoredNumber("write:left-panel-width")).toBe("280");
    expect(getStoredNumber("script:left-panel-width")).toBeNull();
  });

  it("marks left panels as overlay on narrow breakpoints", () => {
    installBreakpointMatchMedia({ wide: false, medium: false, narrow: true });
    const { result } = renderHook(() => useWorkspacePanel(WRITE_LEFT_PANEL));
    expect(result.current.isOverlay).toBe(true);
    expect(result.current.canResize).toBe(false);
  });

  it("marks right panels as overlay on medium breakpoints", () => {
    installBreakpointMatchMedia({ wide: false, medium: true, narrow: true });
    const { result } = renderHook(() =>
      useWorkspacePanel({ ...WRITE_LEFT_PANEL, side: "right" })
    );
    expect(result.current.isOverlay).toBe(true);
  });

  it("starts right overlay panels collapsed even when stored collapse is false", () => {
    setStoredBoolean("write:right-sidebar-collapsed", false);
    installBreakpointMatchMedia({ wide: false, medium: true, narrow: true });
    const { result } = renderHook(() =>
      useWorkspacePanel({ ...WRITE_LEFT_PANEL, side: "right" })
    );

    expect(result.current.isOverlay).toBe(true);
    expect(result.current.collapsed).toBe(true);
  });

  it("uses stored collapse for docked left panels at wide breakpoints", () => {
    setStoredBoolean("write:left-sidebar-collapsed", true);
    installBreakpointMatchMedia({ wide: true, medium: true, narrow: true });
    const { result } = renderHook(() => useWorkspacePanel(WRITE_LEFT_PANEL));

    expect(result.current.isOverlay).toBe(false);
    expect(result.current.collapsed).toBe(true);
  });

  it("starts narrow left overlay panels collapsed", () => {
    installBreakpointMatchMedia({ wide: false, medium: false, narrow: true });
    const { result } = renderHook(() => useWorkspacePanel(WRITE_LEFT_PANEL));

    expect(result.current.isOverlay).toBe(true);
    expect(result.current.collapsed).toBe(true);
  });
});
