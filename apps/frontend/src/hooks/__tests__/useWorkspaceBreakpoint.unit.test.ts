/**
 * Tests for the useWorkspaceBreakpoint hook.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useWorkspaceBreakpoint } from "../useWorkspaceBreakpoint";

type MqlHandler = (event: MediaQueryListEvent) => void;

interface StubMql {
  matches: boolean;
  media: string;
  addEventListener: ReturnType<
    typeof vi.fn<(event: string, handler: MqlHandler) => void>
  >;
  removeEventListener: ReturnType<
    typeof vi.fn<(event: string, handler: MqlHandler) => void>
  >;
  fireChange: () => void;
}

function createStubMql(media: string, matches: boolean): StubMql {
  let handlers: MqlHandler[] = [];

  const stub: StubMql = {
    matches,
    media,
    addEventListener: vi.fn((_event: string, handler: MqlHandler) => {
      handlers.push(handler);
    }),
    removeEventListener: vi.fn((_event: string, handler: MqlHandler) => {
      handlers = handlers.filter((h) => h !== handler);
    }),
    fireChange: () => {
      const event = {
        matches: stub.matches,
        media: stub.media,
      } as MediaQueryListEvent;

      for (const handler of handlers) {
        handler(event);
      }
    },
  };

  return stub;
}

function installBreakpointMatchMedia(options: {
  wide: boolean;
  medium: boolean;
  narrow: boolean;
}) {
  const stubs = {
    wide: createStubMql("(min-width: 1280px)", options.wide),
    medium: createStubMql("(min-width: 1024px)", options.medium),
    narrow: createStubMql("(min-width: 768px)", options.narrow),
  };

  const matchMedia = vi.fn((query: string) => {
    if (query === "(min-width: 1280px)") {
      return stubs.wide as unknown as MediaQueryList;
    }
    if (query === "(min-width: 1024px)") {
      return stubs.medium as unknown as MediaQueryList;
    }
    if (query === "(min-width: 768px)") {
      return stubs.narrow as unknown as MediaQueryList;
    }

    return createStubMql(query, false) as unknown as MediaQueryList;
  });

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: matchMedia,
  });

  return stubs;
}

describe("useWorkspaceBreakpoint", () => {
  beforeEach(() => {
    installBreakpointMatchMedia({ wide: true, medium: true, narrow: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports wide at >=1280px", () => {
    const { result } = renderHook(() => useWorkspaceBreakpoint());
    expect(result.current.breakpoint).toBe("wide");
    expect(result.current.canResize).toBe(true);
  });

  it("reports medium between 1024px and 1279px", () => {
    installBreakpointMatchMedia({ wide: false, medium: true, narrow: true });
    const { result } = renderHook(() => useWorkspaceBreakpoint());
    expect(result.current.breakpoint).toBe("medium");
    expect(result.current.canResize).toBe(true);
  });

  it("reports narrow between 768px and 1023px", () => {
    installBreakpointMatchMedia({ wide: false, medium: false, narrow: true });
    const { result } = renderHook(() => useWorkspaceBreakpoint());
    expect(result.current.breakpoint).toBe("narrow");
    expect(result.current.canResize).toBe(false);
  });

  it("reports mobile below 768px", () => {
    installBreakpointMatchMedia({ wide: false, medium: false, narrow: false });
    const { result } = renderHook(() => useWorkspaceBreakpoint());
    expect(result.current.breakpoint).toBe("mobile");
    expect(result.current.canResize).toBe(false);
  });

  it("updates when a tracked media query changes", () => {
    const stubs = installBreakpointMatchMedia({
      wide: true,
      medium: true,
      narrow: true,
    });
    const { result } = renderHook(() => useWorkspaceBreakpoint());

    act(() => {
      stubs.wide.matches = false;
      stubs.wide.fireChange();
    });

    expect(result.current.breakpoint).toBe("medium");
  });
});
