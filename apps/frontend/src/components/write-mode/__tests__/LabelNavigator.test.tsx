import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { PublicLabel } from "@branchforge/shared";
import { LabelNavigator } from "../LabelNavigator";

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
    projectFileId: null,
    fileName: null,
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
  makeLabel({
    id: "4",
    title: "Unassociated",
    fileName: null,
    projectFileId: null,
    sequenceOrder: 3,
    labelNumber: 1,
  }),
];

describe("LabelNavigator", () => {
  describe("file grouping", () => {
    it("groups labels by fileName", () => {
      render(
        <LabelNavigator
          labels={labelsFromMultipleFiles}
          activeLabelId={null}
          onSelect={vi.fn()}
        />
      );

      expect(screen.getByText("act_i.rpy")).toBeInTheDocument();
      expect(screen.getByText("act_ii.rpy")).toBeInTheDocument();
    });

    it("shows 'Unassociated Labels' group for labels with null fileName", () => {
      render(
        <LabelNavigator
          labels={labelsFromMultipleFiles}
          activeLabelId={null}
          onSelect={vi.fn()}
        />
      );

      expect(screen.getByText("Unassociated Labels")).toBeInTheDocument();
    });

    it("shows correct label counts per file", () => {
      render(
        <LabelNavigator
          labels={labelsFromMultipleFiles}
          activeLabelId={null}
          onSelect={vi.fn()}
        />
      );

      expect(screen.getAllByText("2 labels").length).toBeGreaterThanOrEqual(1);
      // act_ii.rpy and Unassociated Labels both have 1 label each
      expect(screen.getAllByText("1 label").length).toBe(2);
    });
  });

  describe("sorting", () => {
    it("sorts file groups alphabetically with 'Unassociated Labels' last", () => {
      render(
        <LabelNavigator
          labels={labelsFromMultipleFiles}
          activeLabelId={null}
          onSelect={vi.fn()}
        />
      );

      const groups = screen
        .getAllByText(/\.rpy|Unassociated Labels/)
        .map((el) => el.textContent);
      const actIIndex = groups.indexOf("act_i.rpy");
      const actIiIndex = groups.indexOf("act_ii.rpy");
      const unassocIndex = groups.indexOf("Unassociated Labels");

      expect(actIIndex).toBeLessThan(actIiIndex);
      expect(actIiIndex).toBeLessThan(unassocIndex);
    });

    it("sorts labels within each group by sequenceOrder", () => {
      render(
        <LabelNavigator
          labels={labelsFromMultipleFiles}
          activeLabelId={null}
          onSelect={vi.fn()}
        />
      );

      const buttons = screen
        .getAllByRole("button")
        .filter((b) => b.textContent?.match(/Label|Unassociated/));
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
    it("shows empty state when no labels", () => {
      render(
        <LabelNavigator labels={[]} activeLabelId={null} onSelect={vi.fn()} />
      );

      expect(screen.getByText("No labels found")).toBeInTheDocument();
    });
  });

  describe("interactions", () => {
    it("calls onSelect when a label is clicked", () => {
      const onSelect = vi.fn();
      render(
        <LabelNavigator
          labels={labelsFromMultipleFiles}
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
          activeLabelId={null}
          onSelect={vi.fn()}
        />
      );

      expect(screen.getByText("story.rpy")).toBeInTheDocument();
      expect(screen.getAllByText("2 labels").length).toBeGreaterThanOrEqual(1);
    });

    it("renders with only unassociated labels", () => {
      const unassocLabels = [
        makeLabel({ id: "1", title: "A", fileName: null }),
        makeLabel({ id: "2", title: "B", fileName: null }),
      ];

      render(
        <LabelNavigator
          labels={unassocLabels}
          activeLabelId={null}
          onSelect={vi.fn()}
        />
      );

      expect(screen.getByText("Unassociated Labels")).toBeInTheDocument();
      expect(screen.getAllByText("2 labels").length).toBeGreaterThanOrEqual(1);
    });
  });
});
