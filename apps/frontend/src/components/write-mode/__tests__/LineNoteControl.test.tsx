import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LineNoteControl } from "../LineNoteControl";

describe("LineNoteControl", () => {
  const entry = { id: "line-1", speakerId: null, text: "A line" };

  it("creates a script note from the line control", () => {
    const onChange = vi.fn();
    render(<LineNoteControl entry={entry} canEdit onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Add line note" }));
    fireEvent.change(screen.getByLabelText("Note text"), {
      target: { value: "Check pacing" },
    });
    fireEvent.click(screen.getByLabelText("Add to script"));
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));

    expect(onChange).toHaveBeenCalledWith({
      ...entry,
      note: { id: undefined, text: "Check pacing", storage: "SCRIPT" },
    });
  });

  it("shows a saved note without edit controls in read-only mode", () => {
    render(
      <LineNoteControl
        entry={{
          ...entry,
          note: { text: "Private reminder", storage: "BRANCHFORGE_ONLY" },
        }}
        canEdit={false}
        onChange={vi.fn()}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "View or edit line note" })
    );
    expect(
      screen.getByText("Private reminder", { selector: "p" })
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Save note" })).toBeNull();
  });
});
