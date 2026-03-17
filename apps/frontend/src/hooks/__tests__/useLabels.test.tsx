/**
 * useLabels Hook Tests
 *
 * Tests for the useLabels hook which manages label state.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLabels } from "../useLabels";
import { labelsApi } from "@/lib/api/labels";
import { labelKeys } from "@/lib/query-keys";
import type { PublicLabel, LabelDetail } from "@branchforge/shared";

// Mock the labels API
vi.mock("@/lib/api/labels", () => ({
  labelsApi: {
    listLabels: vi.fn(),
    getLabel: vi.fn(),
  },
}));

// Mock useProject hook
vi.mock("@/hooks/useProject", () => ({
  useProject: () => ({
    currentProject: {
      id: "project-1",
      name: "Test Project",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    },
  }),
}));

const mockLabels: PublicLabel[] = [
  {
    id: "label-1",
    projectId: "project-1",
    title: "Scene 1",
    groupType: null,
    groupValue: null,
    labelNumber: 1,
    sequenceOrder: 1,
    routeKey: "EILEEN",
    status: "DRAFT",
    visibility: "EXCLUSIVE",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
];

const mockLabelDetail: LabelDetail = {
  ...mockLabels[0],
  lines: [],
  characters: [],
};

describe("useLabels", () => {
  let queryClient: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: 0 },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe("Query", () => {
    it("should fetch labels when project exists", async () => {
      vi.mocked(labelsApi.listLabels).mockResolvedValue(mockLabels);

      const { result } = renderHook(() => useLabels(), { wrapper });

      await waitFor(() => {
        expect(result.current.labels).toEqual(mockLabels);
      });

      expect(labelsApi.listLabels).toHaveBeenCalledWith({
        projectId: "project-1",
      });
    });

    it("should create labels map for efficient lookups", async () => {
      vi.mocked(labelsApi.listLabels).mockResolvedValue(mockLabels);

      const { result } = renderHook(() => useLabels(), { wrapper });

      await waitFor(() => {
        expect(result.current.labelsMap.size).toBe(1);
      });

      expect(result.current.labelsMap.get("label-1")).toEqual(mockLabels[0]);
    });

    it("should show loading state during fetch", async () => {
      vi.mocked(labelsApi.listLabels).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockLabels), 100))
      );

      const { result } = renderHook(() => useLabels(), { wrapper });

      expect(result.current.isLoadingLabels).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoadingLabels).toBe(false);
      });
    });
  });

  describe("Active Label", () => {
    it("should fetch active label detail when labelId is set", async () => {
      vi.mocked(labelsApi.listLabels).mockResolvedValue(mockLabels);
      vi.mocked(labelsApi.getLabel).mockResolvedValue(mockLabelDetail);

      const { result } = renderHook(() => useLabels(), { wrapper });

      await waitFor(() => {
        expect(result.current.labels).toEqual(mockLabels);
      });

      result.current.setActiveLabelId("label-1");

      await waitFor(() => {
        expect(result.current.activeLabel).toEqual(mockLabelDetail);
      });

      expect(labelsApi.getLabel).toHaveBeenCalledWith("label-1");
    });

    it("should persist active label ID in query cache", async () => {
      vi.mocked(labelsApi.listLabels).mockResolvedValue(mockLabels);

      const { result } = renderHook(() => useLabels(), { wrapper });

      await waitFor(() => {
        expect(result.current.labels).toEqual(mockLabels);
      });

      result.current.setActiveLabelId("label-1");

      // Check cache for persisted value
      const cachedId = queryClient.getQueryData<string | null>(
        labelKeys.activeLabelId("project-1")
      );
      expect(cachedId).toBe("label-1");
    });

    it("should load active label ID from cache on mount", async () => {
      // Pre-populate cache
      queryClient.setQueryData(labelKeys.activeLabelId("project-1"), "label-1");
      vi.mocked(labelsApi.listLabels).mockResolvedValue(mockLabels);
      vi.mocked(labelsApi.getLabel).mockResolvedValue(mockLabelDetail);

      const { result } = renderHook(() => useLabels(), { wrapper });

      await waitFor(() => {
        expect(result.current.activeLabelId).toBe("label-1");
      });

      await waitFor(() => {
        expect(result.current.activeLabel).toEqual(mockLabelDetail);
      });
    });

    it("should clear active label when set to null", async () => {
      vi.mocked(labelsApi.listLabels).mockResolvedValue(mockLabels);
      vi.mocked(labelsApi.getLabel).mockResolvedValue(mockLabelDetail);

      const { result } = renderHook(() => useLabels(), { wrapper });

      result.current.setActiveLabelId("label-1");

      await waitFor(() => {
        expect(result.current.activeLabelId).toBe("label-1");
      });

      act(() => {
        result.current.setActiveLabelId(null);
      });

      await waitFor(() => {
        expect(result.current.activeLabelId).toBeNull();
      });
      expect(result.current.activeLabel).toBeUndefined();
    });

    it("should show loading state while fetching active label", async () => {
      vi.mocked(labelsApi.listLabels).mockResolvedValue(mockLabels);
      vi.mocked(labelsApi.getLabel).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockLabelDetail), 100))
      );

      const { result } = renderHook(() => useLabels(), { wrapper });

      await waitFor(() => {
        expect(result.current.labels).toEqual(mockLabels);
      });

      act(() => {
        result.current.setActiveLabelId("label-1");
      });

      await waitFor(() => {
        expect(result.current.isLoadingLabel).toBe(true);
      });

      await waitFor(() => {
        expect(result.current.isLoadingLabel).toBe(false);
      });
    });
  });

  describe("Invalidate Labels", () => {
    it("should invalidate labels query", async () => {
      vi.mocked(labelsApi.listLabels)
        .mockResolvedValueOnce(mockLabels)
        .mockResolvedValueOnce([
          ...mockLabels,
          {
            id: "label-2",
            projectId: "project-1",
            title: "Scene 2",
            groupType: null,
            groupValue: null,
            labelNumber: 2,
            sequenceOrder: 2,
            routeKey: "LUCAS",
            status: "DRAFT",
            visibility: "EXCLUSIVE",
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z",
          },
        ]);

      const { result } = renderHook(() => useLabels(), { wrapper });

      await waitFor(() => {
        expect(result.current.labels).toHaveLength(1);
      });

      await result.current.invalidateLabels();

      await waitFor(() => {
        expect(result.current.labels).toHaveLength(2);
      });

      expect(labelsApi.listLabels).toHaveBeenCalledTimes(2);
    });
  });
});
