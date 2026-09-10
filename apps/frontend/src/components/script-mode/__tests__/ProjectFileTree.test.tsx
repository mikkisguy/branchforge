import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectFileTree } from "../ProjectFileTree";

const noopFileSelect = () => {};
const noopSceneSelect = () => {};

describe("ProjectFileTree - Generated section", () => {
  it("renders generated filenames when CollapsibleSection is expanded", async () => {
    render(
      <ProjectFileTree
        files={[]}
        onFileSelect={noopFileSelect}
        onSceneSelect={noopSceneSelect}
        generatedFiles={[
          { fileName: "outline.md", isEmpty: false, emptyReason: null },
          { fileName: "dialogue.txt", isEmpty: false, emptyReason: null },
        ]}
      />
    );

    // CollapsibleSection defaultOpen=false, so filenames should not be visible
    // before expanding
    expect(
      screen.queryByRole("treeitem", { name: /outline\.md/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("treeitem", { name: /dialogue\.txt/i })
    ).not.toBeInTheDocument();

    // Expand the Generated section
    await userEvent.click(screen.getByRole("button", { name: /^Generated$/i }));

    // Now filenames should be rendered
    expect(
      screen.getByRole("treeitem", { name: /outline\.md/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("treeitem", { name: /dialogue\.txt/i })
    ).toBeInTheDocument();
  });

  it("calls onGeneratedFileSelect when a non-empty file button is clicked", async () => {
    const onGeneratedFileSelect = vi.fn();
    render(
      <ProjectFileTree
        files={[]}
        onFileSelect={noopFileSelect}
        onSceneSelect={noopSceneSelect}
        generatedFiles={[
          { fileName: "outline.md", isEmpty: false, emptyReason: null },
        ]}
        onGeneratedFileSelect={onGeneratedFileSelect}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /^Generated$/i }));
    await userEvent.click(
      screen.getByRole("treeitem", { name: /outline\.md/i })
    );

    expect(onGeneratedFileSelect).toHaveBeenCalledWith("outline.md");
  });

  it("marks empty files as aria-disabled and does not call onGeneratedFileSelect on click", async () => {
    const onGeneratedFileSelect = vi.fn();
    render(
      <ProjectFileTree
        files={[]}
        onFileSelect={noopFileSelect}
        onSceneSelect={noopSceneSelect}
        generatedFiles={[
          {
            fileName: "draft.md",
            isEmpty: true,
            emptyReason: "Run generation first",
          },
        ]}
        onGeneratedFileSelect={onGeneratedFileSelect}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /^Generated$/i }));

    const item = screen.getByRole("treeitem", { name: /draft\.md/i });
    expect(item).toHaveAttribute("aria-disabled", "true");

    await userEvent.click(item);
    expect(onGeneratedFileSelect).not.toHaveBeenCalled();
  });

  it("shows empty reason in tooltip on hover for empty files", async () => {
    render(
      <ProjectFileTree
        files={[]}
        onFileSelect={noopFileSelect}
        onSceneSelect={noopSceneSelect}
        generatedFiles={[
          {
            fileName: "draft.md",
            isEmpty: true,
            emptyReason: "No content yet",
          },
        ]}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /^Generated$/i }));

    const item = screen.getByRole("treeitem", { name: /draft\.md/i });
    await userEvent.hover(item);

    // Tooltip should appear with the empty reason text
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();
    expect(screen.getByText("No content yet")).toBeInTheDocument();
  });

  it("sets aria-selected on the active generated file", async () => {
    render(
      <ProjectFileTree
        files={[]}
        onFileSelect={noopFileSelect}
        onSceneSelect={noopSceneSelect}
        generatedFiles={[
          { fileName: "outline.md", isEmpty: false, emptyReason: null },
          { fileName: "summary.md", isEmpty: false, emptyReason: null },
        ]}
        activeGeneratedFileId="outline.md"
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /^Generated$/i }));

    const activeItem = screen.getByRole("treeitem", { name: /outline\.md/i });
    expect(activeItem).toHaveAttribute("aria-selected", "true");
    expect(activeItem).toHaveClass("bg-[rgba(var(--theme-color-rgb),0.06)]");
    expect(
      screen.getByRole("treeitem", { name: /summary\.md/i })
    ).toHaveAttribute("aria-selected", "false");
  });
});

it("does not wrap empty generated files without emptyReason in a tooltip", async () => {
  render(
    <ProjectFileTree
      files={[]}
      onFileSelect={noopFileSelect}
      onSceneSelect={noopSceneSelect}
      generatedFiles={[
        { fileName: "branchforge_stats.rpy", isEmpty: true, emptyReason: null },
      ]}
    />
  );

  await userEvent.click(screen.getByRole("button", { name: /^Generated$/i }));
  expect(
    screen.getByRole("treeitem", { name: /branchforge_stats\.rpy/i })
  ).toBeInTheDocument();
});

