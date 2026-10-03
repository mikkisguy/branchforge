import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Character, LabelDetail } from "@branchforge/shared";
import { LabelPropertiesPanelCharacters } from "../LabelPropertiesPanelCharacters";

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    projectId: "proj1",
    name: "alice",
    displayName: "Alice",
    nameType: "literal",
    renpyTag: "alice",
    color: "#FF6B6B",
    avatarUrl: null,
    isLoveInterest: false,
    isNarrator: false,
    notes: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeLabel(
  characters: Character[],
  overrides: Partial<LabelDetail> = {}
): LabelDetail {
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
    characters,
    ...overrides,
  };
}

describe("LabelPropertiesPanelCharacters", () => {
  it("renders avatar image when the in-label character has an avatarUrl", () => {
    const char = makeCharacter({ avatarUrl: "/avatars/alice.png" });
    render(
      <LabelPropertiesPanelCharacters
        activeLabel={makeLabel([char])}
        characters={[char]}
      />
    );

    const img = screen.getByAltText("");
    expect(img).toHaveAttribute("src", "/avatars/alice.png");
    expect(screen.queryByText("A")).not.toBeInTheDocument();
  });

  it("falls back to the initial circle when the character has no avatarUrl", () => {
    const char = makeCharacter({ avatarUrl: null });
    render(
      <LabelPropertiesPanelCharacters
        activeLabel={makeLabel([char])}
        characters={[char]}
      />
    );

    expect(screen.queryByAltText("")).not.toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("falls back to the initial circle when the image fails to load", () => {
    const char = makeCharacter({ avatarUrl: "/avatars/broken.png" });
    render(
      <LabelPropertiesPanelCharacters
        activeLabel={makeLabel([char])}
        characters={[char]}
      />
    );

    const img = screen.getByAltText("");
    fireEvent.error(img);

    expect(screen.queryByAltText("")).not.toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("retries the image when the avatar URL changes after a load error", () => {
    const char = makeCharacter({ avatarUrl: "/avatars/broken.png" });
    const { rerender } = render(
      <LabelPropertiesPanelCharacters
        activeLabel={makeLabel([char])}
        characters={[char]}
      />
    );

    fireEvent.error(screen.getByAltText(""));
    expect(screen.queryByAltText("")).not.toBeInTheDocument();

    // Avatar replaced (e.g. re-upload): the new URL must be retried
    const updated = makeCharacter({ avatarUrl: "/avatars/alice-v2.png" });
    rerender(
      <LabelPropertiesPanelCharacters
        activeLabel={makeLabel([updated])}
        characters={[updated]}
      />
    );

    const img = screen.getByAltText("");
    expect(img).toHaveAttribute("src", "/avatars/alice-v2.png");
  });

  it("falls back to the initial circle when the avatar is removed", () => {
    const char = makeCharacter({ avatarUrl: "/avatars/alice.png" });
    const { rerender } = render(
      <LabelPropertiesPanelCharacters
        activeLabel={makeLabel([char])}
        characters={[char]}
      />
    );

    expect(screen.getByAltText("")).toBeInTheDocument();

    // Avatar deleted: characters prop no longer carries a URL
    const updated = makeCharacter({ avatarUrl: null });
    rerender(
      <LabelPropertiesPanelCharacters
        activeLabel={makeLabel([updated])}
        characters={[updated]}
      />
    );

    expect(screen.queryByAltText("")).not.toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("invokes onCharacterEdit when an in-label character row is clicked", async () => {
    const user = userEvent.setup();
    const onCharacterEdit = vi.fn();
    const char = makeCharacter();
    render(
      <LabelPropertiesPanelCharacters
        activeLabel={makeLabel([char])}
        characters={[char]}
        onCharacterEdit={onCharacterEdit}
      />
    );

    await user.click(screen.getByText("Alice"));
    expect(onCharacterEdit).toHaveBeenCalledWith("char-1");
  });

  it("renders read-only rows when onCharacterEdit is not provided", () => {
    const char = makeCharacter();
    render(
      <LabelPropertiesPanelCharacters
        activeLabel={makeLabel([char])}
        characters={[char]}
      />
    );

    expect(
      screen.queryByRole("button", { name: /alice/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("renders love interest and narrator role icons", () => {
    const love = makeCharacter({
      id: "char-love",
      displayName: "Bob",
      isLoveInterest: true,
    });
    const narrator = makeCharacter({
      id: "char-narrator",
      displayName: "Nina",
      isNarrator: true,
    });
    const { container } = render(
      <LabelPropertiesPanelCharacters
        activeLabel={makeLabel([love, narrator])}
        characters={[love, narrator]}
      />
    );

    expect(
      container.querySelector('[data-character-role-icon="love-interest"]')
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-character-role-icon="narrator"]')
    ).toBeInTheDocument();
  });

  it("shows the empty state when the project has no characters", () => {
    render(
      <LabelPropertiesPanelCharacters
        activeLabel={makeLabel([])}
        characters={[]}
      />
    );

    expect(screen.getByText("No characters in project")).toBeInTheDocument();
  });

  it("shows the empty state when the label has no characters", () => {
    const char = makeCharacter();
    render(
      <LabelPropertiesPanelCharacters
        activeLabel={makeLabel([])}
        characters={[char]}
      />
    );

    expect(screen.getByText("No characters in this label")).toBeInTheDocument();
  });
});
