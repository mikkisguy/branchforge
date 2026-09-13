import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ProjectFileNode } from "@/hooks/useProjectFiles";
import { useProjectFileActions } from "../useProjectFileActions";

const mutations = vi.hoisted(() => ({
  renameFile: vi.fn(),
  deleteFile: vi.fn(),
}));

vi.mock("@/hooks/useProjectFileMutations", () => ({
  useProjectFileMutations: () => ({
    ...mutations,
    isRenaming: false,
    isDeleting: false,
  }),
}));

const FILE: ProjectFileNode = {
  id: "file-1",
  projectId: "project-1",
  filePath: "script.rpy",
  fileType: "STORY",
  content: "label start:",
  source: "GITLAB",
  contentHash: "hash",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  labels: [],
};

describe("useProjectFileActions", () => {
  it("closes an open dialog when the project changes", async () => {
    const { result, rerender } = renderHook(
      ({ projectId }) =>
        useProjectFileActions({
          projectId,
          canModify: true,
          showErrorToast: vi.fn(),
        }),
      { initialProps: { projectId: "project-1" as string | undefined } }
    );

    await act(async () => {
      await result.current.requestRename(FILE);
    });
    expect(result.current.pendingAction?.file.id).toBe(FILE.id);

    act(() => {
      rerender({ projectId: "project-2" });
    });
    expect(result.current.pendingAction).toBeNull();
  });

  it("does not open a dialog when the project changes during autosave", async () => {
    let finishFlush: ((success: boolean) => void) | undefined;
    const flushAutosave = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finishFlush = resolve;
        })
    );
    const { result, rerender } = renderHook(
      ({ projectId }) =>
        useProjectFileActions({
          projectId,
          canModify: true,
          flushAutosave,
          showErrorToast: vi.fn(),
        }),
      { initialProps: { projectId: "project-1" as string | undefined } }
    );

    let request: Promise<void>;
    act(() => {
      request = result.current.requestDelete(FILE);
    });
    act(() => {
      rerender({ projectId: "project-2" });
    });
    await act(async () => {
      finishFlush?.(true);
      await request!;
    });

    expect(result.current.pendingAction).toBeNull();
  });
});
