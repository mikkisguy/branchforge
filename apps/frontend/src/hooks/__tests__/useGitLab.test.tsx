/**
 * useGitLab Hook Tests
 *
 * Tests for the useGitLab hook which manages GitLab integration.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { useGitLab } from "../useGitLab";
import { gitlabApi, type GitLabRepository } from "@/lib/api/gitlab";
import { createTestQueryClient } from "@/test/query-client";

// Mock the gitlab API
vi.mock("@/lib/api/gitlab", () => ({
  gitlabApi: {
    getIntegration: vi.fn(),
    storeIntegration: vi.fn(),
    deleteIntegration: vi.fn(),
    getLinkedRepositories: vi.fn(),
    validateToken: vi.fn(),
    getRepositories: vi.fn(),
    getOperationStatus: vi.fn(),
    exportToGitlab: vi.fn(),
    importFromGitlab: vi.fn(),
    listOperations: vi.fn(),
  },
}));

// Import types for type safety

const mockIntegration = {
  id: "integration-1",
  username: "testuser",
  gitlabUrl: "https://gitlab.example.com",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

const mockLinkedRepositories = [
  {
    id: "repo-1",
    projectId: "project-1",
    gitlabProjectId: 123,
    repositoryName: "test-repo",
    gitlabUrl: "https://gitlab.example.com/test/repo",
    defaultBranch: "main",
    lastSyncedAt: "2024-01-01T00:00:00.000Z",
    createdAt: "2024-01-01T00:00:00.000Z",
  },
];

const mockRepositories: GitLabRepository[] = [
  {
    id: 1,
    name: "test-repo",
    path_with_namespace: "test/repo",
    web_url: "https://gitlab.example.com/test/repo",
  },
];

describe("useGitLab", () => {
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

  describe("Integration Query", () => {
    it("should fetch integration status on mount", async () => {
      vi.mocked(gitlabApi.getIntegration).mockResolvedValue(mockIntegration);
      vi.mocked(gitlabApi.getLinkedRepositories).mockResolvedValue([]);

      const { result } = renderHook(() => useGitLab(), { wrapper });

      await waitFor(() => {
        expect(result.current.integration).toEqual(mockIntegration);
      });

      expect(result.current.hasIntegration).toBe(true);
      expect(gitlabApi.getIntegration).toHaveBeenCalledOnce();
    });

    it("should return null when no integration exists", async () => {
      vi.mocked(gitlabApi.getIntegration).mockResolvedValue(null);

      const { result } = renderHook(() => useGitLab(), { wrapper });

      await waitFor(() => {
        expect(result.current.integration).toBeNull();
      });

      expect(result.current.hasIntegration).toBe(false);
    });

    it("should show loading state during fetch", async () => {
      vi.mocked(gitlabApi.getIntegration).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(mockIntegration), 100)
          )
      );
      vi.mocked(gitlabApi.getLinkedRepositories).mockResolvedValue([]);

      const { result } = renderHook(() => useGitLab(), { wrapper });

      expect(result.current.isLoadingIntegration).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoadingIntegration).toBe(false);
      });
    });

    it("should handle API errors", async () => {
      const error = new Error("Failed to fetch integration");
      vi.mocked(gitlabApi.getIntegration).mockRejectedValue(error);

      const { result } = renderHook(() => useGitLab(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingIntegration).toBe(false);
      });

      expect(result.current.integrationError).toEqual(error);
    });

    it("should not retry on fetch failures", async () => {
      const error = new Error("Failed to fetch");
      vi.mocked(gitlabApi.getIntegration).mockRejectedValue(error);

      const { result } = renderHook(() => useGitLab(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingIntegration).toBe(false);
      });

      expect(gitlabApi.getIntegration).toHaveBeenCalledTimes(1);
    });
  });

  describe("Conditional Linked Repositories Query", () => {
    it("should fetch linked repositories when integration exists", async () => {
      vi.mocked(gitlabApi.getIntegration).mockResolvedValue(mockIntegration);
      vi.mocked(gitlabApi.getLinkedRepositories).mockResolvedValue(
        mockLinkedRepositories
      );

      const { result } = renderHook(() => useGitLab(), { wrapper });

      await waitFor(() => {
        expect(result.current.linkedRepositories.size).toBe(1);
      });

      expect(gitlabApi.getLinkedRepositories).toHaveBeenCalledOnce();
    });

    it("should not fetch linked repositories when no integration", async () => {
      vi.mocked(gitlabApi.getIntegration).mockResolvedValue(null);
      vi.mocked(gitlabApi.getLinkedRepositories).mockResolvedValue([]);

      const { result } = renderHook(() => useGitLab(), { wrapper });

      await waitFor(() => {
        expect(result.current.integration).toBeNull();
      });

      expect(gitlabApi.getLinkedRepositories).not.toHaveBeenCalled();
      expect(result.current.linkedRepositories.size).toBe(0);
    });

    it("should provide map for efficient repository lookups", async () => {
      vi.mocked(gitlabApi.getIntegration).mockResolvedValue(mockIntegration);
      vi.mocked(gitlabApi.getLinkedRepositories).mockResolvedValue(
        mockLinkedRepositories
      );

      const { result } = renderHook(() => useGitLab(), { wrapper });

      await waitFor(() => {
        expect(result.current.linkedRepositories.size).toBe(1);
      });

      const repo = result.current.getLinkedRepository("project-1");
      expect(repo).toEqual(mockLinkedRepositories[0]);
    });

    it("should return undefined for non-existent project", async () => {
      vi.mocked(gitlabApi.getIntegration).mockResolvedValue(mockIntegration);
      vi.mocked(gitlabApi.getLinkedRepositories).mockResolvedValue(
        mockLinkedRepositories
      );

      const { result } = renderHook(() => useGitLab(), { wrapper });

      await waitFor(() => {
        expect(result.current.linkedRepositories.size).toBe(1);
      });

      const repo = result.current.getLinkedRepository("non-existent");
      expect(repo).toBeUndefined();
    });

    it("should check if project is linked", async () => {
      vi.mocked(gitlabApi.getIntegration).mockResolvedValue(mockIntegration);
      vi.mocked(gitlabApi.getLinkedRepositories).mockResolvedValue(
        mockLinkedRepositories
      );

      const { result } = renderHook(() => useGitLab(), { wrapper });

      await waitFor(() => {
        expect(result.current.linkedRepositories.size).toBe(1);
      });

      expect(result.current.isProjectLinked("project-1")).toBe(true);
      expect(result.current.isProjectLinked("other-project")).toBe(false);
    });
  });

  describe("Store Token Mutation", () => {
    it("should store token and invalidate queries", async () => {
      vi.mocked(gitlabApi.getIntegration).mockResolvedValue(null);
      vi.mocked(gitlabApi.storeIntegration).mockResolvedValue(undefined);

      const { result } = renderHook(() => useGitLab(), { wrapper });

      await waitFor(() => {
        expect(result.current.integration).toBeNull();
      });

      await result.current.storeToken(
        "test-token",
        "https://gitlab.example.com"
      );

      expect(gitlabApi.storeIntegration).toHaveBeenCalledWith(
        "test-token",
        "https://gitlab.example.com"
      );

      // Should invalidate integration query
      await waitFor(() => {
        expect(gitlabApi.getIntegration).toHaveBeenCalledTimes(2);
      });
    });

    it("should store token without gitlabUrl", async () => {
      vi.mocked(gitlabApi.getIntegration).mockResolvedValue(null);
      vi.mocked(gitlabApi.storeIntegration).mockResolvedValue(undefined);

      const { result } = renderHook(() => useGitLab(), { wrapper });

      await waitFor(() => {
        expect(result.current.integration).toBeNull();
      });

      await result.current.storeToken("test-token");

      expect(gitlabApi.storeIntegration).toHaveBeenCalledWith(
        "test-token",
        undefined
      );
    });
  });

  describe("Remove Integration Mutation", () => {
    it("should remove integration and clear cache", async () => {
      vi.mocked(gitlabApi.getIntegration).mockResolvedValue(mockIntegration);
      vi.mocked(gitlabApi.getLinkedRepositories).mockResolvedValue(
        mockLinkedRepositories
      );
      vi.mocked(gitlabApi.deleteIntegration).mockResolvedValue(undefined);

      const { result } = renderHook(() => useGitLab(), { wrapper });

      await waitFor(() => {
        expect(result.current.hasIntegration).toBe(true);
      });

      await result.current.removeIntegration();

      expect(gitlabApi.deleteIntegration).toHaveBeenCalledOnce();

      // Integration should be cleared from cache
      await waitFor(() => {
        expect(result.current.integration).toBeNull();
        expect(result.current.hasIntegration).toBe(false);
      });
    });
  });

  describe("Validate Token", () => {
    it("should validate token directly without mutation", async () => {
      vi.mocked(gitlabApi.validateToken).mockResolvedValue({
        valid: true,
        username: "testuser",
      });

      const { result } = renderHook(() => useGitLab(), { wrapper });

      const validation = await result.current.validateToken("test-token");

      expect(gitlabApi.validateToken).toHaveBeenCalledWith(
        "test-token",
        undefined
      );
      expect(validation).toEqual({
        valid: true,
        username: "testuser",
      });
    });

    it("should validate token with custom GitLab URL", async () => {
      vi.mocked(gitlabApi.validateToken).mockResolvedValue({
        valid: true,
        username: "testuser",
      });

      const { result } = renderHook(() => useGitLab(), { wrapper });

      await result.current.validateToken(
        "test-token",
        "https://custom.gitlab.com"
      );

      expect(gitlabApi.validateToken).toHaveBeenCalledWith(
        "test-token",
        "https://custom.gitlab.com"
      );
    });

    it("should return invalid for bad token", async () => {
      vi.mocked(gitlabApi.validateToken).mockResolvedValue({
        valid: false,
      });

      const { result } = renderHook(() => useGitLab(), { wrapper });

      const validation = await result.current.validateToken("bad-token");

      expect(validation.valid).toBe(false);
      expect(validation.username).toBeUndefined();
    });
  });

  describe("List Repositories", () => {
    it("should list repositories directly without mutation", async () => {
      vi.mocked(gitlabApi.getRepositories).mockResolvedValue(mockRepositories);

      const { result } = renderHook(() => useGitLab(), { wrapper });

      const repos = await result.current.listRepositories();

      expect(gitlabApi.getRepositories).toHaveBeenCalledOnce();
      expect(repos).toEqual(mockRepositories);
    });

    it("should handle empty repository list", async () => {
      vi.mocked(gitlabApi.getRepositories).mockResolvedValue([]);

      const { result } = renderHook(() => useGitLab(), { wrapper });

      const repos = await result.current.listRepositories();

      expect(repos).toEqual([]);
    });
  });

  describe("Refresh Integration", () => {
    it("should refetch integration status", async () => {
      vi.mocked(gitlabApi.getIntegration)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockIntegration);

      const { result } = renderHook(() => useGitLab(), { wrapper });

      await waitFor(() => {
        expect(result.current.integration).toBeNull();
      });

      await result.current.refreshIntegration();

      await waitFor(() => {
        expect(result.current.integration).toEqual(mockIntegration);
      });

      expect(gitlabApi.getIntegration).toHaveBeenCalledTimes(2);
    });
  });

  describe("Loading State", () => {
    it("should be loading while fetching integration", async () => {
      vi.mocked(gitlabApi.getIntegration).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(mockIntegration), 100)
          )
      );
      vi.mocked(gitlabApi.getLinkedRepositories).mockResolvedValue([]);

      const { result } = renderHook(() => useGitLab(), { wrapper });

      expect(result.current.isLoadingIntegration).toBe(true);
    });

    it("should be loading while fetching repositories", async () => {
      vi.mocked(gitlabApi.getIntegration).mockResolvedValue(mockIntegration);
      vi.mocked(gitlabApi.getLinkedRepositories).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(mockLinkedRepositories), 100)
          )
      );

      const { result } = renderHook(() => useGitLab(), { wrapper });

      await waitFor(() => {
        expect(result.current.integration).toEqual(mockIntegration);
      });

      // Should still be loading while fetching repositories
      expect(result.current.isLoadingIntegration).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoadingIntegration).toBe(false);
      });
    });

    it("should not be loading when both integration and repos are loaded", async () => {
      vi.mocked(gitlabApi.getIntegration).mockResolvedValue(mockIntegration);
      vi.mocked(gitlabApi.getLinkedRepositories).mockResolvedValue([]);

      const { result } = renderHook(() => useGitLab(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingIntegration).toBe(false);
      });

      expect(result.current.integration).toEqual(mockIntegration);
      expect(result.current.linkedRepositories.size).toBe(0);
    });
  });

  describe("Refresh Integration", () => {
    it("should refetch integration status", async () => {
      vi.mocked(gitlabApi.getIntegration)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockIntegration);
      vi.mocked(gitlabApi.getLinkedRepositories).mockResolvedValue([]);

      const { result } = renderHook(() => useGitLab(), { wrapper });

      await waitFor(() => {
        expect(result.current.integration).toBeNull();
      });

      await result.current.refreshIntegration();

      await waitFor(() => {
        expect(result.current.integration).toEqual(mockIntegration);
      });

      expect(gitlabApi.getIntegration).toHaveBeenCalledTimes(2);
    });
  });
});
