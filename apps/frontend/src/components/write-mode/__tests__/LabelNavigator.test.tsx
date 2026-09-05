import { describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PublicLabel } from "@branchforge/shared";
import { LabelNavigator } from "@/components/write-mode/LabelNavigator.js";

function makeLabel(overrides: Partial<PublicLabel> = {}): PublicLabel {
  return {
    id: "label-1",
    projectId: "proj1",
    title: "Test Label",
    groupType: null,
    groupValue: null,
    labelNumber: 1,
    sequenceOrder: 0,
    routeKey: null,
    status: null,
    visibility: null,
    projectFileId: "file-default",
    fileName: "default.rpy",
    labelName: null,
    conditions: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const labelsFromMultipleFiles: PublicLabel[] = [
  makeLabel({
    id: "1",
    title: "Label A",
    fileName: "act_i.rpy",
    projectFileId: "file1",
    sequenceOrder: 0,
    labelNumber: 1,
  }),
  makeLabel({
    id: "2",
    title: "Label B",
    fileName: "act_i.rpy",
    projectFileId: "file1",
    sequenceOrder: 1,
    labelNumber: 2,
  }),
  makeLabel({
    id: "3",
    title: "Label C",
    fileName: "act_ii.rpy",
    projectFileId: "file2",
    sequenceOrder: 0,
    labelNumber: 1,
  }),
];

const storyFilesFromLabels = [
  { id: "file1", filePath: "act_i.rpy" },
  { id: "file2", filePath: "act_ii.rpy" },
];

describe("LabelNavigator", () => {
  describe("file grouping", () => {
    it("groups labels by fileName", () => {
      render(
        <LabelNavigator
          labels={labelsFromMultipleFiles}
          storyFiles={storyFilesFromLabels}
          activeLabelId={null}
          onSelect={vi.fn()}
        />
      );

      expect(screen.getByText("act_i.rpy")).toBeInTheDocument();
      expect(screen.getByText("act_ii.rpy")).toBeInTheDocument();
    });

    it("shows correct label counts per file", () => {
      render(
        <LabelNavigator
          labels={labelsFromMultipleFiles}
          storyFiles={storyFilesFromLabels}
          activeLabelId={null}
          onSelect={vi.fn()}
        />
      );

      const actIHeader = screen.getByText("act_i.rpy").parentElement!;
      const actIiHeader = screen.getByText("act_ii.rpy").parentElement!;
      expect(within(actIHeader).getByText("2")).toBeInTheDocument();
      expect(within(actIiHeader).getByText("1")).toBeInTheDocument();
    });

    it("renders empty story file groups from storyFiles with Add label", () => {
      render(
        <LabelNavigator
          labels={labelsFromMultipleFiles}
          storyFiles={[
            ...storyFilesFromLabels,
            { id: "file-empty", filePath: "chapters/empty.rpy" },
          ]}
          activeLabelId={null}
          onSelect={vi.fn()}
          onCreateLabel={vi.fn()}
        />
      );

      expect(screen.getByText("empty.rpy")).toBeInTheDocument();
      expect(screen.getAllByText("Add label")).toHaveLength(3);
    });

    it("builds groups from story files even when a file has no labels", () => {
      render(
        <LabelNavigator
          labels={[]}
          storyFiles={[{ id: "file-empty", filePath: "new_story.rpy" }]}
          activeLabelId={null}
          onSelect={vi.fn()}
          onCreateLabel={vi.fn()}
        />
      );

      expect(screen.getByText("new_story.rpy")).toBeInTheDocument();
      expect(screen.getByText("Add label")).toBeInTheDocument();
    });
  });

  describe("sorting", () => {
    it("sorts file groups alphabetically", () => {
      render(
        <LabelNavigator
          labels={labelsFromMultipleFiles}
          storyFiles={storyFilesFromLabels}
          activeLabelId={null}
          onSelect={vi.fn()}
        />
      );

      const groups = screen.getAllByText(/\.rpy/).map((el) => el.textContent);
      const actIIndex = groups.indexOf("act_i.rpy");
      const actIiIndex = groups.indexOf("act_ii.rpy");

      expect(actIIndex).toBeLessThan(actIiIndex);
    });

    it("sorts labels within each group by sequenceOrder", () => {
      render(
        <LabelNavigator
          labels={labelsFromMultipleFiles}
          storyFiles={storyFilesFromLabels}
          activeLabelId={null}
          onSelect={vi.fn()}
        />
      );

      const buttons = screen
        .getAllByRole("button")
        .filter((b) => b.textContent?.match(/Label/));
      const labelAIndex = buttons.findIndex((b) =>
        b.textContent?.includes("Label A")
      );
      const labelBIndex = buttons.findIndex((b) =>
        b.textContent?.includes("Label B")
      );

      expect(labelAIndex).toBeLessThan(labelBIndex);
    });
  });

  describe("empty state", () => {
    it("shows empty state when no labels and no story files", () => {
      render(
        <LabelNavigator
          labels={[]}
          storyFiles={[]}
          activeLabelId={null}
          onSelect={vi.fn()}
        />
      );

      expect(screen.getByText("No labels found")).toBeInTheDocument();
    });
  });

  describe("new file control", () => {
    it("shows + New File in the navigator header", () => {
      const onNewFile = vi.fn();
      render(
        <LabelNavigator
          labels={labelsFromMultipleFiles}
          storyFiles={storyFilesFromLabels}
          activeLabelId={null}
          onSelect={vi.fn()}
          onNewFile={onNewFile}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: "+ New File" }));
      expect(onNewFile).toHaveBeenCalledTimes(1);
    });

    it("hides + New File when the owner action is omitted", () => {
      render(
        <LabelNavigator
          labels={labelsFromMultipleFiles}
          storyFiles={storyFilesFromLabels}
          activeLabelId={null}
          onSelect={vi.fn()}
        />
      );

      expect(
        screen.queryByRole("button", { name: "+ New File" })
      ).not.toBeInTheDocument();
    });
  });

  describe("reveal created file", () => {
    it("scrolls the file group into view after it appears", async () => {
      const scrollIntoView = vi.fn();
      HTMLElement.prototype.scrollIntoView = scrollIntoView;
      const onFileRevealed = vi.fn();

      const { rerender } = render(
        <LabelNavigator
          labels={[]}
          storyFiles={[]}
          activeLabelId={null}
          onSelect={vi.fn()}
          revealFileId="file-new"
          onFileRevealed={onFileRevealed}
        />
      );

      expect(scrollIntoView).not.toHaveBeenCalled();

      rerender(
        <LabelNavigator
          labels={[]}
          storyFiles={[{ id: "file-new", filePath: "chapters/new_scene.rpy" }]}
          activeLabelId={null}
          onSelect={vi.fn()}
          revealFileId="file-new"
          onFileRevealed={onFileRevealed}
        />
      );

      await waitFor(() => {
        expect(scrollIntoView).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect(onFileRevealed).toHaveBeenCalled();
      });
    });

    it("reveals a new file after leaving last-updated sort", async () => {
      const scrollIntoView = vi.fn();
      HTMLElement.prototype.scrollIntoView = scrollIntoView;
      const onFileRevealed = vi.fn();

      const { rerender } = render(
        <LabelNavigator
          labels={labelsFromMultipleFiles}
          storyFiles={storyFilesFromLabels}
          activeLabelId={null}
          onSelect={vi.fn()}
        />
      );

      fireEvent.click(
        screen.getByRole("button", { name: /sort mode: sequence order/i })
      );

      rerender(
        <LabelNavigator
          labels={labelsFromMultipleFiles}
          storyFiles={storyFilesFromLabels}
          activeLabelId={null}
          onSelect={vi.fn()}
          revealFileId="file-new"
          sortResetToken={1}
          onFileRevealed={onFileRevealed}
        />
      );

      expect(scrollIntoView).not.toHaveBeenCalled();

      rerender(
        <LabelNavigator
          labels={labelsFromMultipleFiles}
          storyFiles={[
            ...storyFilesFromLabels,
            { id: "file-new", filePath: "chapters/new_scene.rpy" },
          ]}
          activeLabelId={null}
          onSelect={vi.fn()}
          revealFileId="file-new"
          sortResetToken={1}
          onFileRevealed={onFileRevealed}
        />
      );

      await waitFor(() => {
        expect(scrollIntoView).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect(onFileRevealed).toHaveBeenCalled();
      });
    });

    it("clears search and reveals a new file after create", async () => {
      const scrollIntoView = vi.fn();
      HTMLElement.prototype.scrollIntoView = scrollIntoView;
      const onFileRevealed = vi.fn();

      const { rerender } = render(
        <LabelNavigator
          labels={labelsFromMultipleFiles}
          storyFiles={storyFilesFromLabels}
          activeLabelId={null}
          onSelect={vi.fn()}
        />
      );

      fireEvent.change(screen.getByPlaceholderText("Filter..."), {
        target: { value: "Label A" },
      });

      rerender(
        <LabelNavigator
          labels={labelsFromMultipleFiles}
          storyFiles={[
            ...storyFilesFromLabels,
            { id: "file-new", filePath: "chapters/new_scene.rpy" },
          ]}
          activeLabelId={null}
          onSelect={vi.fn()}
          revealFileId="file-new"
          sortResetToken={1}
          onFileRevealed={onFileRevealed}
        />
      );

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Filter...")).toHaveValue("");
      });
      await waitFor(() => {
        expect(scrollIntoView).toHaveBeenCalled();
      });
    });
  });

  describe("interactions", () => {
    it("calls onSelect when a label is clicked", () => {
      const onSelect = vi.fn();
      render(
        <LabelNavigator
          labels={labelsFromMultipleFiles}
          storyFiles={storyFilesFromLabels}
          activeLabelId={null}
          onSelect={onSelect}
        />
      );

      fireEvent.click(screen.getByText("Label A"));
      expect(onSelect).toHaveBeenCalledWith("1");
    });

    it("highlights the active label", () => {
      render(
        <LabelNavigator
          labels={labelsFromMultipleFiles}
          storyFiles={storyFilesFromLabels}
          activeLabelId="2"
          onSelect={vi.fn()}
        />
      );

      const activeButton = screen.getByText("Label B").closest("button")!;
      expect(activeButton).toHaveAttribute("aria-pressed", "true");
    });
  });

  describe("edge cases", () => {
    it("renders with labels from a single file", () => {
      const singleFileLabels = [
        makeLabel({ id: "1", title: "A", fileName: "story.rpy" }),
        makeLabel({ id: "2", title: "B", fileName: "story.rpy" }),
      ];

      render(
        <LabelNavigator
          labels={singleFileLabels}
          storyFiles={[{ id: "file-default", filePath: "story.rpy" }]}
          activeLabelId={null}
          onSelect={vi.fn()}
        />
      );

      expect(screen.getByText("story.rpy")).toBeInTheDocument();
      expect(screen.getAllByText("2 labels").length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("inline label creation", () => {
    it('shows "+" button for each file group', () => {
      render(
        <LabelNavigator
          labels={labelsFromMultipleFiles}
          storyFiles={storyFilesFromLabels}
          activeLabelId={null}
          onSelect={vi.fn()}
          onCreateLabel={vi.fn()}
        />
      );

      const addButtons = screen.getAllByText("Add label");
      expect(addButtons).toHaveLength(2);
    });

    it('shows input field when "+" button is clicked', async () => {
      const user = userEvent.setup();
      render(
        <LabelNavigator
          labels={labelsFromMultipleFiles}
          storyFiles={storyFilesFromLabels}
          activeLabelId={null}
          onSelect={vi.fn()}
          onCreateLabel={vi.fn()}
        />
      );

      const addButtons = screen.getAllByText("Add label");
      await user.click(addButtons[0]);

      expect(screen.getByPlaceholderText("Label title...")).toBeInTheDocument();
    });

    it("calls onCreateLabel when Enter is pressed with text", async () => {
      const user = userEvent.setup();
      const onCreateLabel = vi.fn().mockResolvedValue(undefined);
      render(
        <LabelNavigator
          labels={labelsFromMultipleFiles}
          storyFiles={storyFilesFromLabels}
          activeLabelId={null}
          onSelect={vi.fn()}
          onCreateLabel={onCreateLabel}
        />
      );

      const addButtons = screen.getAllByText("Add label");
      await user.click(addButtons[0]);

      const input = screen.getByPlaceholderText("Label title...");
      await user.type(input, "New Label");
      await user.keyboard("{Enter}");

      await waitFor(() => {
        expect(onCreateLabel).toHaveBeenCalledWith({
          title: "New Label",
          projectFileId: "file1",
        });
      });
    });

    it("hides input when Escape is pressed", async () => {
      const user = userEvent.setup();
      render(
        <LabelNavigator
          labels={labelsFromMultipleFiles}
          storyFiles={storyFilesFromLabels}
          activeLabelId={null}
          onSelect={vi.fn()}
          onCreateLabel={vi.fn()}
        />
      );

      const addButtons = screen.getAllByText("Add label");
      await user.click(addButtons[0]);

      expect(screen.getByPlaceholderText("Label title...")).toBeInTheDocument();

      await user.keyboard("{Escape}");

      expect(
        screen.queryByPlaceholderText("Label title...")
      ).not.toBeInTheDocument();
    });

    it("hides input when X button is clicked", async () => {
      const user = userEvent.setup();
      render(
        <LabelNavigator
          labels={labelsFromMultipleFiles}
          storyFiles={storyFilesFromLabels}
          activeLabelId={null}
          onSelect={vi.fn()}
          onCreateLabel={vi.fn()}
        />
      );

      const addButtons = screen.getAllByText("Add label");
      await user.click(addButtons[0]);

      expect(screen.getByPlaceholderText("Label title...")).toBeInTheDocument();

      const cancelButton = screen.getByLabelText("Cancel");
      await user.click(cancelButton);

      expect(
        screen.queryByPlaceholderText("Label title...")
      ).not.toBeInTheDocument();
    });

    it("disables add button during creation", () => {
      render(
        <LabelNavigator
          labels={labelsFromMultipleFiles}
          storyFiles={storyFilesFromLabels}
          activeLabelId={null}
          onSelect={vi.fn()}
          onCreateLabel={vi.fn()}
          isCreatingLabel={true}
        />
      );

      const addButtons = screen.getAllByText(
        "Add label"
      ) as HTMLButtonElement[];
      expect(addButtons[0]).toBeDisabled();
    });
  });
});
