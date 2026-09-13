/**
 * useZipImportProjectDialog stale-response guard tests
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useZipImportProjectDialog } from "../useZipImportProjectDialog";

const mutateAsync = vi.fn();
const successToast = vi.fn();
const errorToast = vi.fn();

vi.mock("@/hooks/useImportZipProject", () => ({
  useImportZipProject: () => ({
    mutateAsync,
    isPending: false,
  }),
}));

vi.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({
    success: successToast,
    error: errorToast,
  }),
}));

vi.mock("@/lib/api/characters", () => ({
  charactersApi: {
    detectCharacters: vi.fn(),
  },
}));

describe("useZipImportProjectDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ignores a stale import response after the dialog closes", async () => {
    let resolveImport: ((value: unknown) => void) | undefined;
    mutateAsync.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveImport = resolve;
        })
    );

    const onOpenChange = vi.fn();
    const zipFile = new File(["zip"], "project.zip", {
      type: "application/zip",
    });

    const { result, rerender } = renderHook(
      ({ open }) => useZipImportProjectDialog(open, onOpenChange),
      { initialProps: { open: true } }
    );

    act(() => {
      result.current.dispatch({ type: "SET_SELECTED_FILE", file: zipFile });
      result.current.dispatch({
        type: "SET_PROJECT_NAME",
        value: "Imported Project",
      });
    });

    await act(async () => {
      void result.current.handleImport();
    });

    expect(result.current.state.importState.status).toBe("uploading");

    rerender({ open: false });
    onOpenChange.mockClear();
    rerender({ open: true });

    await act(async () => {
      resolveImport?.({
        success: true,
        project: { id: "proj-stale" },
        filesImported: 1,
        labelsCreated: 1,
      });
    });

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledTimes(1);
    });

    expect(result.current.state.importState.status).not.toBe("success");
    expect(successToast).not.toHaveBeenCalled();
  });

  it("ignores a stale import failure after the dialog closes", async () => {
    let rejectImport: ((reason: Error) => void) | undefined;
    mutateAsync.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectImport = reject;
        })
    );

    const onOpenChange = vi.fn();
    const zipFile = new File(["zip"], "project.zip", {
      type: "application/zip",
    });

    const { result, rerender } = renderHook(
      ({ open }) => useZipImportProjectDialog(open, onOpenChange),
      { initialProps: { open: true } }
    );

    act(() => {
      result.current.dispatch({ type: "SET_SELECTED_FILE", file: zipFile });
      result.current.dispatch({
        type: "SET_PROJECT_NAME",
        value: "Imported Project",
      });
    });

    await act(async () => {
      void result.current.handleImport();
    });

    expect(result.current.state.importState.status).toBe("uploading");

    rerender({ open: false });
    onOpenChange.mockClear();
    rerender({ open: true });

    await act(async () => {
      rejectImport?.(new Error("Network error"));
    });

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledTimes(1);
    });

    expect(result.current.state.importState.status).not.toBe("error");
    expect(errorToast).not.toHaveBeenCalled();
  });
});
