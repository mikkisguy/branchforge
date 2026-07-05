import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
    isNarrator: false,
    dialogueStyle: "casual",
    conditionalPrefix: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
  {
    id: "narr-1",
    projectId: "project-1",
    name: "Narrator",
    displayName: "Narrator",
    renpyTag: "n",
    color: "#888888",
    avatarUrl: null,
    routeAffiliation: null,
    isLoveInterest: false,
    isNarrator: true,
    dialogueStyle: null,
    conditionalPrefix: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
];

const renderDialogueLine = (entry: DialogueEntry) =>
  render(
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
  );

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

  it("hides the textarea visually when blurred (default)", () => {
    const entry: DialogueEntry = {
      id: "entry-1",
      speakerId: null,
      text: "Hello world",
    };

    const { container } = renderDialogueLine(entry);

    // Textarea is aria-hidden when blurred (excluded from role queries).
    expect(screen.queryByRole("textbox")).toBeNull();

    // Rendered line overlay is present and keyboard-accessible.
    expect(container.querySelector("[data-rendered-line]")).toBeInTheDocument();
  });

  it("focuses the textarea when the rendered line is clicked", async () => {
    const user = userEvent.setup();
    const entry: DialogueEntry = {
      id: "entry-1",
      speakerId: null,
      text: "Hello world",
    };

    const { container } = renderDialogueLine(entry);

    // Click the rendered line overlay to enter edit mode.
    await user.click(container.querySelector("[data-rendered-line-wrapper]")!);

    // Textarea is now visible and accessible.
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea).toBeInTheDocument();

    // Rendered line overlay is gone.
    expect(
      container.querySelector("[data-rendered-line]")
    ).not.toBeInTheDocument();

    // The polyfill in test/setup.ts makes caretPositionFromPoint return the
    // end of the first text node under the rendered-line overlay. For the
    // 11-char "Hello world" text token (rawLen === renderedLen), the
    // 1:1 mapping in getRawOffsetFromPoint translates that to raw offset 11,
    // which handleRenderedLineClick then sets as a collapsed caret via
    // setSelectionRange(11, 11).
    expect(textarea.selectionStart).toBe(11);
    expect(textarea.selectionEnd).toBe(11);
  });

  it("hides the textarea visually when blurred again", async () => {
    const user = userEvent.setup();
    const entry: DialogueEntry = {
      id: "entry-1",
      speakerId: null,
      text: "Hello world",
    };

    const { container } = renderDialogueLine(entry);

    // Enter edit mode by clicking the overlay.
    await user.click(container.querySelector("[data-rendered-line-wrapper]")!);
    const textarea = screen.getByRole("textbox");
    expect(textarea).toBeInTheDocument();

    // Blur the textarea.
    fireEvent.blur(textarea);

    // Textarea is aria-hidden again, rendered line is back.
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(container.querySelector("[data-rendered-line]")).toBeInTheDocument();
  });

  it("renders tokenized content in the blurred state", () => {
    const entry: DialogueEntry = {
      id: "entry-1",
      speakerId: null,
      text: "{b}hello{/b}",
    };

    const { container } = renderDialogueLine(entry);

    // Tags are hidden — only the styled content "hello" is visible.
    const renderedLine = container.querySelector("[data-rendered-line]");
    expect(renderedLine).toBeInTheDocument();
    expect(renderedLine?.textContent).toBe("hello");

    // The content span has bold styling.
    const spans = renderedLine?.querySelectorAll(":scope > span");
    const helloSpan = Array.from(spans ?? []).find(
      (s) => s.textContent === "hello"
    );
    expect(helloSpan).toBeDefined();
    expect((helloSpan as HTMLElement)?.style.fontWeight).toBe("bold");
  });

  it("applies narrator styling (italic + muted color) to speaker button and textarea", async () => {
    const user = userEvent.setup();
    const entry: DialogueEntry = {
      id: "entry-narr",
      speakerId: "narr-1",
      text: "Once upon a time...",
    };

    const { container } = render(
      <DialogueLine
        entry={entry}
        characters={characters}
        layoutMode="stacked"
        index={0}
        totalEntries={2}
        onChange={vi.fn()}
        onDelete={vi.fn()}
        onMoveUp={vi.fn()}
        onMoveDown={vi.fn()}
      />
    );

    // Speaker button has italic + muted-foreground for narrator characters
    const speakerButton = screen.getByRole("button", {
      name: /change speaker/i,
    });
    expect(speakerButton.style.fontStyle).toBe("italic");
    expect(speakerButton.style.color).toBe("hsl(var(--muted-foreground))");

    // Click the rendered line overlay to enter edit mode
    await user.click(container.querySelector("[data-rendered-line-wrapper]")!);

    // Textarea has italic style for narrator content
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea.style.fontStyle).toBe("italic");
  });
});
