/**
 * useExports Hook Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { useExports } from "../useExports";
import { projectFilesApi } from "@/lib/api/project-files";
import { exportKeys } from "@/lib/query-keys";
import { createTestQueryClient } from "@/test/query-client";

vi.mock("@/lib/api/project-files", () => ({
  projectFilesApi: {
    listExports: vi.fn(),
    generateExport: vi.fn(),
    downloadExport: vi.fn(),
  },
}));

const mockExports = [
  {
    id: "exp-1",
    projectId: "project-1",
    format: "zip",
    fileName: "project.zip",
    fileSize: 1024,
    createdAt: "2024-01-01T00:00:00.000Z",
  },
];

describe("useExports", () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = createTestQueryClient();
    vi.clearAllMocks();
    vi.mocked(projectFilesApi.listExports).mockResolvedValue(mockExports);
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("loads export history for a project", async () => {
    const { result } = renderHook(() => useExports("project-1"), { wrapper });

    await waitFor(() => {
      expect(result.current.exports).toEqual(mockExports);
      expect(result.current.isLoadingExports).toBe(false);
    });
  });

  it("generates an export and invalidates the list cache", async () => {
    const generated = {
      id: "exp-2",
      fileName: "project.zip",
      fileSize: 2048,
      format: "zip",
      createdAt: "2024-01-02T00:00:00.000Z",
    };
    vi.mocked(projectFilesApi.generateExport).mockResolvedValue(generated);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useExports("project-1"), { wrapper });

    await waitFor(() => {
      expect(result.current.exports).toEqual(mockExports);
    });

    await act(async () => {
      await result.current.generateExport();
    });

    expect(projectFilesApi.generateExport).toHaveBeenCalledWith("project-1");
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: exportKeys.lists("project-1"),
    });
  });

  it("downloads an export by id", async () => {
    vi.mocked(projectFilesApi.downloadExport).mockResolvedValue(undefined);

    const { result } = renderHook(() => useExports("project-1"), { wrapper });

    await waitFor(() => {
      expect(result.current.exports).toEqual(mockExports);
    });

    await act(async () => {
      await result.current.downloadExport("exp-1");
    });

    expect(projectFilesApi.downloadExport).toHaveBeenCalledWith(
      "project-1",
      "exp-1"
    );
  });

  it("generates and downloads via the shared export helper", async () => {
    const generated = {
      id: "exp-3",
      fileName: "project.zip",
      fileSize: 4096,
      format: "zip",
      createdAt: "2024-01-03T00:00:00.000Z",
    };
    vi.mocked(projectFilesApi.generateExport).mockResolvedValue(generated);
    vi.mocked(projectFilesApi.downloadExport).mockResolvedValue(undefined);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useExports("project-1"), { wrapper });

    await waitFor(() => {
      expect(result.current.exports).toEqual(mockExports);
    });

    await act(async () => {
      await result.current.generateAndDownload();
    });

    expect(projectFilesApi.generateExport).toHaveBeenCalledWith("project-1");
    expect(projectFilesApi.downloadExport).toHaveBeenCalledWith(
      "project-1",
      "exp-3"
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: exportKeys.lists("project-1"),
    });
  });
});
