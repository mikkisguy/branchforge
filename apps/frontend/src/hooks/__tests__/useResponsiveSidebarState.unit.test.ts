/**
 * Tests for the useResponsiveSidebarState hook.
 *
 * Covers initial state on mobile/desktop, toggle routing, resize
 * transitions, and functional updater support.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useResponsiveSidebarState } from "../useResponsiveSidebarState";

/** Typed stub for matchMedia.addEventListener/removeEventListener */
type MqlHandler = (e: MediaQueryListEvent) => void;

/** Stub returned by our matchMedia mock — callable to fire a change event. */
interface StubMql {
  matches: boolean;
  addEventListener: ReturnType<
    typeof vi.fn<(event: string, handler: MqlHandler) => void>
  >;
  removeEventListener: ReturnType<
    typeof vi.fn<(event: string, handler: MqlHandler) => void>
  >;
  fireChange: () => void;
}

function createStubMql(matches: boolean): StubMql {
  let handlers: MqlHandler[] = [];
  const stub: StubMql = {
    matches,
    addEventListener: vi.fn((_event: string, handler: MqlHandler) => {
      handlers.push(handler);
    }),
    removeEventListener: vi.fn((_event: string, handler: MqlHandler) => {
      handlers = handlers.filter((h) => h !== handler);
    }),
    fireChange: () => {
      // MediaQueryListEvent is not available in jsdom; create a plain
      // object with the properties the handler inspects.
      const event = {
        matches: stub.matches,
        media: "(min-width: 768px)",
      } as MediaQueryListEvent;
      for (const h of handlers) {
        h(event);
      }
    },
  };
  return stub;
}

describe("useResponsiveSidebarState", () => {
  let stubMql: StubMql;

  beforeEach(() => {
    stubMql = createStubMql(true); // desktop default
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: vi.fn().mockReturnValue(stubMql as unknown as MediaQueryList),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  function setStored(key: string, value: boolean) {
    window.localStorage.setItem(`branchforge:${key}`, String(value));
  }

  function getStored(key: string): boolean | null {
    const v = window.localStorage.getItem(`branchforge:${key}`);
    if (v === "true") return true;
    if (v === "false") return false;
    return null;
  }

  // ---------------------------------------------------------------------------
  // Initial state
  // ---------------------------------------------------------------------------

  it("defaults to collapsed on mobile (<768px), regardless of localStorage", () => {
    stubMql.matches = false; // mobile
    setStored("test:sidebar", false); // stored as "expanded"
    const { result } = renderHook(() =>
      useResponsiveSidebarState("test:sidebar")
    );
    expect(result.current[0]).toBe(true); // collapsed
  });

  it("respects localStorage collapsed value on desktop", () => {
    setStored("test:sidebar", true); // stored as "collapsed"
    const { result } = renderHook(() =>
      useResponsiveSidebarState("test:sidebar")
    );
    expect(result.current[0]).toBe(true);
  });

  it("respects localStorage expanded value on desktop", () => {
    setStored("test:sidebar", false);
    const { result } = renderHook(() =>
      useResponsiveSidebarState("test:sidebar")
    );
    expect(result.current[0]).toBe(false);
  });

  it("falls back to defaultValue on desktop when localStorage is empty", () => {
    const { result } = renderHook(() =>
      useResponsiveSidebarState("test:sidebar", true)
    );
    expect(result.current[0]).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Toggle routing
  // ---------------------------------------------------------------------------

  it("toggling on mobile changes the effective value but not localStorage", () => {
    stubMql.matches = false;
    setStored("test:sidebar", false);
    const { result } = renderHook(() =>
      useResponsiveSidebarState("test:sidebar")
    );
    // starts collapsed
    expect(result.current[0]).toBe(true);

    act(() => result.current[1](false)); // expand
    expect(result.current[0]).toBe(false);
    // localStorage should still be false (unchanged)
    expect(getStored("test:sidebar")).toBe(false);
  });

  it("toggling on desktop writes to localStorage", () => {
    setStored("test:sidebar", false);
    const { result } = renderHook(() =>
      useResponsiveSidebarState("test:sidebar")
    );
    act(() => result.current[1](true)); // collapse
    expect(result.current[0]).toBe(true);
    expect(getStored("test:sidebar")).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Resize transitions
  // ---------------------------------------------------------------------------

  it("resets to collapsed when switching from desktop to mobile", () => {
    setStored("test:sidebar", false); // expanded on desktop
    const { result } = renderHook(() =>
      useResponsiveSidebarState("test:sidebar")
    );
    expect(result.current[0]).toBe(false); // desktop: expanded

    // switch to mobile
    stubMql.matches = false;
    act(() => stubMql.fireChange());
    expect(result.current[0]).toBe(true); // collapsed on mobile
  });

  it("restores stored value when switching from mobile to desktop", () => {
    stubMql.matches = false; // mobile
    setStored("test:sidebar", false); // stored as expanded

    const { result } = renderHook(() =>
      useResponsiveSidebarState("test:sidebar")
    );
    expect(result.current[0]).toBe(true); // mobile: collapsed

    // expand on mobile
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false); // expanded on mobile

    // switch to desktop
    stubMql.matches = true;
    act(() => stubMql.fireChange());
    // desktop restores stored (false = expanded)
    expect(result.current[0]).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Functional updater
  // ---------------------------------------------------------------------------

  it("supports functional updater on mobile", () => {
    stubMql.matches = false;
    const { result } = renderHook(() =>
      useResponsiveSidebarState("test:sidebar")
    );
    expect(result.current[0]).toBe(true);
    act(() => result.current[1]((prev) => !prev));
    expect(result.current[0]).toBe(false);
  });

  it("supports functional updater on desktop", () => {
    setStored("test:sidebar", false);
    const { result } = renderHook(() =>
      useResponsiveSidebarState("test:sidebar")
    );
    act(() => result.current[1]((prev) => !prev));
    expect(result.current[0]).toBe(true);
    expect(getStored("test:sidebar")).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  it("removes the matchMedia listener on unmount", () => {
    const { unmount } = renderHook(() =>
      useResponsiveSidebarState("test:sidebar")
    );
    unmount();
    expect(stubMql.removeEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function)
    );
  });

  // ---------------------------------------------------------------------------
  // isMobile flag (third tuple element)
  // ---------------------------------------------------------------------------

  it("exposes isMobile=true on mobile", () => {
    stubMql.matches = false; // mobile
    const { result } = renderHook(() =>
      useResponsiveSidebarState("test:sidebar")
    );
    expect(result.current[2]).toBe(true);
  });

  it("exposes isMobile=false on desktop", () => {
    stubMql.matches = true; // desktop
    const { result } = renderHook(() =>
      useResponsiveSidebarState("test:sidebar")
    );
    expect(result.current[2]).toBe(false);
  });

  it("updates isMobile when the viewport changes", () => {
    stubMql.matches = true; // desktop
    const { result } = renderHook(() =>
      useResponsiveSidebarState("test:sidebar")
    );
    expect(result.current[2]).toBe(false);

    stubMql.matches = false; // switch to mobile
    act(() => stubMql.fireChange());
    expect(result.current[2]).toBe(true);
  });
});
