import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useLabelSwitcher } from "../useLabelSwitcher";

describe("useLabelSwitcher", () => {
  it("short-circuits when selecting the same label", async () => {
    const triggerSave = vi.fn().mockResolvedValue(true);
    const onSwitch = vi.fn();
    const showErrorToast = vi.fn();

    const { result } = renderHook(() =>
      useLabelSwitcher({
        activeLabelId: "label-1",
        isDirty: true,
        triggerSave,
        onSwitch,
        showErrorToast,
      })
    );

    await act(async () => {
      const switched = await result.current.handleSelectLabel("label-1");
      expect(switched).toBe(true);
    });

    expect(triggerSave).not.toHaveBeenCalled();
    expect(onSwitch).not.toHaveBeenCalled();
    expect(showErrorToast).not.toHaveBeenCalled();
  });

  it("switches immediately when current label is clean", async () => {
    const triggerSave = vi.fn().mockResolvedValue(true);
    const onSwitch = vi.fn();
    const showErrorToast = vi.fn();

    const { result } = renderHook(() =>
      useLabelSwitcher({
        activeLabelId: "label-1",
        isDirty: false,
        triggerSave,
        onSwitch,
        showErrorToast,
      })
    );

    await act(async () => {
      const switched = await result.current.handleSelectLabel("label-2");
      expect(switched).toBe(true);
    });

    expect(triggerSave).not.toHaveBeenCalled();
    expect(onSwitch).toHaveBeenCalledWith("label-2");
    expect(showErrorToast).not.toHaveBeenCalled();
  });

  it("flushes dirty changes before switching", async () => {
    const triggerSave = vi.fn().mockResolvedValue(true);
    const onSwitch = vi.fn();
    const showErrorToast = vi.fn();

    const { result } = renderHook(() =>
      useLabelSwitcher({
        activeLabelId: "label-1",
        isDirty: true,
        triggerSave,
        onSwitch,
        showErrorToast,
      })
    );

    await act(async () => {
      const switched = await result.current.handleSelectLabel("label-2");
      expect(switched).toBe(true);
    });

    expect(triggerSave).toHaveBeenCalledTimes(1);
    expect(onSwitch).toHaveBeenCalledWith("label-2");
    expect(showErrorToast).not.toHaveBeenCalled();
  });

  it("blocks switching when flush fails", async () => {
    const triggerSave = vi.fn().mockResolvedValue(false);
    const onSwitch = vi.fn();
    const showErrorToast = vi.fn();

    const { result } = renderHook(() =>
      useLabelSwitcher({
        activeLabelId: "label-1",
        isDirty: true,
        triggerSave,
        onSwitch,
        showErrorToast,
      })
    );

    await act(async () => {
      const switched = await result.current.handleSelectLabel("label-2");
      expect(switched).toBe(false);
    });

    expect(onSwitch).not.toHaveBeenCalled();
    expect(showErrorToast).toHaveBeenCalledWith(
      "Could not save pending edits. Resolve the save error before switching labels.",
      "Label switch blocked"
    );
  });

  it("blocks switching when triggerSave rejects", async () => {
    const triggerSave = vi.fn().mockRejectedValue(new Error("save exploded"));
    const onSwitch = vi.fn();
    const showErrorToast = vi.fn();

    const { result } = renderHook(() =>
      useLabelSwitcher({
        activeLabelId: "label-1",
        isDirty: true,
        triggerSave,
        onSwitch,
        showErrorToast,
      })
    );

    await act(async () => {
      const switched = await result.current.handleSelectLabel("label-2");
      expect(switched).toBe(false);
    });

    expect(triggerSave).toHaveBeenCalledTimes(1);
    expect(onSwitch).not.toHaveBeenCalled();
    expect(showErrorToast).toHaveBeenCalledWith(
      "Could not save pending edits. Resolve the save error before switching labels.",
      "Label switch blocked"
    );
  });
});
