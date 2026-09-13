/**
 * useZipImportFilesDialog stale-response guard tests
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useZipImportFilesDialog } from "../useZipImportFilesDialog";
import { projectFilesApi } from "@/lib/api/project-files";
import { charactersApi } from "@/lib/api/characters";
import { createTestQueryClient } from "@/test/query-client";
import type { ImportZipResponse } from "@branchforge/shared";

const successToast = vi.fn();
const errorToast = vi.fn();
const invalidateLabels = vi.fn().mockResolvedValue(undefined);

vi.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({
    success: successToast,
    error: errorToast,
  }),
}));

vi.mock("@/hooks/useLabels", () => ({
  useLabels: () => ({
    invalidateLabels,
  }),
}));

vi.mock("@/lib/api/project-files", () => ({
  projectFilesApi: {
    importZip: vi.fn(),
  },
}));

vi.mock("@/lib/api/characters", () => ({
  charactersApi: {
    detectCharacters: vi.fn(),
  },
}));

describe("useZipImportFilesDialog", () => {
  const queryClient = createTestQueryClient();

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
    vi.mocked(charactersApi.detectCharacters).mockResolvedValue({
      characters: [],
      excludedTags: [],
      narratorCharacterTags: [],
      conflicts: [],
      existingTags: [],
    });
  });

  it("ignores a stale import response after the dialog closes", async () => {
    let resolveImport: ((value: ImportZipResponse) => void) | undefined;
    vi.mocked(projectFilesApi.importZip).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveImport = resolve;
        })
    );

    const onOpenChange = vi.fn();
    const zipFile = new File(["zip"], "files.zip", {
      type: "application/zip",
    });

    const { result, rerender } = renderHook(
      ({ open }) => useZipImportFilesDialog(open, onOpenChange, "proj-1"),
      { initialProps: { open: true }, wrapper }
    );

    act(() => {
      result.current.dispatch({ type: "SET_SELECTED_FILE", file: zipFile });
    });

    await act(async () => {
      void result.current.handleImport();
    });

    expect(result.current.importState.status).toBe("uploading");

    rerender({ open: false });
    onOpenChange.mockClear();
    rerender({ open: true });

    await act(async () => {
      resolveImport?.({
        success: true,
        filesImported: 2,
        filesUpdated: 0,
        filesSkipped: 0,
        filesFailed: 0,
        labelsCreated: 1,
      });
    });

    await waitFor(() => {
      expect(projectFilesApi.importZip).toHaveBeenCalledTimes(1);
    });

    expect(result.current.importState.status).not.toBe("success");
    expect(successToast).not.toHaveBeenCalled();
    expect(invalidateLabels).not.toHaveBeenCalled();
  });
});
