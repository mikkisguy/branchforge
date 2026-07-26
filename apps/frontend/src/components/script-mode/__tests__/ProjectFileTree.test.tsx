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

    expect(
      screen.getByRole("treeitem", { name: /outline\.md/i })
    ).toHaveAttribute("aria-selected", "true");
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
