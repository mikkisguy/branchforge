import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAutosave } from "../useAutosave";

describe("useAutosave", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("stores pending data while a save is in-flight", async () => {
    vi.useFakeTimers();

    let releaseFirstSave: (() => void) | undefined;
    const onSave = vi.fn().mockImplementation((value: string) => {
      if (value === "first") {
        return new Promise<void>((resolve) => {
          releaseFirstSave = resolve;
        });
      }

      return Promise.resolve();
    });

    const { result, rerender } = renderHook(
      ({ value }) =>
        useAutosave({
          data: value,
          hashFn: (text: string) => text,
          debounceMs: 100,
          onSave,
        }),
      {
        initialProps: {
          value: "initial",
        },
      }
    );

    rerender({ value: "first" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120);
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenNthCalledWith(1, "first");

    rerender({ value: "second" });

    await act(async () => {
      releaseFirstSave?.();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(result.current.saveStatus).toBe("saved");
    expect(result.current.isDirty).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120);
    });

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenNthCalledWith(2, "second");
    expect(result.current.saveStatus).toBe("saved");
    expect(result.current.isDirty).toBe(false);
  });
});
