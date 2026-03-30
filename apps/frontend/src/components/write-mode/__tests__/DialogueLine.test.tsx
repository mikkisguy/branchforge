import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Character } from "@branchforge/shared";
import type { DialogueEntry } from "@/lib/prose-types";
import { DialogueLine } from "../DialogueLine";

const characters: Character[] = [
  {
    id: "char-1",
    projectId: "project-1",
    name: "Eileen",
    displayName: "Eileen",
    renpyTag: "a",
    color: "#FF6B6B",
    avatarUrl: null,
    routeAffiliation: "EILEEN",
    isLoveInterest: true,
    dialogueStyle: "casual",
    conditionalPrefix: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
];

describe("DialogueLine", () => {
  it("speaker dropdown options have tabindex=-1 to prevent direct tab navigation", async () => {
    const entry: DialogueEntry = {
      id: "entry-1",
      speakerId: null,
      text: "Narration text",
    };

    render(
      <div>
        <DialogueLine
          entry={entry}
          characters={characters}
          layoutMode="stacked"
          index={0}
          totalEntries={1}
          onChange={vi.fn()}
          onDelete={vi.fn()}
          onMoveUp={vi.fn()}
          onMoveDown={vi.fn()}
        />
        <button type="button">After line</button>
      </div>
    );

    await userEvent.click(
      screen.getByRole("button", { name: /change speaker: narration/i })
    );

    expect(
      screen.getByRole("listbox", { name: /select speaker/i })
    ).toBeInTheDocument();

    for (const option of screen.getAllByRole("option")) {
      expect(option).toHaveAttribute("tabindex", "-1");
    }
  });
});
