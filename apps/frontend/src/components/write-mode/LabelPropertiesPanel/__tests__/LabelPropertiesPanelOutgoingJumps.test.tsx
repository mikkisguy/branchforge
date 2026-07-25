import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LabelDetail } from "@branchforge/shared";
import { LabelPropertiesPanelOutgoingJumps } from "../LabelPropertiesPanelOutgoingJumps";

function makeLabel(overrides: Partial<LabelDetail> = {}): LabelDetail {
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
    lines: [],
    characters: [],
    ...overrides,
  };
}

describe("LabelPropertiesPanelOutgoingJumps", () => {
  it("renders duplicate choiceText+target on different lines as separate items", async () => {
    const user = userEvent.setup();

    const activeLabel = makeLabel({
      lines: [
        {
          id: "line-1",
          labelId: "label-1",
          sequence: 1,
          contentType: "MENU",
          content: "",
          visualType: "GENERATED",
          visualPrompt: null,
          speakerId: null,
          speakerName: null,
          speakerTag: null,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
          conditions: null,
          visualStatements: null,
          menuOptions: [
            {
              label: "Ask about the mission",
              targetLabelId: "label-mission",
              targetLabelName: "Mission Label",
            },
          ],
        },
        {
          id: "line-2",
          labelId: "label-1",
          sequence: 2,
          contentType: "MENU",
          content: "",
          visualType: "GENERATED",
          visualPrompt: null,
          speakerId: null,
          speakerName: null,
          speakerTag: null,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
          conditions: null,
          visualStatements: null,
          menuOptions: [
            {
              label: "Ask about the mission",
              targetLabelId: "label-mission",
              targetLabelName: "Mission Label",
            },
          ],
        },
      ],
    });

    render(
      <LabelPropertiesPanelOutgoingJumps activeLabel={activeLabel} stats={[]} />
    );

    // CollapsibleSection starts closed; click the header button to open
    const toggle = screen.getByRole("button", {
      name: /outgoing jumps/i,
    });
    await user.click(toggle);

    // Both items with the same targetLabelName should be present
    expect(screen.getAllByText("Mission Label")).toHaveLength(2);

    // Both items with the same choiceText should be present
    expect(screen.getAllByText("Ask about the mission")).toHaveLength(2);
  });

  it("renders automatic JUMP lines with line-scoped id", async () => {
    const user = userEvent.setup();

    const activeLabel = makeLabel({
      lines: [
        {
          id: "line-3",
          labelId: "label-1",
          sequence: 1,
          contentType: "JUMP",
          content: "jump target_label",
          visualType: "GENERATED",
          visualPrompt: null,
          speakerId: null,
          speakerName: null,
          speakerTag: null,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
          conditions: null,
          visualStatements: null,
          menuOptions: null,
        },
      ],
    });

    render(
      <LabelPropertiesPanelOutgoingJumps activeLabel={activeLabel} stats={[]} />
    );

    const toggle = screen.getByRole("button", {
      name: /outgoing jumps/i,
    });
    await user.click(toggle);

    // target_label appears twice: as label name and as choice text
    expect(screen.getAllByText("target_label").length).toBe(2);
  });
});
