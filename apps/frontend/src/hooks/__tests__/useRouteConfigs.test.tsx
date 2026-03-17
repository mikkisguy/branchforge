/**
 * useRouteConfigs Hook Tests
 *
 * Tests for the useRouteConfigs hook which manages route configurations.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { useRouteConfigs } from "../useRouteConfigs";
import { routeConfigsApi } from "@/lib/api/route-configs";
import type { RouteConfig } from "@branchforge/shared";
import { createTestQueryClient } from "@/test/query-client";

// Mock the routeConfigs API
vi.mock("@/lib/api/route-configs", () => ({
  routeConfigsApi: {
    listRouteConfigs: vi.fn(),
    createRouteConfig: vi.fn(),
    updateRouteConfig: vi.fn(),
    deleteRouteConfig: vi.fn(),
  },
}));

// Mock the toast context
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({
    success: mockToastSuccess,
    error: mockToastError,
  }),
}));

const mockRouteConfigs: RouteConfig[] = [
  {
    id: "route-1",
    projectId: "project-1",
    routeKey: "EILEEN",
    routeName: "Eileen Route",
    jumpPrefix: "a",
    sortOrder: 1,
    isShared: false,
  },
];

describe("useRouteConfigs", () => {
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

  describe("Query", () => {
    it("should fetch route configs for project", async () => {
      vi.mocked(routeConfigsApi.listRouteConfigs).mockResolvedValue(
        mockRouteConfigs
      );

      const { result } = renderHook(() => useRouteConfigs("project-1"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.routeConfigs).toEqual(mockRouteConfigs);
      });

      expect(routeConfigsApi.listRouteConfigs).toHaveBeenCalledWith(
        "project-1"
      );
    });

    it("should show loading state", async () => {
      vi.mocked(routeConfigsApi.listRouteConfigs).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(mockRouteConfigs), 100)
          )
      );

      const { result } = renderHook(() => useRouteConfigs("project-1"), {
        wrapper,
      });

      expect(result.current.isLoadingRouteConfigs).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoadingRouteConfigs).toBe(false);
      });
    });

    it("should handle API errors", async () => {
      const error = new Error("Failed to fetch");
      vi.mocked(routeConfigsApi.listRouteConfigs).mockRejectedValue(error);

      const { result } = renderHook(() => useRouteConfigs("project-1"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoadingRouteConfigs).toBe(false);
      });

      expect(result.current.routeConfigsError).toEqual(error);
    });
  });

  describe("Create Mutation", () => {
    it("should create route config and invalidate cache", async () => {
      vi.mocked(routeConfigsApi.listRouteConfigs).mockResolvedValue(
        mockRouteConfigs
      );
      vi.mocked(routeConfigsApi.createRouteConfig).mockResolvedValue({
        id: "route-2",
        projectId: "project-1",
        routeKey: "LUCAS",
        routeName: "Lucas Route",
        jumpPrefix: "l",
        sortOrder: 2,
        isShared: false,
      } as RouteConfig);

      const { result } = renderHook(() => useRouteConfigs("project-1"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.routeConfigs).toHaveLength(1);
      });

      await result.current.createRouteConfig({
        routeKey: "LUCAS",
        routeName: "Lucas Route",
        jumpPrefix: "l",
      });

      expect(routeConfigsApi.createRouteConfig).toHaveBeenCalledWith(
        "project-1",
        expect.objectContaining({
          routeKey: "LUCAS",
          routeName: "Lucas Route",
          jumpPrefix: "l",
        })
      );

      // Verify cache was invalidated
      await waitFor(() => {
        expect(routeConfigsApi.listRouteConfigs).toHaveBeenCalledTimes(2);
      });

      expect(mockToastSuccess).toHaveBeenCalledWith(
        "Route configuration created successfully",
        "Success"
      );
      expect(mockToastError).not.toHaveBeenCalled();
    });

    it("should show loading state during create", async () => {
      vi.mocked(routeConfigsApi.listRouteConfigs).mockResolvedValue(
        mockRouteConfigs
      );
      vi.mocked(routeConfigsApi.createRouteConfig).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  id: "route-2",
                  projectId: "project-1",
                  routeKey: "LUCAS",
                  routeName: "Lucas Route",
                  jumpPrefix: "l",
                  sortOrder: 2,
                  isShared: false,
                } as RouteConfig),
              100
            )
          )
      );

      const { result } = renderHook(() => useRouteConfigs("project-1"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.routeConfigs).toHaveLength(1);
      });

      const createPromise = result.current.createRouteConfig({
        routeKey: "LUCAS",
        routeName: "Lucas Route",
        jumpPrefix: "l",
      });

      await waitFor(() => {
        expect(result.current.isCreatingRouteConfig).toBe(true);
      });

      await createPromise;

      await waitFor(() => {
        expect(result.current.isCreatingRouteConfig).toBe(false);
      });
    });

    it("should show error toast on create failure", async () => {
      vi.mocked(routeConfigsApi.listRouteConfigs).mockResolvedValue(
        mockRouteConfigs
      );
      const error = new Error("Create failed");
      vi.mocked(routeConfigsApi.createRouteConfig).mockRejectedValue(error);

      const { result } = renderHook(() => useRouteConfigs("project-1"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.routeConfigs).toHaveLength(1);
      });

      await expect(
        result.current.createRouteConfig({
          routeKey: "LUCAS",
          routeName: "Lucas Route",
          jumpPrefix: "l",
        })
      ).rejects.toThrow("Create failed");

      expect(mockToastError).toHaveBeenCalledWith(
        "Failed to create route configuration: Create failed",
        "Error"
      );
      expect(mockToastSuccess).not.toHaveBeenCalled();
    });
  });

  describe("Update Mutation", () => {
    it("should update route config and invalidate cache", async () => {
      vi.mocked(routeConfigsApi.listRouteConfigs).mockResolvedValue(
        mockRouteConfigs
      );
      vi.mocked(routeConfigsApi.updateRouteConfig).mockResolvedValue({
        ...mockRouteConfigs[0],
        routeName: "Updated Eileen Route",
      });

      const { result } = renderHook(() => useRouteConfigs("project-1"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.routeConfigs).toHaveLength(1);
      });

      await result.current.updateRouteConfig("route-1", {
        routeName: "Updated Eileen Route",
      });

      expect(routeConfigsApi.updateRouteConfig).toHaveBeenCalledWith(
        "route-1",
        expect.objectContaining({
          routeName: "Updated Eileen Route",
        })
      );

      // Verify cache was invalidated
      await waitFor(() => {
        expect(routeConfigsApi.listRouteConfigs).toHaveBeenCalledTimes(2);
      });

      expect(mockToastSuccess).toHaveBeenCalledWith(
        "Route configuration updated successfully",
        "Success"
      );
    });

    it("should show error toast on update failure", async () => {
      vi.mocked(routeConfigsApi.listRouteConfigs).mockResolvedValue(
        mockRouteConfigs
      );
      const error = new Error("Update failed");
      vi.mocked(routeConfigsApi.updateRouteConfig).mockRejectedValue(error);

      const { result } = renderHook(() => useRouteConfigs("project-1"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.routeConfigs).toHaveLength(1);
      });

      await expect(
        result.current.updateRouteConfig("route-1", {
          routeName: "Updated",
        })
      ).rejects.toThrow("Update failed");

      expect(mockToastError).toHaveBeenCalledWith(
        "Failed to update route configuration: Update failed",
        "Error"
      );
    });
  });

  describe("Delete Mutation", () => {
    it("should delete route config and invalidate cache", async () => {
      vi.mocked(routeConfigsApi.listRouteConfigs).mockResolvedValue(
        mockRouteConfigs
      );
      vi.mocked(routeConfigsApi.deleteRouteConfig).mockResolvedValue(undefined);

      const { result } = renderHook(() => useRouteConfigs("project-1"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.routeConfigs).toHaveLength(1);
      });

      await result.current.deleteRouteConfig("route-1");

      expect(routeConfigsApi.deleteRouteConfig).toHaveBeenCalledWith("route-1");

      // Verify cache was invalidated
      await waitFor(() => {
        expect(routeConfigsApi.listRouteConfigs).toHaveBeenCalledTimes(2);
      });

      expect(mockToastSuccess).toHaveBeenCalledWith(
        "Route configuration deleted successfully",
        "Success"
      );
    });

    it("should show error toast on delete failure", async () => {
      vi.mocked(routeConfigsApi.listRouteConfigs).mockResolvedValue(
        mockRouteConfigs
      );
      const error = new Error("Delete failed");
      vi.mocked(routeConfigsApi.deleteRouteConfig).mockRejectedValue(error);

      const { result } = renderHook(() => useRouteConfigs("project-1"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.routeConfigs).toHaveLength(1);
      });

      await expect(result.current.deleteRouteConfig("route-1")).rejects.toThrow(
        "Delete failed"
      );

      expect(mockToastError).toHaveBeenCalledWith(
        "Failed to delete route configuration: Delete failed",
        "Error"
      );
    });
  });

  describe("Refresh", () => {
    it("should refresh route configs list", async () => {
      vi.mocked(routeConfigsApi.listRouteConfigs)
        .mockResolvedValueOnce(mockRouteConfigs)
        .mockResolvedValueOnce([
          ...mockRouteConfigs,
          {
            id: "route-2",
            projectId: "project-1",
            routeKey: "LUCAS",
            routeName: "Lucas Route",
            jumpPrefix: "l",
            sortOrder: 2,
            isShared: false,
          },
        ]);

      const { result } = renderHook(() => useRouteConfigs("project-1"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.routeConfigs).toHaveLength(1);
      });

      result.current.refreshRouteConfigs();

      await waitFor(() => {
        expect(result.current.routeConfigs).toHaveLength(2);
      });

      expect(routeConfigsApi.listRouteConfigs).toHaveBeenCalledTimes(2);
    });
  });
});
