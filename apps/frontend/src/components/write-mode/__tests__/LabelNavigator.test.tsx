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

vi.mock("@/hooks/useMeters", () => ({
  useMeters: vi.fn(() => ({
    meters: [],
    isLoadingMeters: false,
    metersError: null,
    progression: [],
    isLoadingProgression: false,
    progressionError: null,
    isCreatingMeter: false,
    isUpdatingMeter: false,
    isDeletingMeter: false,
    refreshMeters: vi.fn(),
    refreshProgression: vi.fn(),
    createMeter: vi.fn(),
    updateMeter: vi.fn(),
    deleteMeter: vi.fn(),
  })),
}));

vi.mock("@/hooks/useStateVariables", () => ({
  useStateVariables: vi.fn(() => ({
    stateVariables: [],
    isLoadingStateVariables: false,
    stateVariablesError: null,
    isCreatingStateVariable: false,
    isUpdatingStateVariable: false,
    isDeletingStateVariable: false,
    refreshStateVariables: vi.fn(),
    createStateVariable: vi.fn(),
    updateStateVariable: vi.fn(),
    deleteStateVariable: vi.fn(),
  })),
}));

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
    prerequisites: null,
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

describe("LabelNavigator", () => {
  describe("file grouping", () => {
    it("groups labels by fileName", () => {
      render(
        <LabelNavigator
          projectId="proj1"
          labels={labelsFromMultipleFiles}
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
          projectId="proj1"
          labels={labelsFromMultipleFiles}
          activeLabelId={null}
          onSelect={vi.fn()}
        />
      );

      const actIHeader = screen.getByText("act_i.rpy").parentElement!;
      const actIiHeader = screen.getByText("act_ii.rpy").parentElement!;
      expect(within(actIHeader).getByText("2")).toBeInTheDocument();
      expect(within(actIiHeader).getByText("1")).toBeInTheDocument();
    });
  });

  describe("sorting", () => {
    it("sorts file groups alphabetically", () => {
      render(
        <LabelNavigator
          projectId="proj1"
          labels={labelsFromMultipleFiles}
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
          projectId="proj1"
          labels={labelsFromMultipleFiles}
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
    it("shows empty state when no labels", () => {
      render(
        <LabelNavigator
          projectId="proj1"
          labels={[]}
          activeLabelId={null}
          onSelect={vi.fn()}
        />
      );

      expect(screen.getByText("No labels found")).toBeInTheDocument();
    });
  });

  describe("interactions", () => {
    it("calls onSelect when a label is clicked", () => {
      const onSelect = vi.fn();
      render(
        <LabelNavigator
          projectId="proj1"
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
          projectId="proj1"
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
          projectId="proj1"
          labels={singleFileLabels}
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
          projectId="proj1"
          labels={labelsFromMultipleFiles}
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
          projectId="proj1"
          labels={labelsFromMultipleFiles}
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
          projectId="proj1"
          labels={labelsFromMultipleFiles}
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
          projectId="proj1"
          labels={labelsFromMultipleFiles}
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
          projectId="proj1"
          labels={labelsFromMultipleFiles}
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
          projectId="proj1"
          labels={labelsFromMultipleFiles}
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
