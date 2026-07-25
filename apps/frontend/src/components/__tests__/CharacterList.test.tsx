import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Character } from "@branchforge/shared";
import { CharacterList } from "@/components/characters/CharacterList";

const mockCharacters: Character[] = [
  {
    id: "char-1",
    projectId: "test-project-id",
    name: "Eileen",
    displayName: "Eileen",
    renpyTag: "a",
    color: "#FF6B6B",
    routeAffiliation: "EILEEN",
    isLoveInterest: true,
    isNarrator: false,
    notes: "casual notes",
    conditionalPrefix: null,
    avatarUrl: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
];

describe("CharacterList", () => {
  it("shows a confirmation dialog before deleting a character", async () => {
    const user = userEvent.setup({ delay: null });
    const onEdit = vi.fn();
    const onDelete = vi.fn().mockResolvedValue(undefined);

    render(
      <CharacterList
        characters={mockCharacters}
        isSaving={false}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    );

    await user.click(screen.getByRole("button", { name: /delete eileen/i }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Delete Character" })
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /delete character/i }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith("char-1");
  });

  it("keeps the confirmation dialog open when deletion fails", async () => {
    const user = userEvent.setup({ delay: null });
    const onEdit = vi.fn();
    const onDelete = vi.fn().mockRejectedValue(new Error("delete failed"));

    render(
      <CharacterList
        characters={mockCharacters}
        isSaving={false}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    );

    await user.click(screen.getByRole("button", { name: /delete eileen/i }));
    await user.click(screen.getByRole("button", { name: /delete character/i }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith("char-1");
    expect(
      screen.getByRole("heading", { name: "Delete Character" })
    ).toBeInTheDocument();
  });
});
