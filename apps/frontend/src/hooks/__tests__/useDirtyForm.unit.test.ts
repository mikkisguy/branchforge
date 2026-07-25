/**
 * Tests for the useDirtyForm hook.
 */

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDirtyForm } from "../useDirtyForm";

describe("useDirtyForm", () => {
  it("is not dirty when current values match initial values", () => {
    const initial = { name: "Alice", age: 30 };
    const { result } = renderHook(() => useDirtyForm(initial, initial));
    expect(result.current.isDirty).toBe(false);
  });

  it("is dirty when current values diverge from initial values", () => {
    const initial = { name: "Alice", age: 30 };
    const current = { name: "Bob", age: 30 };
    const { result } = renderHook(() => useDirtyForm(initial, current));
    expect(result.current.isDirty).toBe(true);
  });

  it("becomes dirty when current values change via rerender", () => {
    const initial = { name: "Alice" };
    const { result, rerender } = renderHook(
      ({ current }) => useDirtyForm(initial, current),
      { initialProps: { current: { name: "Alice" } } }
    );

    expect(result.current.isDirty).toBe(false);
    rerender({ current: { name: "Bob" } });
    expect(result.current.isDirty).toBe(true);
  });

  it("resetDirty re-baselines to the current values", () => {
    const initial = { name: "Alice" };
    const { result, rerender } = renderHook(
      ({ current }) => useDirtyForm(initial, current),
      { initialProps: { current: { name: "Alice" } } }
    );

    rerender({ current: { name: "Bob" } });
    expect(result.current.isDirty).toBe(true);

    act(() => {
      result.current.resetDirty();
    });
    expect(result.current.isDirty).toBe(false);

    rerender({ current: { name: "Carol" } });
    expect(result.current.isDirty).toBe(true);
  });

  it("re-baselines when initialValues change", () => {
    const { result, rerender } = renderHook(
      ({ initial, current }) => useDirtyForm(initial, current),
      {
        initialProps: {
          initial: { name: "Alice" },
          current: { name: "Alice" },
        },
      }
    );

    expect(result.current.isDirty).toBe(false);

    rerender({
      initial: { name: "Bob" },
      current: { name: "Bob" },
    });
    expect(result.current.isDirty).toBe(false);

    rerender({
      initial: { name: "Bob" },
      current: { name: "Carol" },
    });
    expect(result.current.isDirty).toBe(true);
  });

  it("detects nested value changes", () => {
    const initial = { meta: { tags: ["a"] } };
    const current = { meta: { tags: ["a", "b"] } };
    const { result } = renderHook(() => useDirtyForm(initial, current));
    expect(result.current.isDirty).toBe(true);
  });
});
