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
          activeLabelId: null,
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
          activeLabelId: null,
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
          activeLabelId: null,
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
