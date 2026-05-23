/**
 * useVariables Hook Tests
 *
 * Tests for the useVariables hook which manages state stateVariables.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { useVariables } from "../useVariables";
import { variablesApi } from "@/lib/api/variables";
import type { Variable } from "@branchforge/shared";
import { createTestQueryClient } from "@/test/query-client";

// Mock the stateVariables API
vi.mock("@/lib/api/variables", () => ({
  variablesApi: {
    listVariables: vi.fn(),
    createVariable: vi.fn(),
    updateVariable: vi.fn(),
    deleteVariable: vi.fn(),
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

const mockVariables: Variable[] = [
  {
    id: "var-1",
    projectId: "project-1",
    key: "met_eileen",
    description: "Met Eileen",
    category: "flags",
    createdAt: "2024-01-01T00:00:00.000Z",
  },
];

describe("useVariables", () => {
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
    it("should fetch variables for project", async () => {
      vi.mocked(variablesApi.listVariables).mockResolvedValue(mockVariables);

      const { result } = renderHook(() => useVariables("project-1"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.variables).toEqual(mockVariables);
      });

      expect(variablesApi.listVariables).toHaveBeenCalledWith("project-1");
    });

    it("should show loading state", async () => {
      vi.mocked(variablesApi.listVariables).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(mockVariables), 100)
          )
      );

      const { result } = renderHook(() => useVariables("project-1"), {
        wrapper,
      });

      expect(result.current.isLoadingVariables).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoadingVariables).toBe(false);
      });
    });

    it("should handle API errors", async () => {
      const error = new Error("Failed to fetch");
      vi.mocked(variablesApi.listVariables).mockRejectedValue(error);

      const { result } = renderHook(() => useVariables("project-1"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoadingVariables).toBe(false);
      });

      expect(result.current.variablesError).toEqual(error);
    });
  });

  describe("Create Mutation", () => {
    it("should create variable and invalidate cache", async () => {
      vi.mocked(variablesApi.listVariables).mockResolvedValue(mockVariables);
      vi.mocked(variablesApi.createVariable).mockResolvedValue({
        id: "var-2",
        projectId: "project-1",
        key: "met_lucas",
        description: "Met Lucas",
        category: "flags",
        createdAt: "2024-01-01T00:00:00.000Z",
      } as Variable);

      const { result } = renderHook(() => useVariables("project-1"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.variables).toHaveLength(1);
      });

      await result.current.createVariable({
        key: "met_lucas",
        description: "Met Lucas",
      });

      expect(variablesApi.createVariable).toHaveBeenCalledWith(
        "project-1",
        expect.objectContaining({
          key: "met_lucas",
          description: "Met Lucas",
        })
      );

      // Verify cache was invalidated
      await waitFor(() => {
        expect(variablesApi.listVariables).toHaveBeenCalledTimes(2);
      });

      expect(mockToastSuccess).toHaveBeenCalledWith(
        "Variable created successfully",
        "Success"
      );
    });

    it("should show loading state during create", async () => {
      vi.mocked(variablesApi.listVariables).mockResolvedValue(mockVariables);
      vi.mocked(variablesApi.createVariable).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  id: "var-2",
                  projectId: "project-1",
                  key: "met_lucas",
                  description: "Met Lucas",
                  category: "flags",
                  createdAt: "2024-01-01T00:00:00.000Z",
                } as Variable),
              100
            )
          )
      );

      const { result } = renderHook(() => useVariables("project-1"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.variables).toHaveLength(1);
      });

      const createPromise = result.current.createVariable({
        key: "met_lucas",
      });

      await waitFor(() => {
        expect(result.current.isCreatingVariable).toBe(true);
      });

      await createPromise;

      await waitFor(() => {
        expect(result.current.isCreatingVariable).toBe(false);
      });
    });

    it("should show error toast on create failure", async () => {
      vi.mocked(variablesApi.listVariables).mockResolvedValue(mockVariables);
      const error = new Error("Create failed");
      vi.mocked(variablesApi.createVariable).mockRejectedValue(error);

      const { result } = renderHook(() => useVariables("project-1"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.variables).toHaveLength(1);
      });

      await expect(
        result.current.createVariable({ key: "met_lucas" })
      ).rejects.toThrow("Create failed");

      expect(mockToastError).toHaveBeenCalledWith(
        "Failed to create variable: Create failed",
        "Error"
      );
    });
  });

  describe("Update Mutation", () => {
    it("should update variable and invalidate cache", async () => {
      vi.mocked(variablesApi.listVariables).mockResolvedValue(mockVariables);
      vi.mocked(variablesApi.updateVariable).mockResolvedValue({
        ...mockVariables[0],
        description: "Updated description",
      });

      const { result } = renderHook(() => useVariables("project-1"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.variables).toHaveLength(1);
      });

      await result.current.updateVariable("var-1", {
        description: "Updated description",
      });

      expect(variablesApi.updateVariable).toHaveBeenCalledWith(
        "var-1",
        expect.objectContaining({
          description: "Updated description",
        })
      );

      // Verify cache was invalidated
      await waitFor(() => {
        expect(variablesApi.listVariables).toHaveBeenCalledTimes(2);
      });

      expect(mockToastSuccess).toHaveBeenCalledWith(
        "Variable updated successfully",
        "Success"
      );
    });

    it("should toggle isUpdatingVariable during update", async () => {
      vi.mocked(variablesApi.listVariables).mockResolvedValue(mockVariables);

      let resolveUpdate: (value: Variable) => void;
      const deferredUpdate = new Promise<Variable>((resolve) => {
        resolveUpdate = resolve;
      });

      vi.mocked(variablesApi.updateVariable).mockReturnValue(deferredUpdate);

      const { result } = renderHook(() => useVariables("project-1"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.variables).toHaveLength(1);
      });

      expect(result.current.isUpdatingVariable).toBe(false);

      const updatePromise = result.current.updateVariable("var-1", {
        description: "Updated description",
      });

      await waitFor(() => {
        expect(result.current.isUpdatingVariable).toBe(true);
      });

      expect(variablesApi.updateVariable).toHaveBeenCalledWith(
        "var-1",
        expect.objectContaining({
          description: "Updated description",
        })
      );

      resolveUpdate!({
        ...mockVariables[0],
        description: "Updated description",
      });

      await updatePromise;

      await waitFor(() => {
        expect(result.current.isUpdatingVariable).toBe(false);
      });

      expect(mockToastSuccess).toHaveBeenCalledWith(
        "Variable updated successfully",
        "Success"
      );
    });

    it("should show error toast on update failure", async () => {
      vi.mocked(variablesApi.listVariables).mockResolvedValue(mockVariables);
      const error = new Error("Update failed");
      vi.mocked(variablesApi.updateVariable).mockRejectedValue(error);

      const { result } = renderHook(() => useVariables("project-1"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.variables).toHaveLength(1);
      });

      await expect(
        result.current.updateVariable("var-1", { description: "Updated" })
      ).rejects.toThrow("Update failed");

      expect(mockToastError).toHaveBeenCalledWith(
        "Failed to update variable: Update failed",
        "Error"
      );
    });
  });

  describe("Delete Mutation", () => {
    it("should delete variable and invalidate cache", async () => {
      vi.mocked(variablesApi.listVariables).mockResolvedValue(mockVariables);
      vi.mocked(variablesApi.deleteVariable).mockResolvedValue(undefined);

      const { result } = renderHook(() => useVariables("project-1"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.variables).toHaveLength(1);
      });

      await result.current.deleteVariable("var-1");

      expect(variablesApi.deleteVariable).toHaveBeenCalledWith("var-1");

      // Verify cache was invalidated
      await waitFor(() => {
        expect(variablesApi.listVariables).toHaveBeenCalledTimes(2);
      });

      expect(mockToastSuccess).toHaveBeenCalledWith(
        "Variable deleted successfully",
        "Success"
      );
    });

    it("should show error toast on delete failure", async () => {
      vi.mocked(variablesApi.listVariables).mockResolvedValue(mockVariables);
      const error = new Error("Delete failed");
      vi.mocked(variablesApi.deleteVariable).mockRejectedValue(error);

      const { result } = renderHook(() => useVariables("project-1"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.variables).toHaveLength(1);
      });

      await expect(result.current.deleteVariable("var-1")).rejects.toThrow(
        "Delete failed"
      );

      expect(mockToastError).toHaveBeenCalledWith(
        "Failed to delete variable: Delete failed",
        "Error"
      );
    });
  });

  describe("Refresh", () => {
    it("should refresh variables list", async () => {
      vi.mocked(variablesApi.listVariables)
        .mockResolvedValueOnce(mockVariables)
        .mockResolvedValueOnce([
          ...mockVariables,
          {
            id: "var-2",
            projectId: "project-1",
            key: "met_lucas",
            description: "Met Lucas",
            category: "flags",
            createdAt: "2024-01-01T00:00:00.000Z",
          },
        ]);

      const { result } = renderHook(() => useVariables("project-1"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.variables).toHaveLength(1);
      });

      result.current.refreshVariables();

      await waitFor(() => {
        expect(result.current.variables).toHaveLength(2);
      });

      expect(variablesApi.listVariables).toHaveBeenCalledTimes(2);
    });
  });
});
