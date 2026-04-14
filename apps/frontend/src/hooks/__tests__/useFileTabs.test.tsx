import { act, renderHook, waitFor } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFileTabs } from "../useFileTabs";
import type { ProjectFileNode } from "../useProjectFiles";

function createProjectFile(
  id: string,
  filePath: string,
  fileType: "STORY" | "SETTINGS"
): ProjectFileNode {
  return {
    id,
    projectId: "project-1",
    filePath,
    fileType,
    content: "content",
    sourceType: "GITLAB",
    contentHash: `hash-${id}`,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    labels: [],
  };
}

describe("useFileTabs", () => {
  const projectFiles: ProjectFileNode[] = [
    createProjectFile("file-1", "labels/act_1.rpy", "STORY"),
    createProjectFile("file-2", "gui/screens.rpy", "SETTINGS"),
  ];

  beforeEach(() => {
    localStorage.clear();
  });

  it("selects files and tracks active/open tabs", async () => {
    const onFileSelect = vi.fn().mockResolvedValue(true);
    const onFileActivated = vi.fn();

    const { result } = renderHook(() =>
      useFileTabs({
        projectId: "project-1",
        projectFiles,
        isLoadingFiles: false,
        onFileSelect,
        onFileActivated,
      })
    );

    await act(async () => {
      await result.current.selectFileTab("file-1");
    });

    expect(onFileSelect).toHaveBeenCalledWith("file-1");
    expect(onFileActivated).toHaveBeenCalledWith("file-1");
    expect(result.current.activeFileId).toBe("file-1");
    expect(result.current.openTabs).toEqual(["file-1"]);
    expect(result.current.tabItems).toEqual([
      {
        id: "file-1",
        title: "act_1.rpy",
        meta: "Story",
        closeLabel: "Close act_1.rpy",
      },
    ]);
  });

  it("closes the final active tab and invokes empty callback", async () => {
    const onFileSelect = vi.fn().mockResolvedValue(true);
    const onNoTabsRemaining = vi.fn();

    const { result } = renderHook(() =>
      useFileTabs({
        projectId: "project-1",
        projectFiles,
        isLoadingFiles: false,
        onFileSelect,
        onNoTabsRemaining,
      })
    );

    await act(async () => {
      await result.current.selectFileTab("file-1");
    });

    const event = {
      stopPropagation: vi.fn(),
    } as unknown as React.MouseEvent;

    act(() => {
      result.current.handleCloseFileTab(event, "file-1");
    });

    expect(onNoTabsRemaining).toHaveBeenCalledTimes(1);
    expect(result.current.activeFileId).toBeNull();
    expect(result.current.openTabs).toEqual([]);
  });

  it("hydrates persisted tabs and active file from localStorage", async () => {
    localStorage.setItem(
      "branchforge:script:open-tabs:project-1",
      JSON.stringify(["file-1", "missing-file"])
    );
    localStorage.setItem("branchforge:script:active-file:project-1", "file-1");

    const onFileSelect = vi.fn().mockResolvedValue(true);

    const { result } = renderHook(() =>
      useFileTabs({
        projectId: "project-1",
        projectFiles,
        isLoadingFiles: false,
        onFileSelect,
      })
    );

    await waitFor(() => {
      expect(onFileSelect).toHaveBeenCalledWith("file-1");
    });

    await waitFor(() => {
      expect(result.current.openTabs).toEqual(["file-1"]);
      expect(result.current.activeFileId).toBe("file-1");
    });
  });
});
