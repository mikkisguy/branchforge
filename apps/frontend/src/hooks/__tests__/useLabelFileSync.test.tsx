import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { findLabelLineNumber, useLabelFileSync } from "../useLabelFileSync";
import type { ProjectFileNode } from "../useProjectFiles";

function createProjectFile(
  id: string,
  filePath: string,
  content: string,
  labels: ProjectFileNode["labels"]
): ProjectFileNode {
  return {
    id,
    projectId: "project-1",
    filePath,
    fileType: "STORY",
    content,
    source: "GITLAB",
    contentHash: `hash-${id}`,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    labels,
  };
}

describe("useLabelFileSync", () => {
  it("finds label line numbers from label titles", () => {
    const line = findLabelLineNumber(
      ["# intro", "label chapter_one_intro:", '    e "hi"'].join("\n"),
      "Chapter One Intro"
    );

    expect(line).toBe(2);
  });

  it("switches to label file and sets target line", async () => {
    const onFileSelect = vi.fn().mockResolvedValue(true);
    const onSetScrollToLine = vi.fn();
    const files: ProjectFileNode[] = [
      createProjectFile(
        "file-1",
        "story/chapter-one.rpy",
        ["label chapter_one_intro:", '    e "Hello"'].join("\n"),
        [
          {
            id: "label-1",
            labelName: "chapter_one_intro",
            title: "Chapter One Intro",
          },
        ]
      ),
    ];

    renderHook(() =>
      useLabelFileSync({
        projectFiles: files,
        activeLabelId: "label-1",
        onFileSelect,
        onSetScrollToLine,
      })
    );

    await waitFor(() => {
      expect(onFileSelect).toHaveBeenCalledWith("file-1");
      expect(onSetScrollToLine).toHaveBeenCalledWith(1);
    });
  });

  it("does not set scroll line when file switch is blocked", async () => {
    const onFileSelect = vi.fn().mockResolvedValue(false);
    const onSetScrollToLine = vi.fn();
    const files: ProjectFileNode[] = [
      createProjectFile(
        "file-1",
        "story/chapter-one.rpy",
        ["label chapter_one_intro:", '    e "Hello"'].join("\n"),
        [
          {
            id: "label-1",
            labelName: "chapter_one_intro",
            title: "Chapter One Intro",
          },
        ]
      ),
    ];

    renderHook(() =>
      useLabelFileSync({
        projectFiles: files,
        activeLabelId: "label-1",
        onFileSelect,
        onSetScrollToLine,
      })
    );

    await waitFor(() => {
      expect(onFileSelect).toHaveBeenCalledWith("file-1");
    });

    expect(onSetScrollToLine).not.toHaveBeenCalled();
  });

  it("finds label line numbers for parameterized labels", () => {
    const line = findLabelLineNumber(
      ["# intro", "label my_label(arg1, arg2):", '    e "hi"'].join("\n"),
      "my_label"
    );

    expect(line).toBe(2);
  });
});
