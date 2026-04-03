/**
 * useGitLabSync Hook Tests
 *
 * Tests for the useGitLabSync hook which manages GitLab sync operations with polling.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { useGitLabSync } from "../useGitLabSync";
import { gitlabApi } from "@/lib/api/gitlab";
import type { SyncOperation, ConflictResolution } from "@/lib/api/gitlab";
import { characterKeys, labelKeys } from "@/lib/query-keys";
import { createTestQueryClient } from "@/test/query-client";

// Mock the gitlab API
vi.mock("@/lib/api/gitlab", () => ({
  gitlabApi: {
    getIntegration: vi.fn(),
    exportToGitlab: vi.fn(),
    importFromGitlab: vi.fn(),
    getOperationStatus: vi.fn(),
    listOperations: vi.fn(),
  },
}));

const mockPendingOperation: SyncOperation = {
  id: "op-1",
  projectId: "project-1",
  operation: "EXPORT",
  status: "PENDING",
  branch: null,
  conflictCount: 0,
  errorMessage: null,
  startedAt: "2024-01-01T00:00:00.000Z",
  completedAt: null,
};

const mockInProgressOperation: SyncOperation = {
  id: "op-2",
  projectId: "project-1",
  operation: "EXPORT",
  status: "IN_PROGRESS",
  branch: null,
  conflictCount: 0,
  errorMessage: null,
  startedAt: "2024-01-01T00:00:00.000Z",
  completedAt: null,
};

const mockCompletedOperation: SyncOperation = {
  id: "op-3",
  projectId: "project-1",
  operation: "EXPORT",
  status: "COMPLETED",
  branch: null,
  conflictCount: 0,
  errorMessage: null,
  startedAt: "2024-01-01T00:00:00.000Z",
  completedAt: "2024-01-01T00:00:01.000Z",
};

const mockFailedOperation: SyncOperation = {
  id: "op-4",
  projectId: "project-1",
  operation: "EXPORT",
  status: "FAILED",
  branch: null,
  conflictCount: 0,
  errorMessage: "Sync failed",
  startedAt: "2024-01-01T00:00:00.000Z",
  completedAt: "2024-01-01T00:00:01.000Z",
};

describe("useGitLabSync", () => {
  let queryClient: QueryClient;
  const originalConsoleError = console.error;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = createTestQueryClient();
    consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation((...args) => {
        if (
          typeof args[0] === "string" &&
          args[0].includes("An update to") &&
          args[0].includes("was not wrapped in act")
        ) {
          return;
        }
        originalConsoleError.call(console, ...args);
      });
    vi.clearAllMocks();
    vi.useRealTimers(); // Use real timers for these tests
  });

  afterEach(() => {
    queryClient.clear();
    consoleErrorSpy.mockRestore();
    vi.restoreAllMocks();
  });

  describe("Initial State", () => {
    it("should start with idle state", () => {
      const { result } = renderHook(() => useGitLabSync(), { wrapper });

      expect(result.current.state).toEqual({
        operation: null,
        isProcessing: false,
        progress: 0,
        error: null,
      });
    });
  });

  describe("Export to GitLab", () => {
    it("should start export operation and set processing state", async () => {
      vi.mocked(gitlabApi.exportToGitlab).mockResolvedValue(
        mockPendingOperation
      );

      // First call returns pending, then returns completed
      let callCount = 0;
      vi.mocked(gitlabApi.getOperationStatus).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return mockPendingOperation;
        return mockCompletedOperation;
      });

      const { result } = renderHook(() => useGitLabSync(), { wrapper });

      const exportPromise = result.current.exportToGitlab(
        "project-1",
        "main",
        "Test commit"
      );

      // Should set processing state immediately
      await waitFor(() => {
        expect(result.current.state.isProcessing).toBe(true);
        expect(result.current.state.progress).toBe(10);
        expect(result.current.state.error).toBeNull();
      });

      // Wait for operation to complete
      await exportPromise;

      expect(gitlabApi.exportToGitlab).toHaveBeenCalledWith(
        "project-1",
        "main",
        "Test commit"
      );
    });

    it("should complete export operation successfully", async () => {
      vi.mocked(gitlabApi.exportToGitlab).mockResolvedValue(
        mockPendingOperation
      );

      // Mock status transitions: PENDING -> IN_PROGRESS -> COMPLETED
      let callCount = 0;
      vi.mocked(gitlabApi.getOperationStatus).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return mockPendingOperation;
        if (callCount === 2) return mockInProgressOperation;
        return mockCompletedOperation;
      });

      const { result } = renderHook(() => useGitLabSync(), { wrapper });

      await result.current.exportToGitlab("project-1");

      // Wait for polling to complete
      await waitFor(
        () => {
          expect(result.current.state.isProcessing).toBe(false);
        },
        { timeout: 5000 }
      );

      expect(result.current.state.operation?.status).toBe("COMPLETED");
      expect(result.current.state.progress).toBe(100);
      expect(result.current.state.error).toBeNull();
    });

    it("should handle export errors", async () => {
      const error = new Error("Export failed");
      vi.mocked(gitlabApi.exportToGitlab).mockRejectedValue(error);

      const { result } = renderHook(() => useGitLabSync(), { wrapper });

      const exportResult = await result.current.exportToGitlab("project-1");

      expect(exportResult).toBeNull();

      // Wait for error state to be set
      await waitFor(() => {
        expect(result.current.state.isProcessing).toBe(false);
        expect(result.current.state.error).toBe("Export failed");
        expect(result.current.state.progress).toBe(0);
      });
    });

    it("should export with optional branch and commit message", async () => {
      vi.mocked(gitlabApi.exportToGitlab).mockResolvedValue(
        mockCompletedOperation
      );
      vi.mocked(gitlabApi.getOperationStatus).mockResolvedValue(
        mockCompletedOperation
      );

      const { result } = renderHook(() => useGitLabSync(), { wrapper });

      await result.current.exportToGitlab(
        "project-1",
        "custom-branch",
        "Custom commit"
      );

      expect(gitlabApi.exportToGitlab).toHaveBeenCalledWith(
        "project-1",
        "custom-branch",
        "Custom commit"
      );
    });

    it("should export without optional parameters", async () => {
      vi.mocked(gitlabApi.exportToGitlab).mockResolvedValue(
        mockCompletedOperation
      );
      vi.mocked(gitlabApi.getOperationStatus).mockResolvedValue(
        mockCompletedOperation
      );

      const { result } = renderHook(() => useGitLabSync(), { wrapper });

      await result.current.exportToGitlab("project-1");

      expect(gitlabApi.exportToGitlab).toHaveBeenCalledWith(
        "project-1",
        undefined,
        undefined
      );
    });
  });

  describe("Import from GitLab", () => {
    it("should start import operation and set processing state", async () => {
      vi.mocked(gitlabApi.importFromGitlab).mockResolvedValue(
        mockPendingOperation
      );

      // First call returns pending, then returns completed
      let callCount = 0;
      vi.mocked(gitlabApi.getOperationStatus).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return mockPendingOperation;
        return mockCompletedOperation;
      });

      const { result } = renderHook(() => useGitLabSync(), { wrapper });

      const conflictResolution: ConflictResolution = "branchforge_wins";
      const importPromise = result.current.importFromGitlab(
        "project-1",
        "main",
        conflictResolution
      );

      // Should set processing state immediately
      await waitFor(() => {
        expect(result.current.state.isProcessing).toBe(true);
        expect(result.current.state.progress).toBe(10);
        expect(result.current.state.error).toBeNull();
      });

      await importPromise;

      expect(gitlabApi.importFromGitlab).toHaveBeenCalledWith(
        "project-1",
        "main",
        "branchforge_wins"
      );
    });

    it("should complete import operation successfully", async () => {
      vi.mocked(gitlabApi.importFromGitlab).mockResolvedValue(
        mockPendingOperation
      );

      // Mock status transitions
      let callCount = 0;
      vi.mocked(gitlabApi.getOperationStatus).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return mockPendingOperation;
        if (callCount === 2) return mockInProgressOperation;
        return mockCompletedOperation;
      });

      const { result } = renderHook(() => useGitLabSync(), { wrapper });

      await result.current.importFromGitlab(
        "project-1",
        "main",
        "branchforge_wins"
      );

      // Wait for polling to complete
      await waitFor(
        () => {
          expect(result.current.state.isProcessing).toBe(false);
        },
        { timeout: 5000 }
      );

      expect(result.current.state.operation?.status).toBe("COMPLETED");
      expect(result.current.state.progress).toBe(100);
    });

    it("should handle import errors", async () => {
      const error = new Error("Import failed");
      vi.mocked(gitlabApi.importFromGitlab).mockRejectedValue(error);

      const { result } = renderHook(() => useGitLabSync(), { wrapper });

      const importResult = await result.current.importFromGitlab(
        "project-1",
        "main",
        "branchforge_wins"
      );

      expect(importResult).toBeNull();

      // Wait for error state to be set
      await waitFor(() => {
        expect(result.current.state.isProcessing).toBe(false);
        expect(result.current.state.error).toBe("Import failed");
        expect(result.current.state.progress).toBe(0);
      });
    });
  });

  describe("Polling Behavior", () => {
    it("should poll for operation status updates", async () => {
      vi.mocked(gitlabApi.exportToGitlab).mockResolvedValue(
        mockPendingOperation
      );

      // Mock status transitions
      let callCount = 0;
      vi.mocked(gitlabApi.getOperationStatus).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return mockPendingOperation;
        if (callCount === 2) return mockInProgressOperation;
        return mockCompletedOperation;
      });

      const { result } = renderHook(() => useGitLabSync(), { wrapper });

      await result.current.exportToGitlab("project-1");

      // Wait for polling to complete
      await waitFor(
        () => {
          expect(result.current.state.isProcessing).toBe(false);
        },
        { timeout: 5000 }
      );

      // Should have called getOperationStatus 3 times: PENDING -> IN_PROGRESS -> COMPLETED
      expect(gitlabApi.getOperationStatus).toHaveBeenCalledTimes(3);
    });

    it("should stop polling when operation completes", async () => {
      vi.mocked(gitlabApi.exportToGitlab).mockResolvedValue(
        mockPendingOperation
      );

      // After first call, return completed
      let callCount = 0;
      vi.mocked(gitlabApi.getOperationStatus).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return mockPendingOperation;
        return mockCompletedOperation;
      });

      const { result } = renderHook(() => useGitLabSync(), { wrapper });

      await result.current.exportToGitlab("project-1");

      // Wait for completion
      await waitFor(
        () => {
          expect(result.current.state.isProcessing).toBe(false);
        },
        { timeout: 5000 }
      );

      const finalCallCount = callCount;

      // Wait a bit more and verify no more calls
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Call count should not have increased
      expect(callCount).toBe(finalCallCount);
    });

    it("should stop polling when operation fails", async () => {
      vi.mocked(gitlabApi.exportToGitlab).mockResolvedValue(
        mockPendingOperation
      );

      // After first call, return failed
      let callCount = 0;
      vi.mocked(gitlabApi.getOperationStatus).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return mockPendingOperation;
        return mockFailedOperation;
      });

      const { result } = renderHook(() => useGitLabSync(), { wrapper });

      await result.current.exportToGitlab("project-1");

      // Wait for failure
      await waitFor(
        () => {
          expect(result.current.state.isProcessing).toBe(false);
        },
        { timeout: 5000 }
      );

      const finalCallCount = callCount;

      // Wait a bit more and verify no more calls
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Call count should not have increased
      expect(callCount).toBe(finalCallCount);
    });
  });

  describe("Progress Calculation", () => {
    it("should show 10% progress when operation starts", async () => {
      vi.mocked(gitlabApi.exportToGitlab).mockResolvedValue(
        mockPendingOperation
      );
      // Mock status to transition from PENDING to COMPLETED
      let callCount = 0;
      vi.mocked(gitlabApi.getOperationStatus).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return mockPendingOperation;
        return mockCompletedOperation;
      });

      const { result } = renderHook(() => useGitLabSync(), { wrapper });

      const exportPromise = result.current.exportToGitlab("project-1");

      // Should show 10% progress while the operation is in PENDING state
      await waitFor(() => {
        expect(result.current.state.progress).toBe(10);
      });

      // Wait for the full operation to complete
      await exportPromise;
    });

    it("should show 100% progress when operation completes", async () => {
      vi.mocked(gitlabApi.exportToGitlab).mockResolvedValue(
        mockPendingOperation
      );

      // Mock status transitions
      let callCount = 0;
      vi.mocked(gitlabApi.getOperationStatus).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return mockPendingOperation;
        return mockCompletedOperation;
      });

      const { result } = renderHook(() => useGitLabSync(), { wrapper });

      await result.current.exportToGitlab("project-1");

      await waitFor(
        () => {
          expect(result.current.state.progress).toBe(100);
        },
        { timeout: 5000 }
      );
    });

    it("should show 0% progress when operation fails", async () => {
      vi.mocked(gitlabApi.exportToGitlab).mockResolvedValue(
        mockPendingOperation
      );

      // Mock status transitions
      let callCount = 0;
      vi.mocked(gitlabApi.getOperationStatus).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return mockPendingOperation;
        return mockFailedOperation;
      });

      const { result } = renderHook(() => useGitLabSync(), { wrapper });

      await result.current.exportToGitlab("project-1");

      await waitFor(
        () => {
          expect(result.current.state.progress).toBe(0);
        },
        { timeout: 5000 }
      );
    });
  });

  describe("Reset State", () => {
    it("should reset state to initial values", async () => {
      vi.mocked(gitlabApi.exportToGitlab).mockResolvedValue(
        mockCompletedOperation
      );
      vi.mocked(gitlabApi.getOperationStatus).mockResolvedValue(
        mockCompletedOperation
      );

      const { result } = renderHook(() => useGitLabSync(), { wrapper });

      await result.current.exportToGitlab("project-1");

      await waitFor(() => {
        expect(result.current.state.isProcessing).toBe(false);
      });

      // Reset the state
      result.current.reset();

      // Wait for state to update after reset
      await waitFor(() => {
        expect(result.current.state).toEqual({
          operation: null,
          isProcessing: false,
          progress: 0,
          error: null,
        });
      });
    });
  });

  describe("Get Operation Status", () => {
    it("should fetch operation status by ID", async () => {
      vi.mocked(gitlabApi.getOperationStatus).mockResolvedValue(
        mockCompletedOperation
      );

      const { result } = renderHook(() => useGitLabSync(), { wrapper });

      const status = await result.current.getOperationStatus("op-1");

      expect(status).toEqual(mockCompletedOperation);
      expect(gitlabApi.getOperationStatus).toHaveBeenCalledWith("op-1");
    });
  });

  describe("List Operations", () => {
    it("should list operations for a project", async () => {
      const mockOperations: SyncOperation[] = [
        mockPendingOperation,
        mockCompletedOperation,
      ];
      vi.mocked(gitlabApi.listOperations).mockResolvedValue(mockOperations);

      const { result } = renderHook(() => useGitLabSync(), { wrapper });

      const operations = await result.current.listOperations("project-1");

      expect(operations).toEqual(mockOperations);
      expect(gitlabApi.listOperations).toHaveBeenCalledWith("project-1");
    });
  });

  describe("Cache Invalidation", () => {
    it("should invalidate and refetch relevant queries on successful export", async () => {
      const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");
      const refetchQueriesSpy = vi.spyOn(queryClient, "refetchQueries");

      vi.mocked(gitlabApi.exportToGitlab).mockResolvedValue(
        mockPendingOperation
      );

      // Mock status transitions
      let callCount = 0;
      vi.mocked(gitlabApi.getOperationStatus).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return mockPendingOperation;
        return mockCompletedOperation;
      });

      const { result } = renderHook(() => useGitLabSync(), { wrapper });

      await result.current.exportToGitlab("project-1");

      await waitFor(
        () => {
          expect(result.current.state.isProcessing).toBe(false);
        },
        { timeout: 5000 }
      );

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: labelKeys.lists("project-1"),
      });
      // Labels are only invalidated (mark stale) - they will refetch on next access/background refetch
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: characterKeys.lists("project-1"),
      });
      // Characters are both invalidated AND immediately refetched - critical for syncing character data changes
      expect(refetchQueriesSpy).toHaveBeenCalledWith({
        queryKey: characterKeys.lists("project-1"),
        type: "all",
      });
    });
  });
});
