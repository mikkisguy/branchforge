import { act, renderHook } from "@testing-library/react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useFileEditor } from "../useFileEditor";
import { createTestQueryClient } from "@/test/query-client";
import type { ProjectFileNode } from "../useProjectFiles";

function createProjectFile(
  id: string,
  filePath: string,
  content: string,
  contentHash: string
): ProjectFileNode {
  return {
    id,
    projectId: "project-1",
    filePath,
    fileType: "STORY",
    content,
    sourceType: "GITLAB",
    contentHash,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    labels: [],
  };
}

const FILE_A = createProjectFile(
  "file-1",
  "labels/act_1.rpy",
  'label act_1:\n    e "Hi"',
  "hash-file-1"
);
const FILE_B = createProjectFile(
  "file-2",
  "labels/act_2.rpy",
  'label act_2:\n    e "Bye"',
  "hash-file-2"
);

describe("useFileEditor", () => {
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

  it("switches files and saves edited content", async () => {
    const updateFileContent = vi.fn().mockResolvedValue({
      success: true,
      contentHash: "hash-new",
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
    const showErrorToast = vi.fn();

    const { result } = renderHook(
      () =>
        useFileEditor({
          projectId: "project-1",
          projectFiles: [FILE_A, FILE_B],
          updateFileContent,
          showErrorToast,
        }),
      { wrapper }
    );

    await act(async () => {
      const switched = await result.current.switchToFile(FILE_A);
      expect(switched).toBe(true);
    });

    expect(result.current.currentEditFileId).toBe("file-1");
    expect(result.current.editedFileContent).toBe(FILE_A.content);

    act(() => {
      result.current.setEditedFileContent("updated content");
    });

    await act(async () => {
      const saved = await result.current.triggerFileSave();
      expect(saved).toBe(true);
    });

    expect(updateFileContent).toHaveBeenCalledWith(
      "file-1",
      "updated content",
      {
        expectedContentHash: "hash-file-1",
      }
    );
    expect(result.current.hasSaveConflict).toBe(false);
    expect(showErrorToast).not.toHaveBeenCalled();
  });

  it("uses the latest content hash across consecutive saves", async () => {
    const updateFileContent = vi
      .fn()
      .mockResolvedValueOnce({
        success: true,
        contentHash: "hash-after-first-save",
        updatedAt: "2024-01-01T00:00:00.000Z",
      })
      .mockResolvedValueOnce({
        success: true,
        contentHash: "hash-after-second-save",
        updatedAt: "2024-01-01T00:00:00.000Z",
      });
    const showErrorToast = vi.fn();

    const { result } = renderHook(
      () =>
        useFileEditor({
          projectId: "project-1",
          projectFiles: [FILE_A],
          updateFileContent,
          showErrorToast,
        }),
      { wrapper }
    );

    await act(async () => {
      const switched = await result.current.switchToFile(FILE_A);
      expect(switched).toBe(true);
    });

    act(() => {
      result.current.setEditedFileContent("first edit");
    });

    await act(async () => {
      const saved = await result.current.triggerFileSave();
      expect(saved).toBe(true);
    });

    act(() => {
      result.current.setEditedFileContent("second edit");
    });

    await act(async () => {
      const saved = await result.current.triggerFileSave();
      expect(saved).toBe(true);
    });

    expect(updateFileContent).toHaveBeenNthCalledWith(
      1,
      "file-1",
      "first edit",
      {
        expectedContentHash: "hash-file-1",
      }
    );
    expect(updateFileContent).toHaveBeenNthCalledWith(
      2,
      "file-1",
      "second edit",
      {
        expectedContentHash: "hash-after-first-save",
      }
    );
    expect(showErrorToast).not.toHaveBeenCalled();
  });

  it("autosaves consecutive edits after debounce", async () => {
    vi.useFakeTimers();

    try {
      const updateFileContent = vi
        .fn()
        .mockResolvedValueOnce({
          success: true,
          contentHash: "hash-after-first-autosave",
          updatedAt: "2024-01-01T00:00:00.000Z",
        })
        .mockResolvedValueOnce({
          success: true,
          contentHash: "hash-after-second-autosave",
          updatedAt: "2024-01-01T00:00:00.000Z",
        });
      const showErrorToast = vi.fn();

      const { result } = renderHook(
        () =>
          useFileEditor({
            projectId: "project-1",
            projectFiles: [FILE_A],
            updateFileContent,
            showErrorToast,
          }),
        { wrapper }
      );

      await act(async () => {
        const switched = await result.current.switchToFile(FILE_A);
        expect(switched).toBe(true);
      });

      act(() => {
        result.current.setEditedFileContent("autosave edit one");
      });

      await act(async () => {
        vi.advanceTimersByTime(1100);
        await Promise.resolve();
      });

      act(() => {
        result.current.setEditedFileContent("autosave edit two");
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1100);
      });

      expect(updateFileContent).toHaveBeenNthCalledWith(
        1,
        "file-1",
        "autosave edit one",
        {
          expectedContentHash: "hash-file-1",
        }
      );
      expect(updateFileContent).toHaveBeenNthCalledWith(
        2,
        "file-1",
        "autosave edit two",
        {
          expectedContentHash: "hash-after-first-autosave",
        }
      );
      expect(showErrorToast).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks save conflict when backend reports stale hash", async () => {
    const updateFileContent = vi.fn().mockResolvedValue({
      success: false,
      conflict: {
        reason: "STALE_CONTENT_HASH",
        currentContentHash: "hash-server",
      },
    });
    const showErrorToast = vi.fn();

    const { result } = renderHook(
      () =>
        useFileEditor({
          projectId: "project-1",
          projectFiles: [FILE_A],
          updateFileContent,
          showErrorToast,
        }),
      { wrapper }
    );

    await act(async () => {
      await result.current.switchToFile(FILE_A);
    });

    act(() => {
      result.current.setEditedFileContent("changed");
    });

    await act(async () => {
      const saved = await result.current.triggerFileSave();
      expect(saved).toBe(false);
    });

    expect(result.current.hasSaveConflict).toBe(true);
    expect(showErrorToast).toHaveBeenCalledWith(
      "This file changed elsewhere. Reload project files before editing again.",
      "Script conflict detected"
    );
  });

  it("blocks switching files when pending save cannot flush", async () => {
    const updateFileContent = vi.fn().mockResolvedValue({
      success: false,
      conflict: {
        reason: "STALE_CONTENT_HASH",
        currentContentHash: "hash-server",
      },
    });
    const showErrorToast = vi.fn();

    const { result } = renderHook(
      () =>
        useFileEditor({
          projectId: "project-1",
          projectFiles: [FILE_A, FILE_B],
          updateFileContent,
          showErrorToast,
        }),
      { wrapper }
    );

    await act(async () => {
      await result.current.switchToFile(FILE_A);
    });

    act(() => {
      result.current.setEditedFileContent("changed");
    });

    await act(async () => {
      await result.current.triggerFileSave();
    });

    await act(async () => {
      const switched = await result.current.switchToFile(FILE_B);
      expect(switched).toBe(false);
    });

    expect(result.current.currentEditFileId).toBe("file-1");
    expect(showErrorToast).toHaveBeenCalledTimes(3);
    expect(showErrorToast).toHaveBeenCalledWith(
      "This file changed elsewhere. Reload project files before editing again.",
      "Script conflict detected"
    );
    expect(showErrorToast).toHaveBeenCalledWith(
      "Could not save pending edits. Resolve the save error before switching files.",
      "File switch blocked"
    );
  });
});
