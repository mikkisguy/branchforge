/**
 * useGitLabFiles Hook Tests
 *
 * Tests for the useGitLabFiles hook which manages GitLab files.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { useGitLabFiles, type GitLabFileNode } from "../useGitLabFiles";
import { gitlabApi } from "@/lib/api/gitlab";
import { createTestQueryClient } from "@/test/query-client";

// Mock the gitlab API
vi.mock("@/lib/api/gitlab", () => ({
  gitlabApi: {
    getGitLabFiles: vi.fn(),
    updateGitLabFile: vi.fn(),
  },
}));

const mockFiles: GitLabFileNode[] = [
  {
    id: "file-1",
    projectId: "project-1",
    filePath: "script/scenes/scene1.rpy",
    fileType: "STORY",
    content: "label scene1:",
    lastSyncedAt: "2024-01-01T00:00:00.000Z",
    lastCommitSha: "abc123",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    scenes: [],
  },
];

describe("useGitLabFiles", () => {
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
    it("should fetch files when projectId is provided", async () => {
      vi.mocked(gitlabApi.getGitLabFiles).mockResolvedValue(mockFiles);

      const { result } = renderHook(() => useGitLabFiles("project-1"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.files).toHaveLength(1);
      });

      expect(gitlabApi.getGitLabFiles).toHaveBeenCalledWith("project-1");
    });

    it("should not fetch files when projectId is undefined", async () => {
      const { result } = renderHook(() => useGitLabFiles(undefined), {
        wrapper,
      });

      await waitFor(() => {
        expect(gitlabApi.getGitLabFiles).not.toHaveBeenCalled();
        expect(result.current.files).toEqual([]);
      });
    });

    it("should show loading state during fetch", async () => {
      vi.mocked(gitlabApi.getGitLabFiles).mockImplementation(
        () =>
          new Promise((resolve) => setTimeout(() => resolve(mockFiles), 100))
      );

      const { result } = renderHook(() => useGitLabFiles("project-1"), {
        wrapper,
      });

      expect(result.current.isLoadingFiles).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoadingFiles).toBe(false);
      });
    });

    it("should handle API errors", async () => {
      const error = new Error("Failed to fetch");
      vi.mocked(gitlabApi.getGitLabFiles).mockRejectedValue(error);

      const { result } = renderHook(() => useGitLabFiles("project-1"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoadingFiles).toBe(false);
      });

      expect(result.current.filesError).toEqual(error);
    });
  });

  describe("Update File Mutation", () => {
    it("should update file content and invalidate cache", async () => {
      vi.mocked(gitlabApi.getGitLabFiles).mockResolvedValue(mockFiles);
      vi.mocked(gitlabApi.updateGitLabFile).mockResolvedValue({
        success: true,
      });

      const { result } = renderHook(() => useGitLabFiles("project-1"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.files).toHaveLength(1);
      });

      await result.current.updateFileContent("file-1", "new content");

      expect(gitlabApi.updateGitLabFile).toHaveBeenCalledWith(
        "file-1",
        "new content"
      );

      // Verify cache was invalidated
      await waitFor(() => {
        expect(gitlabApi.getGitLabFiles).toHaveBeenCalledTimes(2);
      });
    });

    it("should show loading state during update", async () => {
      vi.mocked(gitlabApi.getGitLabFiles).mockResolvedValue(mockFiles);
      vi.mocked(gitlabApi.updateGitLabFile).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ success: true }), 100)
          )
      );

      const { result } = renderHook(() => useGitLabFiles("project-1"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.files).toHaveLength(1);
      });

      const updatePromise = result.current.updateFileContent(
        "file-1",
        "new content"
      );

      await waitFor(() => {
        expect(result.current.isUpdatingFile).toBe(true);
      });

      await updatePromise;

      await waitFor(() => {
        expect(result.current.isUpdatingFile).toBe(false);
      });
    });

    it("should handle update errors", async () => {
      vi.mocked(gitlabApi.getGitLabFiles).mockResolvedValue(mockFiles);
      const error = new Error("Update failed");
      vi.mocked(gitlabApi.updateGitLabFile).mockRejectedValue(error);

      const { result } = renderHook(() => useGitLabFiles("project-1"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.files).toHaveLength(1);
      });

      await expect(
        result.current.updateFileContent("file-1", "new content")
      ).rejects.toThrow("Update failed");
    });
  });

  describe("Refresh", () => {
    it("should refresh files list", async () => {
      vi.mocked(gitlabApi.getGitLabFiles)
        .mockResolvedValueOnce(mockFiles)
        .mockResolvedValueOnce([
          ...mockFiles,
          {
            id: "file-2",
            projectId: "project-1",
            filePath: "script/scenes/scene2.rpy",
            fileType: "STORY",
            content: "label scene2:",
            lastSyncedAt: "2024-01-01T00:00:00.000Z",
            lastCommitSha: "abc123",
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z",
            scenes: [],
          },
        ]);

      const { result } = renderHook(() => useGitLabFiles("project-1"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.files).toHaveLength(1);
      });

      result.current.refreshFiles();

      await waitFor(() => {
        expect(result.current.files).toHaveLength(2);
      });

      expect(gitlabApi.getGitLabFiles).toHaveBeenCalledTimes(2);
    });
  });
});
