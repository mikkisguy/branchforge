import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { useUndoRedo } from "../useUndoRedo";
import { createTestQueryClient } from "@/test/query-client";

describe("useUndoRedo", () => {
  let queryClient: QueryClient;
  let historyState: {
    versions: Array<{ id: string; versionNumber: number; createdAt: string }>;
    currentIndex: number;
    canUndo: boolean;
    canRedo: boolean;
  };

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = createTestQueryClient();
    vi.clearAllMocks();

    historyState = {
      versions: [
        { id: "v3", versionNumber: 3, createdAt: "2026-01-01T00:00:00.000Z" },
        { id: "v2", versionNumber: 2, createdAt: "2025-12-31T00:00:00.000Z" },
        { id: "v1", versionNumber: 1, createdAt: "2025-12-30T00:00:00.000Z" },
      ],
      currentIndex: 1,
      canUndo: true,
      canRedo: true,
    };

    const recomputeFlags = () => {
      historyState.canUndo =
        historyState.currentIndex === -1
          ? historyState.versions.length > 0
          : historyState.currentIndex < historyState.versions.length - 1;
      historyState.canRedo = historyState.currentIndex > 0;
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.includes("/versions")) {
          return new Response(JSON.stringify(historyState), { status: 200 });
        }

        if (url.includes("/undo") && init?.method === "POST") {
          const body = JSON.parse(String(init.body)) as { versionId?: string };
          const nextIndex = historyState.versions.findIndex(
            (version) => version.id === body.versionId
          );
          if (nextIndex >= 0) {
            historyState.currentIndex = nextIndex;
            recomputeFlags();
          }

          return new Response(JSON.stringify({ success: true }), {
            status: 200,
          });
        }

        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
        });
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    queryClient.clear();
  });

  it("navigates history based on current server index", async () => {
    const { result } = renderHook(() => useUndoRedo("label-1"), { wrapper });

    await waitFor(() => {
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(true);
    });

    await act(async () => {
      await result.current.undo();
    });

    await waitFor(() => {
      expect(result.current.canRedo).toBe(true);
    });

    await act(async () => {
      await result.current.redo();
    });

    const postBodies = vi
      .mocked(fetch)
      .mock.calls.filter(([, init]) => init?.method === "POST")
      .map(
        ([, init]) => JSON.parse(String(init?.body)) as { versionId?: string }
      );

    expect(postBodies[0]).toEqual({ versionId: "v1" });
    expect(postBodies[1]).toEqual({ versionId: "v2" });
  });

  it("supports redo after reload without local redo stack", async () => {
    const firstMount = renderHook(() => useUndoRedo("label-1"), { wrapper });

    await waitFor(() => {
      expect(firstMount.result.current.canRedo).toBe(true);
    });

    firstMount.unmount();

    const secondMount = renderHook(() => useUndoRedo("label-1"), { wrapper });

    await waitFor(() => {
      expect(secondMount.result.current.canRedo).toBe(true);
    });

    await act(async () => {
      await secondMount.result.current.redo();
    });

    const postBodies = vi
      .mocked(fetch)
      .mock.calls.filter(([, init]) => init?.method === "POST")
      .map(
        ([, init]) => JSON.parse(String(init?.body)) as { versionId?: string }
      );

    expect(postBodies).toContainEqual({ versionId: "v3" });
  });
});
