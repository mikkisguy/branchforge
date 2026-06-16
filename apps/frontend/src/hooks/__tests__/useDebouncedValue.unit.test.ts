/**
 * Tests for the useDebouncedValue hook.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebouncedValue } from "../useDebouncedValue";

describe("useDebouncedValue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebouncedValue("initial", 200));
    expect(result.current).toBe("initial");
  });

  it("does not update before the delay elapses", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 200),
      { initialProps: { value: "first" } }
    );

    rerender({ value: "second" });
    act(() => vi.advanceTimersByTime(199));
    expect(result.current).toBe("first");
  });

  it("updates after the delay elapses", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 200),
      { initialProps: { value: "first" } }
    );

    rerender({ value: "second" });
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe("second");
  });

  it("collapses rapid successive changes into the last value", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 200),
      { initialProps: { value: "a" } }
    );

    rerender({ value: "b" });
    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe("a");

    rerender({ value: "c" });
    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe("a");

    rerender({ value: "d" });
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe("d");
  });

  it("clears the timer on unmount", () => {
    const { result, rerender, unmount } = renderHook(
      ({ value }) => useDebouncedValue(value, 200),
      { initialProps: { value: "first" } }
    );

    rerender({ value: "second" });
    unmount();

    // Advancing timers after unmount should not throw or update state.
    expect(() => act(() => vi.advanceTimersByTime(500))).not.toThrow();
    expect(result.current).toBe("first");
  });

  it("works with non-string values (numbers)", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 100),
      { initialProps: { value: 0 } }
    );

    rerender({ value: 42 });
    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe(42);
  });
});
