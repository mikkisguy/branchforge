/**
 * useRenpyDefinitions Hook Tests
 *
 * Tests for the useRenpyDefinitions hook which manages Ren'Py definitions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRenpyDefinitions } from "../useRenpyDefinitions";
import { renpyDefinitionsApi } from "@/lib/api/renpy-definitions";
import type { RenpyDefinition, RenpyDefinitionCategory } from "@branchforge/shared";

// Mock the renpyDefinitions API
vi.mock("@/lib/api/renpy-definitions", () => ({
  renpyDefinitionsApi: {
    listRenpyDefinitions: vi.fn(),
    createRenpyDefinition: vi.fn(),
    updateRenpyDefinition: vi.fn(),
    deleteRenpyDefinition: vi.fn(),
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

const mockRenpyDefinitions: RenpyDefinition[] = [
  {
    id: "def-1",
    projectId: "project-1",
    category: "CHARACTER" as RenpyDefinitionCategory,
    tag: "a",
    displayName: "Eileen",
    definitionCode: 'define a = Character("Eileen")',
    referenceTag: null,
    sortOrder: 1,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
];

describe("useRenpyDefinitions", () => {
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
    it("should fetch Ren'Py definitions for project", async () => {
      vi.mocked(renpyDefinitionsApi.listRenpyDefinitions).mockResolvedValue(
        mockRenpyDefinitions
      );

      const { result } = renderHook(
        () => useRenpyDefinitions("project-1"),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.renpyDefinitions).toEqual(mockRenpyDefinitions);
      });

      expect(
        renpyDefinitionsApi.listRenpyDefinitions
      ).toHaveBeenCalledWith("project-1");
    });

    it("should show loading state", async () => {
      vi.mocked(renpyDefinitionsApi.listRenpyDefinitions).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(mockRenpyDefinitions), 100)
          )
      );

      const { result } = renderHook(
        () => useRenpyDefinitions("project-1"),
        { wrapper }
      );

      expect(result.current.isLoadingRenpyDefinitions).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoadingRenpyDefinitions).toBe(false);
      });
    });

    it("should handle API errors", async () => {
      const error = new Error("Failed to fetch");
      vi.mocked(renpyDefinitionsApi.listRenpyDefinitions).mockRejectedValue(error);

      const { result } = renderHook(
        () => useRenpyDefinitions("project-1"),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoadingRenpyDefinitions).toBe(false);
      });

      expect(result.current.renpyDefinitionsError).toEqual(error);
    });
  });

  describe("Create Mutation", () => {
    it("should create Ren'Py definition and invalidate cache", async () => {
      vi.mocked(renpyDefinitionsApi.listRenpyDefinitions).mockResolvedValue(
        mockRenpyDefinitions
      );
      vi.mocked(renpyDefinitionsApi.createRenpyDefinition).mockResolvedValue({
        id: "def-2",
        projectId: "project-1",
        category: "CHARACTER" as RenpyDefinitionCategory,
        tag: "l",
        displayName: "Lucas",
        definitionCode: 'define l = Character("Lucas")',
        referenceTag: null,
        sortOrder: 2,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      });

      const { result } = renderHook(
        () => useRenpyDefinitions("project-1"),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.renpyDefinitions).toHaveLength(1);
      });

      await result.current.createRenpyDefinition({
        category: "CHARACTER",
        tag: "l",
        displayName: "Lucas",
        definitionCode: 'define l = Character("Lucas")',
      });

      expect(
        renpyDefinitionsApi.createRenpyDefinition
      ).toHaveBeenCalledWith("project-1",
        expect.objectContaining({
          category: "CHARACTER",
          tag: "l",
          displayName: "Lucas",
        })
      );

      // Verify cache was invalidated
      await waitFor(() => {
        expect(renpyDefinitionsApi.listRenpyDefinitions).toHaveBeenCalledTimes(2);
      });

      expect(mockToastSuccess).toHaveBeenCalledWith(
        "Ren'Py definition created successfully",
        "Success"
      );
    });

    it("should show loading state during create", async () => {
      vi.mocked(renpyDefinitionsApi.listRenpyDefinitions).mockResolvedValue(
        mockRenpyDefinitions
      );
      vi.mocked(renpyDefinitionsApi.createRenpyDefinition).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  id: "def-2",
                  projectId: "project-1",
                  category: "CHARACTER" as RenpyDefinitionCategory,
                  tag: "l",
                  displayName: "Lucas",
                  definitionCode: 'define l = Character("Lucas")',
                  referenceTag: null,
                  sortOrder: 2,
                  createdAt: "2024-01-01T00:00:00.000Z",
                  updatedAt: "2024-01-01T00:00:00.000Z",
                } as RenpyDefinition),
              100
            )
          )
      );

      const { result } = renderHook(
        () => useRenpyDefinitions("project-1"),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.renpyDefinitions).toHaveLength(1);
      });

      const createPromise = result.current.createRenpyDefinition({
        category: "CHARACTER",
        tag: "l",
        displayName: "Lucas",
        definitionCode: 'define l = Character("Lucas")',
      });

      await waitFor(() => {
        expect(result.current.isCreatingRenpyDefinition).toBe(true);
      });

      await createPromise;

      await waitFor(() => {
        expect(result.current.isCreatingRenpyDefinition).toBe(false);
      });
    });

    it("should show error toast on create failure", async () => {
      vi.mocked(renpyDefinitionsApi.listRenpyDefinitions).mockResolvedValue(
        mockRenpyDefinitions
      );
      const error = new Error("Create failed");
      vi.mocked(renpyDefinitionsApi.createRenpyDefinition).mockRejectedValue(error);

      const { result } = renderHook(
        () => useRenpyDefinitions("project-1"),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.renpyDefinitions).toHaveLength(1);
      });

      await expect(
        result.current.createRenpyDefinition({
          category: "CHARACTER",
          tag: "l",
          displayName: "Lucas",
          definitionCode: 'define l = Character("Lucas")',
        })
      ).rejects.toThrow("Create failed");

      expect(mockToastError).toHaveBeenCalledWith(
        "Failed to create Ren'Py definition: Create failed",
        "Error"
      );
    });
  });

  describe("Update Mutation", () => {
    it("should update Ren'Py definition and invalidate cache", async () => {
      vi.mocked(renpyDefinitionsApi.listRenpyDefinitions).mockResolvedValue(
        mockRenpyDefinitions
      );
      vi.mocked(renpyDefinitionsApi.updateRenpyDefinition).mockResolvedValue({
        ...mockRenpyDefinitions[0],
        displayName: "Updated Eileen",
      });

      const { result } = renderHook(
        () => useRenpyDefinitions("project-1"),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.renpyDefinitions).toHaveLength(1);
      });

      await result.current.updateRenpyDefinition("def-1", {
        displayName: "Updated Eileen",
      });

      expect(
        renpyDefinitionsApi.updateRenpyDefinition
      ).toHaveBeenCalledWith("def-1",
        expect.objectContaining({
          displayName: "Updated Eileen",
        })
      );

      // Verify cache was invalidated
      await waitFor(() => {
        expect(renpyDefinitionsApi.listRenpyDefinitions).toHaveBeenCalledTimes(2);
      });

      expect(mockToastSuccess).toHaveBeenCalledWith(
        "Ren'Py definition updated successfully",
        "Success"
      );
    });

    it("should show error toast on update failure", async () => {
      vi.mocked(renpyDefinitionsApi.listRenpyDefinitions).mockResolvedValue(
        mockRenpyDefinitions
      );
      const error = new Error("Update failed");
      vi.mocked(renpyDefinitionsApi.updateRenpyDefinition).mockRejectedValue(error);

      const { result } = renderHook(
        () => useRenpyDefinitions("project-1"),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.renpyDefinitions).toHaveLength(1);
      });

      await expect(
        result.current.updateRenpyDefinition("def-1", { displayName: "Updated" })
      ).rejects.toThrow("Update failed");

      expect(mockToastError).toHaveBeenCalledWith(
        "Failed to update Ren'Py definition: Update failed",
        "Error"
      );
    });
  });

  describe("Delete Mutation", () => {
    it("should delete Ren'Py definition and invalidate cache", async () => {
      vi.mocked(renpyDefinitionsApi.listRenpyDefinitions).mockResolvedValue(
        mockRenpyDefinitions
      );
      vi.mocked(renpyDefinitionsApi.deleteRenpyDefinition).mockResolvedValue(undefined);

      const { result } = renderHook(
        () => useRenpyDefinitions("project-1"),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.renpyDefinitions).toHaveLength(1);
      });

      await result.current.deleteRenpyDefinition("def-1");

      expect(
        renpyDefinitionsApi.deleteRenpyDefinition
      ).toHaveBeenCalledWith("def-1");

      // Verify cache was invalidated
      await waitFor(() => {
        expect(renpyDefinitionsApi.listRenpyDefinitions).toHaveBeenCalledTimes(2);
      });

      expect(mockToastSuccess).toHaveBeenCalledWith(
        "Ren'Py definition deleted successfully",
        "Success"
      );
    });

    it("should show error toast on delete failure", async () => {
      vi.mocked(renpyDefinitionsApi.listRenpyDefinitions).mockResolvedValue(
        mockRenpyDefinitions
      );
      const error = new Error("Delete failed");
      vi.mocked(renpyDefinitionsApi.deleteRenpyDefinition).mockRejectedValue(error);

      const { result } = renderHook(
        () => useRenpyDefinitions("project-1"),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.renpyDefinitions).toHaveLength(1);
      });

      await expect(
        result.current.deleteRenpyDefinition("def-1")
      ).rejects.toThrow("Delete failed");

      expect(mockToastError).toHaveBeenCalledWith(
        "Failed to delete Ren'Py definition: Delete failed",
        "Error"
      );
    });
  });

  describe("Refresh", () => {
    it("should refresh Ren'Py definitions list", async () => {
      vi.mocked(renpyDefinitionsApi.listRenpyDefinitions)
        .mockResolvedValueOnce(mockRenpyDefinitions)
        .mockResolvedValueOnce([
          ...mockRenpyDefinitions,
          {
            id: "def-2",
            projectId: "project-1",
            category: "CHARACTER" as RenpyDefinitionCategory,
            tag: "l",
            displayName: "Lucas",
            definitionCode: 'define l = Character("Lucas")',
            referenceTag: null,
            sortOrder: 2,
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z",
          },
        ]);

      const { result } = renderHook(
        () => useRenpyDefinitions("project-1"),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.renpyDefinitions).toHaveLength(1);
      });

      result.current.refreshRenpyDefinitions();

      await waitFor(() => {
        expect(result.current.renpyDefinitions).toHaveLength(2);
      });

      expect(renpyDefinitionsApi.listRenpyDefinitions).toHaveBeenCalledTimes(2);
    });
  });
});
