import { renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useWorkspaceTitle } from "../useWorkspaceTitle";

it("displays the current document and project, marks unsaved edits, and restores the app title", () => {
  const originalTitle = document.title;
  const { rerender, unmount } = renderHook(
    ({ project, documentName, dirty }) =>
      useWorkspaceTitle(project, documentName, dirty),
    {
      initialProps: {
        project: "First Story",
        documentName: "Chapter 1",
        dirty: false,
      },
    }
  );

  expect(document.title).toBe("Chapter 1 | First Story | BranchForge");
  rerender({ project: "First Story", documentName: "Chapter 1", dirty: true });
  expect(document.title).toBe("* Chapter 1 | First Story | BranchForge");
  rerender({
    project: "Second Story",
    documentName: "script.rpy",
    dirty: false,
  });
  expect(document.title).toBe("script.rpy | Second Story | BranchForge");
  unmount();
  expect(document.title).toBe(originalTitle);
});
