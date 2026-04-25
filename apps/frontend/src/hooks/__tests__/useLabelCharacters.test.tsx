/**
 * useLabelCharacters Hook Tests
 *
 * Tests for the useLabelCharacters hook which manages label-character associations.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import {
  useLabelCharacters,
  useAddCharacterToLabel,
  useUpdateCharacterInLabel,
  useRemoveCharacterFromLabel,
} from "../useLabelCharacters";
import { labelsApi } from "@/lib/api/labels";
import type { LabelCharacter } from "@branchforge/shared";
import { createTestQueryClient } from "@/test/query-client";

// Mock the labels API
vi.mock("@/lib/api/labels", () => ({
  labelsApi: {
    getLabelCharacters: vi.fn(),
    addCharacterToLabel: vi.fn(),
    updateCharacterInLabel: vi.fn(),
    removeCharacterFromLabel: vi.fn(),
  },
}));

const mockLabelCharacters: LabelCharacter[] = [
  {
    id: "char-1",
    name: "protagonist",
    displayName: "Protagonist",
    renpyTag: "p",
    notes: "Main character",
  },
  {
    id: "char-2",
    name: "antagonist",
    displayName: "Antagonist",
    renpyTag: "a",
    notes: "Villain",
  },
];

describe("useLabelCharacters", () => {
  let queryClient: QueryClient;
  const labelId = "test-label-id";

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

  describe("useLabelCharacters", () => {
    it("should fetch label characters on mount", async () => {
      vi.mocked(labelsApi.getLabelCharacters).mockResolvedValue(
        mockLabelCharacters
      );

      const { result } = renderHook(() => useLabelCharacters(labelId), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.data).toEqual(mockLabelCharacters);
      });

      expect(labelsApi.getLabelCharacters).toHaveBeenCalledWith(labelId);
    });

    it("should not fetch when labelId is empty", async () => {
      const { result } = renderHook(() => useLabelCharacters(""), {
        wrapper,
      });

      expect(result.current.data).toBeUndefined();
      expect(labelsApi.getLabelCharacters).not.toHaveBeenCalled();
    });

    it("should handle loading state", async () => {
      vi.mocked(labelsApi.getLabelCharacters).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      const { result } = renderHook(() => useLabelCharacters(labelId), {
        wrapper,
      });

      expect(result.current.isLoading).toBe(true);
    });

    it("should handle error state", async () => {
      vi.mocked(labelsApi.getLabelCharacters).mockRejectedValue(
        new Error("Failed to fetch")
      );

      const { result } = renderHook(() => useLabelCharacters(labelId), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
    });
  });

  describe("useAddCharacterToLabel", () => {
    it("should add character to label successfully", async () => {
      const newCharacter: LabelCharacter = {
        id: "char-3",
        name: "mentor",
        displayName: "Mentor",
        renpyTag: "m",
        notes: "Teacher figure",
      };

      vi.mocked(labelsApi.addCharacterToLabel).mockResolvedValue(newCharacter);

      const { result } = renderHook(() => useAddCharacterToLabel(), {
        wrapper,
      });

      result.current.mutate({
        labelId,
        data: {
          characterId: "char-3",
          notes: "Teacher figure",
        },
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(labelsApi.addCharacterToLabel).toHaveBeenCalledWith(labelId, {
        characterId: "char-3",
        notes: "Teacher figure",
      });
    });

    it("should invalidate related queries on success", async () => {
      const newCharacter: LabelCharacter = {
        id: "char-3",
        name: "mentor",
        displayName: "Mentor",
        renpyTag: "m",
        notes: null,
      };

      vi.mocked(labelsApi.addCharacterToLabel).mockResolvedValue(newCharacter);

      // Spy on invalidateQueries
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      // Pre-populate cache
      const initialData = [mockLabelCharacters[0]];
      queryClient.setQueryData(["labels", labelId, "characters"], initialData);

      const { result } = renderHook(() => useAddCharacterToLabel(), {
        wrapper,
      });

      result.current.mutate({
        labelId,
        data: {
          characterId: "char-3",
        },
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Verify query invalidation was called
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["labels", labelId, "characters"],
      });
      // Data should still exist (invalidateQueries marks stale but doesn't remove)
      expect(
        queryClient.getQueryData(["labels", labelId, "characters"])
      ).toEqual(initialData);
    });

    it("should handle errors", async () => {
      vi.mocked(labelsApi.addCharacterToLabel).mockRejectedValue(
        new Error("Failed to add character")
      );

      const { result } = renderHook(() => useAddCharacterToLabel(), {
        wrapper,
      });

      result.current.mutate({
        labelId,
        data: {
          characterId: "char-3",
        },
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
    });
  });

  describe("useUpdateCharacterInLabel", () => {
    it("should update character in label successfully", async () => {
      const updatedCharacter: LabelCharacter = {
        id: "char-1",
        name: "protagonist",
        displayName: "Protagonist",
        renpyTag: "p",
        notes: "Updated notes",
      };

      vi.mocked(labelsApi.updateCharacterInLabel).mockResolvedValue(
        updatedCharacter
      );

      const { result } = renderHook(() => useUpdateCharacterInLabel(), {
        wrapper,
      });

      result.current.mutate({
        labelId,
        characterId: "char-1",
        data: {
          notes: "Updated notes",
        },
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(labelsApi.updateCharacterInLabel).toHaveBeenCalledWith(
        labelId,
        "char-1",
        {
          notes: "Updated notes",
        }
      );
    });

    it("should invalidate related queries on success", async () => {
      const updatedCharacter: LabelCharacter = {
        id: "char-1",
        name: "protagonist",
        displayName: "Protagonist",
        renpyTag: "p",
        notes: null,
      };

      vi.mocked(labelsApi.updateCharacterInLabel).mockResolvedValue(
        updatedCharacter
      );

      // Spy on invalidateQueries
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      // Pre-populate cache
      const dummyData = mockLabelCharacters;
      queryClient.setQueryData(["labels", labelId, "characters"], dummyData);

      const { result } = renderHook(() => useUpdateCharacterInLabel(), {
        wrapper,
      });

      result.current.mutate({
        labelId,
        characterId: "char-1",
        data: {
          notes: null,
        },
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Verify query invalidation was called
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["labels", labelId, "characters"],
      });
      // Data should still exist (invalidateQueries marks stale but doesn't remove)
      expect(
        queryClient.getQueryData(["labels", labelId, "characters"])
      ).toEqual(dummyData);
    });

    it("should handle errors", async () => {
      vi.mocked(labelsApi.updateCharacterInLabel).mockRejectedValue(
        new Error("Failed to update character")
      );

      const { result } = renderHook(() => useUpdateCharacterInLabel(), {
        wrapper,
      });

      result.current.mutate({
        labelId,
        characterId: "char-1",
        data: {
          notes: "test",
        },
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
    });
  });

  describe("useRemoveCharacterFromLabel", () => {
    it("should remove character from label successfully", async () => {
      vi.mocked(labelsApi.removeCharacterFromLabel).mockResolvedValue(
        undefined
      );

      const { result } = renderHook(() => useRemoveCharacterFromLabel(), {
        wrapper,
      });

      result.current.mutate({
        labelId,
        characterId: "char-1",
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(labelsApi.removeCharacterFromLabel).toHaveBeenCalledWith(
        labelId,
        "char-1"
      );
    });

    it("should invalidate related queries on success", async () => {
      vi.mocked(labelsApi.removeCharacterFromLabel).mockResolvedValue(
        undefined
      );

      // Spy on invalidateQueries
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      // Pre-populate cache
      const initialData = mockLabelCharacters;
      queryClient.setQueryData(["labels", labelId, "characters"], initialData);

      const { result } = renderHook(() => useRemoveCharacterFromLabel(), {
        wrapper,
      });

      result.current.mutate({
        labelId,
        characterId: "char-1",
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Verify query invalidation was called
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["labels", labelId, "characters"],
      });
      // Data should still exist (invalidateQueries marks stale but doesn't remove)
      expect(
        queryClient.getQueryData(["labels", labelId, "characters"])
      ).toEqual(initialData);
    });

    it("should handle errors", async () => {
      vi.mocked(labelsApi.removeCharacterFromLabel).mockRejectedValue(
        new Error("Failed to remove character")
      );

      const { result } = renderHook(() => useRemoveCharacterFromLabel(), {
        wrapper,
      });

      result.current.mutate({
        labelId,
        characterId: "char-1",
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
    });
  });
});
