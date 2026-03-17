/**
 * useCharacters Hook Tests
 *
 * Tests for the useCharacters hook which manages character state and operations.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { useCharacters } from "../useCharacters";
import { charactersApi } from "@/lib/api/characters";
import type { Character } from "@branchforge/shared";
import { createTestQueryClient } from "@/test/query-client";

// Mock the characters API
vi.mock("@/lib/api/characters", () => ({
  charactersApi: {
    listCharacters: vi.fn(),
    createCharacter: vi.fn(),
    updateCharacter: vi.fn(),
    deleteCharacter: vi.fn(),
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

const mockCharacters: Character[] = [
  {
    id: "char-1",
    projectId: "test-project-id",
    name: "Eileen",
    displayName: "Eileen",
    renpyTag: "a",
    color: "#FF6B6B",
    routeAffiliation: "EILEEN",
    isLoveInterest: true,
    dialogueStyle: "casual",
    conditionalPrefix: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
  {
    id: "char-2",
    projectId: "test-project-id",
    name: "Lucas",
    displayName: "Lucas",
    renpyTag: "l",
    color: "#4ECDC4",
    routeAffiliation: "LUCAS",
    isLoveInterest: true,
    dialogueStyle: "formal",
    conditionalPrefix: "lucas_",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
];

describe("useCharacters", () => {
  let queryClient: QueryClient;
  const projectId = "test-project-id";

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = createTestQueryClient();
    vi.clearAllMocks();
    mockToastSuccess.mockClear();
    mockToastError.mockClear();
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe("Query", () => {
    it("should fetch characters on mount", async () => {
      vi.mocked(charactersApi.listCharacters).mockResolvedValue(mockCharacters);

      const { result } = renderHook(() => useCharacters(projectId), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.characters).toEqual(mockCharacters);
      });

      expect(charactersApi.listCharacters).toHaveBeenCalledWith(projectId);
    });

    it("should show loading during fetch", async () => {
      vi.mocked(charactersApi.listCharacters).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(mockCharacters), 100)
          )
      );

      const { result } = renderHook(() => useCharacters(projectId), {
        wrapper,
      });

      expect(result.current.isLoadingCharacters).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoadingCharacters).toBe(false);
      });
    });

    it("should handle API errors", async () => {
      const error = new Error("Failed to fetch");
      vi.mocked(charactersApi.listCharacters).mockRejectedValue(error);

      const { result } = renderHook(() => useCharacters(projectId), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.charactersError).toEqual(error);
      });
    });

    it("should not fetch when projectId is empty", async () => {
      const { result } = renderHook(() => useCharacters(""), {
        wrapper,
      });

      await waitFor(() => {
        expect(charactersApi.listCharacters).not.toHaveBeenCalled();
        expect(result.current.characters).toEqual([]);
      });
    });
  });

  describe("Create Mutation", () => {
    it("should create character and invalidate cache", async () => {
      vi.mocked(charactersApi.listCharacters).mockResolvedValue(mockCharacters);
      vi.mocked(charactersApi.createCharacter).mockResolvedValue({
        id: "char-3",
        projectId: "test-project-id",
        name: "New Character",
        displayName: "New",
        renpyTag: "new",
        color: "#123456",
        routeAffiliation: null,
        isLoveInterest: false,
        dialogueStyle: null,
        conditionalPrefix: null,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      });

      const { result } = renderHook(() => useCharacters(projectId), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.characters).toEqual(mockCharacters);
      });

      await result.current.createCharacter({
        name: "New Character",
        displayName: "New",
        renpyTag: "new",
        color: "#123456",
      });

      expect(charactersApi.createCharacter).toHaveBeenCalledWith(
        projectId,
        expect.objectContaining({
          name: "New Character",
          displayName: "New",
          renpyTag: "new",
          color: "#123456",
        })
      );

      // Verify cache was invalidated
      await waitFor(() => {
        expect(charactersApi.listCharacters).toHaveBeenCalledTimes(2);
      });

      // Verify toast success was called
      expect(mockToastSuccess).toHaveBeenCalledWith(
        "Character created successfully",
        "Success"
      );
      expect(mockToastError).not.toHaveBeenCalled();
    });

    it("should show loading state during create", async () => {
      vi.mocked(charactersApi.listCharacters).mockResolvedValue(mockCharacters);
      vi.mocked(charactersApi.createCharacter).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  id: "char-3",
                  projectId: "test-project-id",
                  name: "New",
                  displayName: "New",
                  renpyTag: "new",
                  color: "#123456",
                  routeAffiliation: null,
                  isLoveInterest: false,
                  dialogueStyle: null,
                  conditionalPrefix: null,
                  createdAt: "2024-01-01T00:00:00.000Z",
                  updatedAt: "2024-01-01T00:00:00.000Z",
                } as Character),
              100
            )
          )
      );

      const { result } = renderHook(() => useCharacters(projectId), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.characters).toEqual(mockCharacters);
      });

      // Start the create but don't await
      const createPromise = result.current.createCharacter({
        name: "New",
        displayName: "New",
        renpyTag: "new",
        color: "#123456",
      });

      // Wait for loading state to be set
      await waitFor(() => {
        expect(result.current.isCreatingCharacter).toBe(true);
      });

      await createPromise;

      await waitFor(() => {
        expect(result.current.isCreatingCharacter).toBe(false);
      });
    });

    it("should show error toast on create failure", async () => {
      vi.mocked(charactersApi.listCharacters).mockResolvedValue(mockCharacters);
      const error = new Error("Network error");
      vi.mocked(charactersApi.createCharacter).mockRejectedValue(error);

      const { result } = renderHook(() => useCharacters(projectId), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.characters).toEqual(mockCharacters);
      });

      await expect(
        result.current.createCharacter({
          name: "New",
          displayName: "New",
          renpyTag: "new",
          color: "#123456",
        })
      ).rejects.toThrow("Network error");

      // Verify toast error was called
      expect(mockToastError).toHaveBeenCalledWith(
        "Failed to create character: Network error",
        "Error"
      );
      expect(mockToastSuccess).not.toHaveBeenCalled();
    });
  });

  describe("Update Mutation", () => {
    it("should update character and invalidate cache", async () => {
      vi.mocked(charactersApi.listCharacters).mockResolvedValue(mockCharacters);
      vi.mocked(charactersApi.updateCharacter).mockResolvedValue({
        ...mockCharacters[0],
        displayName: "Updated Eileen",
      } as Character);

      const { result } = renderHook(() => useCharacters(projectId), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.characters).toEqual(mockCharacters);
      });

      await result.current.updateCharacter("char-1", {
        displayName: "Updated Eileen",
      });

      expect(charactersApi.updateCharacter).toHaveBeenCalledWith(
        "char-1",
        expect.objectContaining({
          displayName: "Updated Eileen",
        })
      );

      // Verify cache was invalidated
      await waitFor(() => {
        expect(charactersApi.listCharacters).toHaveBeenCalledTimes(2);
      });

      // Verify toast success was called
      expect(mockToastSuccess).toHaveBeenCalledWith(
        "Character updated successfully",
        "Success"
      );
      expect(mockToastError).not.toHaveBeenCalled();
    });

    it("should show loading state during update", async () => {
      vi.mocked(charactersApi.listCharacters).mockResolvedValue(mockCharacters);
      vi.mocked(charactersApi.updateCharacter).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ...mockCharacters[0],
                  displayName: "Updated",
                }),
              100
            )
          )
      );

      const { result } = renderHook(() => useCharacters(projectId), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.characters).toEqual(mockCharacters);
      });

      // Start the update but don't await
      const updatePromise = result.current.updateCharacter("char-1", {
        displayName: "Updated",
      });

      // Wait for loading state to be set
      await waitFor(() => {
        expect(result.current.isUpdatingCharacter).toBe(true);
      });

      await updatePromise;

      await waitFor(() => {
        expect(result.current.isUpdatingCharacter).toBe(false);
      });
    });

    it("should show error toast on update failure", async () => {
      vi.mocked(charactersApi.listCharacters).mockResolvedValue(mockCharacters);
      const error = new Error("Update failed");
      vi.mocked(charactersApi.updateCharacter).mockRejectedValue(error);

      const { result } = renderHook(() => useCharacters(projectId), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.characters).toEqual(mockCharacters);
      });

      await expect(
        result.current.updateCharacter("char-1", { displayName: "Updated" })
      ).rejects.toThrow("Update failed");

      // Verify toast error was called
      expect(mockToastError).toHaveBeenCalledWith(
        "Failed to update character: Update failed",
        "Error"
      );
      expect(mockToastSuccess).not.toHaveBeenCalled();
    });
  });

  describe("Delete Mutation", () => {
    it("should delete character and invalidate cache", async () => {
      vi.mocked(charactersApi.listCharacters).mockResolvedValue(mockCharacters);
      vi.mocked(charactersApi.deleteCharacter).mockResolvedValue(undefined);

      const { result } = renderHook(() => useCharacters(projectId), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.characters).toEqual(mockCharacters);
      });

      await result.current.deleteCharacter("char-1");

      expect(charactersApi.deleteCharacter).toHaveBeenCalledWith("char-1");

      // Verify cache was invalidated
      await waitFor(() => {
        expect(charactersApi.listCharacters).toHaveBeenCalledTimes(2);
      });

      // Verify toast success was called
      expect(mockToastSuccess).toHaveBeenCalledWith(
        "Character deleted successfully",
        "Success"
      );
      expect(mockToastError).not.toHaveBeenCalled();
    });

    it("should show loading state during delete", async () => {
      vi.mocked(charactersApi.listCharacters).mockResolvedValue(mockCharacters);
      vi.mocked(charactersApi.deleteCharacter).mockImplementation(
        () =>
          new Promise((resolve) => setTimeout(() => resolve(undefined), 100))
      );

      const { result } = renderHook(() => useCharacters(projectId), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.characters).toEqual(mockCharacters);
      });

      // Start the delete but don't await
      const deletePromise = result.current.deleteCharacter("char-1");

      // Wait for loading state to be set
      await waitFor(() => {
        expect(result.current.isDeletingCharacter).toBe(true);
      });

      await deletePromise;

      await waitFor(() => {
        expect(result.current.isDeletingCharacter).toBe(false);
      });
    });

    it("should show error toast on delete failure", async () => {
      vi.mocked(charactersApi.listCharacters).mockResolvedValue(mockCharacters);
      const error = new Error("Delete failed");
      vi.mocked(charactersApi.deleteCharacter).mockRejectedValue(error);

      const { result } = renderHook(() => useCharacters(projectId), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.characters).toEqual(mockCharacters);
      });

      await expect(result.current.deleteCharacter("char-1")).rejects.toThrow(
        "Delete failed"
      );

      // Verify toast error was called
      expect(mockToastError).toHaveBeenCalledWith(
        "Failed to delete character: Delete failed",
        "Error"
      );
      expect(mockToastSuccess).not.toHaveBeenCalled();
    });
  });

  describe("Refresh", () => {
    it("should refresh characters list", async () => {
      vi.mocked(charactersApi.listCharacters)
        .mockResolvedValueOnce(mockCharacters)
        .mockResolvedValueOnce([
          ...mockCharacters,
          {
            id: "char-3",
            projectId: "test-project-id",
            name: "New",
            displayName: "New",
            renpyTag: "new",
            color: "#123456",
            routeAffiliation: null,
            isLoveInterest: false,
            dialogueStyle: null,
            conditionalPrefix: null,
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z",
          },
        ]);

      const { result } = renderHook(() => useCharacters(projectId), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.characters).toEqual(mockCharacters);
      });

      result.current.refreshCharacters();

      await waitFor(() => {
        expect(result.current.characters).toHaveLength(3);
      });

      expect(charactersApi.listCharacters).toHaveBeenCalledTimes(2);
    });
  });
});
