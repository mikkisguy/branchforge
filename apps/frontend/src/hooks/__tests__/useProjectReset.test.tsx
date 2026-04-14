import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useRef, useState } from "react";
import { useProjectReset } from "../useProjectReset";

describe("useProjectReset", () => {
  it("flushes pending save and resets state on project switch", async () => {
    const triggerSave = vi.fn().mockResolvedValue(true);
    const onReset = vi.fn();
    const showErrorToast = vi.fn();

    const { rerender } = renderHook(
      ({ projectId }) => {
        const isResettingRef = useRef(false);
        const [_skipSave, setSkipSaveState] = useState(false);

        useProjectReset({
          projectId,
          isResettingRef,
          hasPendingSave: true,
          triggerSave,
          showErrorToast,
          setSkipSave: setSkipSaveState,
          onReset,
        });
      },
      {
        initialProps: {
          projectId: "project-1" as string | undefined,
        },
      }
    );

    await waitFor(() => {
      expect(triggerSave).toHaveBeenCalledTimes(1);
      expect(onReset).toHaveBeenCalledTimes(1);
    });

    rerender({ projectId: "project-2" });

    await waitFor(() => {
      expect(triggerSave).toHaveBeenCalledTimes(2);
      expect(onReset).toHaveBeenCalledTimes(2);
    });

    expect(showErrorToast).not.toHaveBeenCalled();
  });

  it("shows warning toast when save flush fails", async () => {
    const triggerSave = vi.fn().mockResolvedValue(false);
    const onReset = vi.fn();
    const showErrorToast = vi.fn();

    renderHook(() => {
      const isResettingRef = useRef(false);
      const [_skipSave, setSkipSaveState] = useState(false);

      useProjectReset({
        projectId: "project-1",
        isResettingRef,
        hasPendingSave: true,
        triggerSave,
        showErrorToast,
        setSkipSave: setSkipSaveState,
        onReset,
      });
    });

    await waitFor(() => {
      expect(showErrorToast).toHaveBeenCalledWith(
        "Could not save pending edits. The save failed when switching projects.",
        "Project switch warning"
      );
      expect(onReset).toHaveBeenCalledTimes(1);
    });
  });
});
