import * as keyboardShortcuts from "@/lib/keyboard-shortcuts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import type { Character } from "@branchforge/shared";
import type { DialogueEntry } from "@/lib/prose-types";
import { createTestQueryClient } from "@/test/query-client";
import { DialogueLine } from "../DialogueLine";
import type { ReactElement } from "react";

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
    nameType: "literal",
    isLoveInterest: true,
    isNarrator: false,
    notes: "casual notes",
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
    nameType: "literal",
    isLoveInterest: false,
    isNarrator: true,
    notes: null,
    conditionalPrefix: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
];

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

type DialogueLineOverrides = Partial<
  Omit<React.ComponentProps<typeof DialogueLine>, "entry" | "characters">
>;

const renderDialogueLine = (
  entry: DialogueEntry,
  overrides: DialogueLineOverrides = {}
) => {
  const handlers = {
    onChange: vi.fn(),
    onDelete: vi.fn(),
    onMoveUp: vi.fn(),
    onMoveDown: vi.fn(),
    onAddLine: vi.fn(),
    index: 0,
    totalEntries: 1,
    ...overrides,
  };

  return renderWithQueryClient(
    <DialogueLine
      entry={entry}
      characters={characters}
      layoutMode="stacked"
      {...handlers}
    />
  );
};

async function focusDialogueTextarea(container: HTMLElement) {
  const user = userEvent.setup();
  await user.click(container.querySelector("[data-rendered-line-wrapper]")!);
  return screen.getByRole("textbox") as HTMLTextAreaElement;
}

