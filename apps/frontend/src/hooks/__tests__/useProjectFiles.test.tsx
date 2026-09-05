/**
 * useProjectFiles Hook Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { useProjectFiles } from "../useProjectFiles";
import { projectFilesApi } from "@/lib/api/project-files";
import type { ProjectFileNode } from "@/lib/api/project-files";
import { projectFilesKeys } from "@/lib/query-keys";
import { createTestQueryClient } from "@/test/query-client";

vi.mock("@/lib/api/project-files", () => ({
  projectFilesApi: {
    listFiles: vi.fn(),
    updateFile: vi.fn(),
    createFile: vi.fn(),
  },
}));

const mockFiles: ProjectFileNode[] = [
  {
    id: "file-1",
    projectId: "project-1",
    filePath: "labels/act_1.rpy",
    fileType: "STORY",
    content: "",
    source: "ZIP",
    contentHash: "hash-1",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    labels: [],
  },
];

const createdFile: ProjectFileNode = {
  id: "file-2",
  projectId: "project-1",
  filePath: "labels/chapter_01.rpy",
  fileType: "STORY",
  content: "",
  source: "ZIP",
  contentHash: "hash-2",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  labels: [],
};

describe("useProjectFiles", () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = createTestQueryClient();
    vi.clearAllMocks();
    vi.mocked(projectFilesApi.listFiles).mockResolvedValue(mockFiles);
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("creates a file via the API and invalidates list queries", async () => {
    vi.mocked(projectFilesApi.createFile).mockResolvedValue(createdFile);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useProjectFiles("project-1"), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.files).toEqual(mockFiles);
    });

    await act(async () => {
      const file = await result.current.createFile("labels/chapter_01");
      expect(file).toEqual(createdFile);
    });

    expect(projectFilesApi.createFile).toHaveBeenCalledWith(
      "project-1",
      "labels/chapter_01"
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: projectFilesKeys.lists("project-1"),
    });
  });

  it("inserts the created file into the list cache before refetch completes", async () => {
    vi.mocked(projectFilesApi.createFile).mockResolvedValue(createdFile);
    let listCalls = 0;
    vi.mocked(projectFilesApi.listFiles).mockImplementation(async () => {
      listCalls += 1;
      if (listCalls === 1) {
        return mockFiles;
      }
      return new Promise(() => undefined);
    });

    const { result } = renderHook(() => useProjectFiles("project-1"), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.files).toEqual(mockFiles);
    });

    await act(async () => {
      await result.current.createFile("labels/chapter_01");
    });

    expect(
      queryClient.getQueryData(projectFilesKeys.lists("project-1"))
    ).toEqual([...mockFiles, createdFile]);
    await waitFor(() => {
      expect(result.current.files).toEqual([...mockFiles, createdFile]);
    });
  });

  it("invalidates source-specific list queries when a source filter is used", async () => {
    vi.mocked(projectFilesApi.createFile).mockResolvedValue(createdFile);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(
      () => useProjectFiles("project-1", { source: "ZIP" }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.files).toEqual(mockFiles);
    });

    await act(async () => {
      await result.current.createFile("labels/chapter_01");
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: projectFilesKeys.lists("project-1"),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: projectFilesKeys.listsWithSource("project-1", "ZIP"),
    });
  });

  it("tracks pending and error state for createFile", async () => {
    let resolveCreate: ((value: ProjectFileNode) => void) | undefined;
    vi.mocked(projectFilesApi.createFile).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        })
    );

    const { result } = renderHook(() => useProjectFiles("project-1"), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.files).toEqual(mockFiles);
    });

    let createPromise: Promise<ProjectFileNode> | undefined;
    act(() => {
      createPromise = result.current.createFile("labels/chapter_01");
    });

    await waitFor(() => {
      expect(result.current.isCreatingFile).toBe(true);
    });

    await act(async () => {
      resolveCreate?.(createdFile);
      await createPromise;
    });

    await waitFor(() => {
      expect(result.current.isCreatingFile).toBe(false);
    });
    expect(result.current.createFileError).toBeNull();

    const createError = new Error("Failed to create file");
    vi.mocked(projectFilesApi.createFile).mockRejectedValue(createError);

    await act(async () => {
      await expect(
        result.current.createFile("labels/duplicate.rpy")
      ).rejects.toThrow("Failed to create file");
    });

    await waitFor(() => {
      expect(result.current.createFileError).toEqual(createError);
    });
  });
});
