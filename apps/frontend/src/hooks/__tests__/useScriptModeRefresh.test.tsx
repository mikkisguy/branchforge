import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useScriptModeRefresh } from "../useScriptModeRefresh";

describe("useScriptModeRefresh", () => {
  it("refreshes files only once until reset", async () => {
    const refreshFiles = vi.fn().mockResolvedValue(undefined);

    const { result, rerender } = renderHook(
      ({ projectId, isLoadingFiles }) =>
        useScriptModeRefresh({ projectId, isLoadingFiles, refreshFiles }),
      {
        initialProps: {
          projectId: "project-1" as string | undefined,
          isLoadingFiles: true,
        },
      }
    );

    expect(refreshFiles).not.toHaveBeenCalled();

    rerender({ projectId: "project-1", isLoadingFiles: false });
    await waitFor(() => {
      expect(refreshFiles).toHaveBeenCalledTimes(1);
    });

    rerender({ projectId: "project-1", isLoadingFiles: false });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(refreshFiles).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.resetRefreshState();
    });

    rerender({ projectId: "project-2", isLoadingFiles: false });
    await waitFor(() => {
      expect(refreshFiles).toHaveBeenCalledTimes(2);
    });
  });

  it("does not refresh when project id is missing", async () => {
    const refreshFiles = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useScriptModeRefresh({
        projectId: undefined,
        isLoadingFiles: false,
        refreshFiles,
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(refreshFiles).not.toHaveBeenCalled();
  });
});
