/**
 * useStateVariables Hook Tests
 *
 * Tests for the useStateVariables hook which manages state variables.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useStateVariables } from "../useStateVariables";
import { stateVariablesApi } from "@/lib/api/state-variables";
import type { StateVariable } from "@branchforge/shared";

// Mock the stateVariables API
vi.mock("@/lib/api/state-variables", () => ({
  stateVariablesApi: {
    listStateVariables: vi.fn(),
    createStateVariable: vi.fn(),
    updateStateVariable: vi.fn(),
    deleteStateVariable: vi.fn(),
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

const mockStateVariables: StateVariable[] = [
  {
    id: "var-1",
    projectId: "project-1",
    key: "met_eileen",
    description: "Met Eileen",
    category: "flags",
    createdAt: "2024-01-01T00:00:00.000Z",
  },
];

describe("useStateVariables", () => {
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
    mockToastSuccess.mockClear();
    mockToastError.mockClear();
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe("Query", () => {
    it("should fetch state variables for project", async () => {
      vi.mocked(stateVariablesApi.listStateVariables).mockResolvedValue(
        mockStateVariables
      );

      const { result } = renderHook(
        () => useStateVariables("project-1"),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.stateVariables).toEqual(mockStateVariables);
      });

      expect(
        stateVariablesApi.listStateVariables
      ).toHaveBeenCalledWith("project-1");
    });

    it("should show loading state", async () => {
      vi.mocked(stateVariablesApi.listStateVariables).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(mockStateVariables), 100)
          )
      );

      const { result } = renderHook(
        () => useStateVariables("project-1"),
        { wrapper }
      );

      expect(result.current.isLoadingStateVariables).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoadingStateVariables).toBe(false);
      });
    });

    it("should handle API errors", async () => {
      const error = new Error("Failed to fetch");
      vi.mocked(stateVariablesApi.listStateVariables).mockRejectedValue(error);

      const { result } = renderHook(
        () => useStateVariables("project-1"),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoadingStateVariables).toBe(false);
      });

      expect(result.current.stateVariablesError).toEqual(error);
    });
  });

  describe("Create Mutation", () => {
    it("should create state variable and invalidate cache", async () => {
      vi.mocked(stateVariablesApi.listStateVariables).mockResolvedValue(
        mockStateVariables
      );
      vi.mocked(stateVariablesApi.createStateVariable).mockResolvedValue({
        id: "var-2",
        projectId: "project-1",
        key: "met_lucas",
        description: "Met Lucas",
        category: "flags",
        createdAt: "2024-01-01T00:00:00.000Z",
      } as StateVariable);

      const { result } = renderHook(
        () => useStateVariables("project-1"),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.stateVariables).toHaveLength(1);
      });

      await result.current.createStateVariable({
        key: "met_lucas",
        description: "Met Lucas",
      });

      expect(
        stateVariablesApi.createStateVariable
      ).toHaveBeenCalledWith("project-1",
        expect.objectContaining({
          key: "met_lucas",
          description: "Met Lucas",
        })
      );

      // Verify cache was invalidated
      await waitFor(() => {
        expect(stateVariablesApi.listStateVariables).toHaveBeenCalledTimes(2);
      });

      expect(mockToastSuccess).toHaveBeenCalledWith(
        "State variable created successfully",
        "Success"
      );
    });

    it("should show loading state during create", async () => {
      vi.mocked(stateVariablesApi.listStateVariables).mockResolvedValue(
        mockStateVariables
      );
      vi.mocked(stateVariablesApi.createStateVariable).mockImplementation(
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
                } as StateVariable),
              100
            )
          )
      );

      const { result } = renderHook(
        () => useStateVariables("project-1"),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.stateVariables).toHaveLength(1);
      });

      const createPromise = result.current.createStateVariable({
        key: "met_lucas",
      });

      await waitFor(() => {
        expect(result.current.isCreatingStateVariable).toBe(true);
      });

      await createPromise;

      await waitFor(() => {
        expect(result.current.isCreatingStateVariable).toBe(false);
      });
    });

    it("should show error toast on create failure", async () => {
      vi.mocked(stateVariablesApi.listStateVariables).mockResolvedValue(
        mockStateVariables
      );
      const error = new Error("Create failed");
      vi.mocked(stateVariablesApi.createStateVariable).mockRejectedValue(error);

      const { result } = renderHook(
        () => useStateVariables("project-1"),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.stateVariables).toHaveLength(1);
      });

      await expect(
        result.current.createStateVariable({ key: "met_lucas" })
      ).rejects.toThrow("Create failed");

      expect(mockToastError).toHaveBeenCalledWith(
        "Failed to create state variable: Create failed",
        "Error"
      );
    });
  });

  describe("Update Mutation", () => {
    it("should update state variable and invalidate cache", async () => {
      vi.mocked(stateVariablesApi.listStateVariables).mockResolvedValue(
        mockStateVariables
      );
      vi.mocked(stateVariablesApi.updateStateVariable).mockResolvedValue({
        ...mockStateVariables[0],
        description: "Updated description",
      });

      const { result } = renderHook(
        () => useStateVariables("project-1"),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.stateVariables).toHaveLength(1);
      });

      await result.current.updateStateVariable("var-1", {
        description: "Updated description",
      });

      expect(
        stateVariablesApi.updateStateVariable
      ).toHaveBeenCalledWith("var-1",
        expect.objectContaining({
          description: "Updated description",
        })
      );

      // Verify cache was invalidated
      await waitFor(() => {
        expect(stateVariablesApi.listStateVariables).toHaveBeenCalledTimes(2);
      });

      expect(mockToastSuccess).toHaveBeenCalledWith(
        "State variable updated successfully",
        "Success"
      );
    });

    it("should show error toast on update failure", async () => {
      vi.mocked(stateVariablesApi.listStateVariables).mockResolvedValue(
        mockStateVariables
      );
      const error = new Error("Update failed");
      vi.mocked(stateVariablesApi.updateStateVariable).mockRejectedValue(error);

      const { result } = renderHook(
        () => useStateVariables("project-1"),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.stateVariables).toHaveLength(1);
      });

      await expect(
        result.current.updateStateVariable("var-1", { description: "Updated" })
      ).rejects.toThrow("Update failed");

      expect(mockToastError).toHaveBeenCalledWith(
        "Failed to update state variable: Update failed",
        "Error"
      );
    });
  });

  describe("Delete Mutation", () => {
    it("should delete state variable and invalidate cache", async () => {
      vi.mocked(stateVariablesApi.listStateVariables).mockResolvedValue(
        mockStateVariables
      );
      vi.mocked(stateVariablesApi.deleteStateVariable).mockResolvedValue(undefined);

      const { result } = renderHook(
        () => useStateVariables("project-1"),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.stateVariables).toHaveLength(1);
      });

      await result.current.deleteStateVariable("var-1");

      expect(
        stateVariablesApi.deleteStateVariable
      ).toHaveBeenCalledWith("var-1");

      // Verify cache was invalidated
      await waitFor(() => {
        expect(stateVariablesApi.listStateVariables).toHaveBeenCalledTimes(2);
      });

      expect(mockToastSuccess).toHaveBeenCalledWith(
        "State variable deleted successfully",
        "Success"
      );
    });

    it("should show error toast on delete failure", async () => {
      vi.mocked(stateVariablesApi.listStateVariables).mockResolvedValue(
        mockStateVariables
      );
      const error = new Error("Delete failed");
      vi.mocked(stateVariablesApi.deleteStateVariable).mockRejectedValue(error);

      const { result } = renderHook(
        () => useStateVariables("project-1"),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.stateVariables).toHaveLength(1);
      });

      await expect(
        result.current.deleteStateVariable("var-1")
      ).rejects.toThrow("Delete failed");

      expect(mockToastError).toHaveBeenCalledWith(
        "Failed to delete state variable: Delete failed",
        "Error"
      );
    });
  });

  describe("Refresh", () => {
    it("should refresh state variables list", async () => {
      vi.mocked(stateVariablesApi.listStateVariables)
        .mockResolvedValueOnce(mockStateVariables)
        .mockResolvedValueOnce([
          ...mockStateVariables,
          {
            id: "var-2",
            projectId: "project-1",
            key: "met_lucas",
            description: "Met Lucas",
            category: "flags",
            createdAt: "2024-01-01T00:00:00.000Z",
          },
        ]);

      const { result } = renderHook(
        () => useStateVariables("project-1"),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.stateVariables).toHaveLength(1);
      });

      result.current.refreshStateVariables();

      await waitFor(() => {
        expect(result.current.stateVariables).toHaveLength(2);
      });

      expect(stateVariablesApi.listStateVariables).toHaveBeenCalledTimes(2);
    });
  });
});
