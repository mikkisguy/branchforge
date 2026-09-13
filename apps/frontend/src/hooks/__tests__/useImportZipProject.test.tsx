/**
 * useImportZipProject Hook Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { useImportZipProject } from "../useImportZipProject";
import { projectsApi } from "@/lib/api/projects";
import { labelKeys, projectKeys } from "@/lib/query-keys";
import { createTestQueryClient } from "@/test/query-client";

vi.mock("@/lib/api/projects", () => ({
  projectsApi: {
    importZip: vi.fn(),
  },
}));

describe("useImportZipProject", () => {
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

  it("imports a zip project and invalidates project and label caches", async () => {
    const zipFile = new File(["zip"], "project.zip", {
      type: "application/zip",
    });
    vi.mocked(projectsApi.importZip).mockResolvedValue({
      success: true,
      project: {
        id: "proj-new",
        name: "Imported",
        maxStatDelta: 5,
        visibility: "OWNER",
        source: "ZIP",
        duoEndingEnabled: false,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
      filesImported: 3,
      filesUpdated: 0,
      filesSkipped: 0,
      labelsCreated: 2,
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useImportZipProject(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        file: zipFile,
        projectName: "Imported",
      });
    });

    expect(projectsApi.importZip).toHaveBeenCalledWith({
      file: zipFile,
      projectName: "Imported",
    });
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: projectKeys.lists(),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: labelKeys.scoped("proj-new"),
      });
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(2);
  });

  it("does not invalidate label caches when import response has no project id", async () => {
    const zipFile = new File(["zip"], "project.zip", {
      type: "application/zip",
    });
    vi.mocked(projectsApi.importZip).mockResolvedValue({
      success: false,
      error: "Import failed",
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useImportZipProject(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        file: zipFile,
        projectName: "Imported",
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: projectKeys.lists(),
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: labelKeys.scoped("proj-new"),
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
  });

});
