/**
 * useFlowGraph and useFlowGraphLayout Hook Tests
 *
 * Tests for flow graph data fetching and layout persistence hooks.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { useFlowGraph } from "../useFlowGraph";
import { useFlowGraphLayout } from "../useFlowGraphLayout";
import { flowApi } from "@/lib/api/flow";
import type {
  FlowNode,
  FlowEdge,
  FlowGraphPositions,
} from "@branchforge/shared";
import { createTestQueryClient } from "@/test/query-client";

// Mock the API
vi.mock("@/lib/api/flow", () => ({
  flowApi: {
    getFlowGraph: vi.fn(),
    getFlowGraphLayout: vi.fn(),
    saveFlowGraphLayout: vi.fn(),
    deleteFlowGraphLayout: vi.fn(),
  },
}));

// Shared mock fns for ToastContext assertions
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();

// Mock ToastContext (used by useFlowGraphLayout)
vi.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({
    success: mockToastSuccess,
    error: mockToastError,
  }),
}));

const mockNodes: FlowNode[] = [
  {
    id: "label-1",
    labelId: "label-1",
    title: "Opening Scene",
    labelName: "opening",
    routeKey: "common",
    status: "DRAFT",
    fileName: "act_i.rpy",
    sequenceOrder: 1,
    labelNumber: 1,
  },
];

const mockEdges: FlowEdge[] = [
  {
    id: "label-1|label-2|NATURAL",
    source: "label-1",
    target: "label-2",
    type: "NATURAL",
  },
];

const mockPositions: FlowGraphPositions = {
  "node-1": { x: 100, y: 200 },
};

describe("useFlowGraph", () => {
  let queryClient: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = createTestQueryClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("returns empty arrays initially", () => {
    const { result } = renderHook(() => useFlowGraph("project-1"), { wrapper });

    expect(result.current.nodes).toEqual([]);
    expect(result.current.edges).toEqual([]);
  });

  it("fetches and returns flow graph data", async () => {
    vi.mocked(flowApi.getFlowGraph).mockResolvedValue({
      nodes: mockNodes,
      edges: mockEdges,
    });

    const { result } = renderHook(() => useFlowGraph("project-1"), { wrapper });

    await waitFor(() => {
      expect(result.current.nodes).toEqual(mockNodes);
    });

    expect(result.current.edges).toEqual(mockEdges);
    expect(flowApi.getFlowGraph).toHaveBeenCalledWith("project-1");
  });

  it("does not fetch when projectId is empty", () => {
    renderHook(() => useFlowGraph(""), { wrapper });

    expect(flowApi.getFlowGraph).not.toHaveBeenCalled();
  });

  it("returns loading state", async () => {
    vi.mocked(flowApi.getFlowGraph).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ nodes: mockNodes, edges: mockEdges }), 100)
        )
    );

    const { result } = renderHook(() => useFlowGraph("project-1"), { wrapper });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it("handles API error", async () => {
    const testError = new Error("Failed to fetch flow graph");
    vi.mocked(flowApi.getFlowGraph).mockRejectedValue(testError);

    const { result } = renderHook(() => useFlowGraph("project-1"), { wrapper });

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
  });
});

describe("useFlowGraphLayout", () => {
  let queryClient: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = createTestQueryClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    queryClient.clear();
  });

  it("returns empty positions initially", () => {
    const { result } = renderHook(() => useFlowGraphLayout("project-1"), {
      wrapper,
    });

    expect(result.current.positions).toEqual({});
  });

  it("fetches and returns saved positions", async () => {
    vi.mocked(flowApi.getFlowGraphLayout).mockResolvedValue({
      positions: mockPositions,
    });

    const { result } = renderHook(() => useFlowGraphLayout("project-1"), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.positions).toEqual(mockPositions);
    });

    expect(flowApi.getFlowGraphLayout).toHaveBeenCalledWith("project-1");
  });

  it("does not fetch when projectId is empty", () => {
    renderHook(() => useFlowGraphLayout(""), { wrapper });

    expect(flowApi.getFlowGraphLayout).not.toHaveBeenCalled();
  });

  it("handleNodeDragStop saves positions (debounced)", async () => {
    vi.useFakeTimers();

    vi.mocked(flowApi.getFlowGraphLayout).mockResolvedValue({
      positions: {},
    });
    vi.mocked(flowApi.saveFlowGraphLayout).mockResolvedValue(undefined);

    const { result } = renderHook(() => useFlowGraphLayout("project-1"), {
      wrapper,
    });

    // Wait for initial query to settle
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => {
      result.current.handleNodeDragStop(mockPositions);
    });

    // Should not have saved yet (debounced)
    expect(flowApi.saveFlowGraphLayout).not.toHaveBeenCalled();

    // Advance timers past the 500ms debounce
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(flowApi.saveFlowGraphLayout).toHaveBeenCalledWith(
      "project-1",
      mockPositions
    );

    vi.useRealTimers();
  });

  it("handleResetLayout deletes positions and optimistically clears cache", async () => {
    let getCallCount = 0;
    vi.mocked(flowApi.getFlowGraphLayout).mockImplementation(async () => {
      getCallCount += 1;
      // After reset, server returns empty
      return { positions: getCallCount > 1 ? {} : mockPositions };
    });
    vi.mocked(flowApi.deleteFlowGraphLayout).mockResolvedValue(undefined);

    const { result } = renderHook(() => useFlowGraphLayout("project-1"), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.positions).toEqual(mockPositions);
    });

    act(() => {
      result.current.handleResetLayout();
    });

    // After reset (and refetch), positions should be empty
    await waitFor(() => {
      expect(result.current.positions).toEqual({});
    });

    await waitFor(() => {
      expect(flowApi.deleteFlowGraphLayout).toHaveBeenCalledWith("project-1");
    });
  });

  it("shows error toast on save failure and rolls back positions", async () => {
    vi.useFakeTimers();

    vi.mocked(flowApi.getFlowGraphLayout).mockResolvedValue({
      positions: {},
    });
    const saveError = new Error("Network error");
    vi.mocked(flowApi.saveFlowGraphLayout).mockRejectedValue(saveError);

    const { result } = renderHook(() => useFlowGraphLayout("project-1"), {
      wrapper,
    });

    // Wait for initial query to settle
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => {
      result.current.handleNodeDragStop(mockPositions);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(mockToastError).toHaveBeenCalledWith(
      "Failed to save layout: Network error",
      "Error"
    );

    // Rollback should restore the previous empty positions
    expect(result.current.positions).toEqual({});

    vi.useRealTimers();
  });
});