describe("DialogueLine", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("speaker dropdown options have tabindex=-1 to prevent direct tab navigation", async () => {
    const entry: DialogueEntry = {
      id: "entry-1",
      speakerId: null,
      text: "Narration text",
    };

    renderWithQueryClient(
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

  describe("keyboard shortcuts", () => {
    it("Enter adds a line via onAddLine", async () => {
      const onAddLine = vi.fn();
      const entry: DialogueEntry = {
        id: "entry-1",
        speakerId: null,
        text: "Hello world",
      };

      const { container } = renderDialogueLine(entry, {
        onAddLine,
        index: 2,
        totalEntries: 4,
      });

      const textarea = await focusDialogueTextarea(container);
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

      expect(onAddLine).toHaveBeenCalledWith(2);
    });

    it("Shift+Enter does not add a line", async () => {
      const onAddLine = vi.fn();
      const entry: DialogueEntry = {
        id: "entry-1",
        speakerId: null,
        text: "Hello world",
      };

      const { container } = renderDialogueLine(entry, { onAddLine });
      const textarea = await focusDialogueTextarea(container);

      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

      expect(onAddLine).not.toHaveBeenCalled();
    });

    it("Backspace on an empty non-choice line deletes when totalEntries > 1", async () => {
      const onDelete = vi.fn();
      const entry: DialogueEntry = {
        id: "entry-1",
        speakerId: null,
        text: "",
      };

      const { container } = renderDialogueLine(entry, {
        onDelete,
        totalEntries: 2,
      });
      const textarea = await focusDialogueTextarea(container);

      fireEvent.keyDown(textarea, { key: "Backspace" });

      expect(onDelete).toHaveBeenCalledTimes(1);
    });

    it("Backspace on a non-empty line does not delete", async () => {
      const onDelete = vi.fn();
      const entry: DialogueEntry = {
        id: "entry-1",
        speakerId: null,
        text: "Still here",
      };

      const { container } = renderDialogueLine(entry, {
        onDelete,
        totalEntries: 2,
      });
      const textarea = await focusDialogueTextarea(container);

      fireEvent.keyDown(textarea, { key: "Backspace" });

      expect(onDelete).not.toHaveBeenCalled();
    });

    it("Ctrl/Meta+ArrowUp calls onMoveUp when not the first line", async () => {
      const onMoveUp = vi.fn();
      const entry: DialogueEntry = {
        id: "entry-2",
        speakerId: null,
        text: "Second line",
      };

      const { container } = renderDialogueLine(entry, {
        onMoveUp,
        index: 1,
        totalEntries: 3,
      });
      const textarea = await focusDialogueTextarea(container);

      fireEvent.keyDown(textarea, {
        key: "ArrowUp",
        ctrlKey: true,
      });
      expect(onMoveUp).toHaveBeenCalledTimes(1);

      onMoveUp.mockClear();
      vi.spyOn(keyboardShortcuts.shortcutPlatformApi, "detect").mockReturnValue(
        "mac"
      );
      fireEvent.keyDown(textarea, {
        key: "ArrowUp",
        metaKey: true,
      });
      expect(onMoveUp).toHaveBeenCalledTimes(1);
    });

    it("does not call onMoveUp at the first line", async () => {
      const onMoveUp = vi.fn();
      const entry: DialogueEntry = {
        id: "entry-1",
        speakerId: null,
        text: "First line",
      };

      const { container } = renderDialogueLine(entry, {
        onMoveUp,
        index: 0,
        totalEntries: 3,
      });
      const textarea = await focusDialogueTextarea(container);

      fireEvent.keyDown(textarea, {
        key: "ArrowUp",
        ctrlKey: true,
      });

      expect(onMoveUp).not.toHaveBeenCalled();
    });

    it("Ctrl/Meta+ArrowDown calls onMoveDown when not the last line", async () => {
      const onMoveDown = vi.fn();
      const entry: DialogueEntry = {
        id: "entry-1",
        speakerId: null,
        text: "First line",
      };

      const { container } = renderDialogueLine(entry, {
        onMoveDown,
        index: 0,
        totalEntries: 3,
      });
      const textarea = await focusDialogueTextarea(container);

      fireEvent.keyDown(textarea, {
        key: "ArrowDown",
        ctrlKey: true,
      });
      expect(onMoveDown).toHaveBeenCalledTimes(1);

      onMoveDown.mockClear();
      vi.spyOn(keyboardShortcuts.shortcutPlatformApi, "detect").mockReturnValue(
        "mac"
      );
      fireEvent.keyDown(textarea, {
        key: "ArrowDown",
        metaKey: true,
      });
      expect(onMoveDown).toHaveBeenCalledTimes(1);
    });

    it("does not call onMoveDown at the last line", async () => {
      const onMoveDown = vi.fn();
      const entry: DialogueEntry = {
        id: "entry-3",
        speakerId: null,
        text: "Last line",
      };

      const { container } = renderDialogueLine(entry, {
        onMoveDown,
        index: 2,
        totalEntries: 3,
      });
      const textarea = await focusDialogueTextarea(container);

      fireEvent.keyDown(textarea, {
        key: "ArrowDown",
        ctrlKey: true,
      });

      expect(onMoveDown).not.toHaveBeenCalled();
    });
    it("Ctrl+Shift+ArrowUp does not move line up", async () => {
      const onMoveUp = vi.fn();
      const entry: DialogueEntry = {
        id: "entry-2",
        speakerId: null,
        text: "Second line",
      };

      const { container } = renderDialogueLine(entry, {
        onMoveUp,
        index: 1,
        totalEntries: 3,
      });
      const textarea = await focusDialogueTextarea(container);

      fireEvent.keyDown(textarea, {
        key: "ArrowUp",
        ctrlKey: true,
        shiftKey: true,
      });

      expect(onMoveUp).not.toHaveBeenCalled();
    });

    it("Backspace on sole empty non-choice line does not delete", async () => {
      const onDelete = vi.fn();
      const entry: DialogueEntry = {
        id: "entry-1",
        speakerId: null,
        text: "",
      };

      const { container } = renderDialogueLine(entry, {
        onDelete,
        totalEntries: 1,
      });
      const textarea = await focusDialogueTextarea(container);

      fireEvent.keyDown(textarea, { key: "Backspace" });

      expect(onDelete).not.toHaveBeenCalled();
    });

    it("Backspace on empty choice line does not delete", async () => {
      const onDelete = vi.fn();
      const entry: DialogueEntry = {
        id: "choice-1",
        speakerId: null,
        text: "",
        contentType: "CHOICE",
        choiceData: {
          lineId: "choice-1",
          optionIndex: 0,
          targetLabelId: "label-next",
          targetLabelName: "next_scene",
        },
      };

      const { container } = renderDialogueLine(entry, {
        onDelete,
        totalEntries: 2,
      });
      const textarea = await focusDialogueTextarea(container);

      fireEvent.keyDown(textarea, { key: "Backspace" });

      expect(onDelete).not.toHaveBeenCalled();
    });
  });

  it("applies narrator styling (italic + muted color) to speaker button and textarea", async () => {
    const user = userEvent.setup();
    const entry: DialogueEntry = {
      id: "entry-narr",
      speakerId: "narr-1",
      text: "Once upon a time...",
    };

    const { container } = renderWithQueryClient(
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