it("keeps script labels as navigation targets without an active state", async () => {
  const onSceneSelect = vi.fn();

  render(
    <ProjectFileTree
      files={[
        {
          id: "story-file",
          projectId: "project-1",
          filePath: "labels/act_i.rpy",
          fileType: "STORY",
          content: "label start:",
          source: "GITLAB",
          contentHash: "hash",
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
          labels: [
            {
              id: "label-1",
              labelName: "start",
              title: "Start",
              status: "DRAFT",
            },
          ],
        },
      ]}
      activeSceneId="label-1"
      onFileSelect={noopFileSelect}
      onSceneSelect={onSceneSelect}
      initialExpandedFolders={["labels"]}
      initialExpandedFiles={["story-file"]}
    />
  );

  const label = screen.getByRole("treeitem", { name: "start" });
  expect(label).not.toHaveAttribute("aria-selected");
  expect(label).not.toHaveClass(
    "bg-[rgba(var(--theme-color-rgb),0.06)]",
    "ring-1",
    "ring-inset"
  );

  await userEvent.click(label);
  expect(onSceneSelect).toHaveBeenCalledWith("label-1");
});

it("opens a story file from its filename and toggles labels from the chevron", async () => {
  const onFileSelect = vi.fn();

  render(
    <ProjectFileTree
      files={[
        {
          id: "story-file",
          projectId: "project-1",
          filePath: "labels/act_i.rpy",
          fileType: "STORY",
          content: "label start:",
          source: "GITLAB",
          contentHash: "hash",
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
          labels: [
            {
              id: "label-1",
              labelName: "start",
              title: "Start",
              status: "DRAFT",
            },
          ],
        },
      ]}
      onFileSelect={onFileSelect}
      onSceneSelect={noopSceneSelect}
      initialExpandedFolders={["labels"]}
    />
  );

  expect(
    screen.queryByRole("treeitem", { name: "start" })
  ).not.toBeInTheDocument();

  await userEvent.click(
    screen.getByRole("button", { name: "Expand labels for act_i.rpy" })
  );
  expect(screen.getByRole("treeitem", { name: "start" })).toBeInTheDocument();

  const filenameButton = screen.getByRole("treeitem", {
    name: /^act_i\.rpy/,
  });
  expect(filenameButton).not.toHaveAttribute("aria-expanded");
  expect(filenameButton).not.toHaveAttribute("aria-owns");

  await userEvent.click(filenameButton);
  expect(onFileSelect).toHaveBeenCalledWith("story-file");
});

describe("ProjectFileTree - folder expansion", () => {
  const nestedFiles = [
    {
      id: "file-1",
      projectId: "project-1",
      filePath: "game/chapter1.rpy",
      fileType: "STORY" as const,
      content: "",
      source: "ZIP" as const,
      contentHash: "hash",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
      labels: [],
    },
  ];

  it("expands folders when foldersToExpand changes", () => {
    const { rerender } = render(
      <ProjectFileTree
        files={nestedFiles}
        onFileSelect={noopFileSelect}
        onSceneSelect={noopSceneSelect}
        initialExpandedFolders={[]}
      />
    );

    expect(screen.queryByTitle("game/chapter1.rpy")).not.toBeInTheDocument();

    rerender(
      <ProjectFileTree
        files={nestedFiles}
        onFileSelect={noopFileSelect}
        onSceneSelect={noopSceneSelect}
        initialExpandedFolders={[]}
        foldersToExpand={["game"]}
      />
    );

    expect(screen.getByTitle("game/chapter1.rpy")).toBeInTheDocument();
  });

  it("re-expands a folder when foldersToExpand is sent again", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ProjectFileTree
        files={nestedFiles}
        onFileSelect={noopFileSelect}
        onSceneSelect={noopSceneSelect}
        initialExpandedFolders={[]}
        foldersToExpand={["game"]}
      />
    );

    expect(screen.getByTitle("game/chapter1.rpy")).toBeInTheDocument();

    await user.click(screen.getByRole("treeitem", { expanded: true }));
    expect(screen.queryByTitle("game/chapter1.rpy")).not.toBeInTheDocument();

    rerender(
      <ProjectFileTree
        files={nestedFiles}
        onFileSelect={noopFileSelect}
        onSceneSelect={noopSceneSelect}
        initialExpandedFolders={[]}
        foldersToExpand={["game"]}
      />
    );

    expect(screen.getByTitle("game/chapter1.rpy")).toBeInTheDocument();
  });
});
