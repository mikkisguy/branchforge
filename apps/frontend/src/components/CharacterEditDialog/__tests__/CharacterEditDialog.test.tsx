import { expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Character } from "@branchforge/shared";
import { useCharacters } from "@/hooks/useCharacters";
import { CharacterEditDialog } from "../CharacterEditDialog";

vi.mock("@/hooks/useCharacters");
vi.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({ error: vi.fn() }),
}));

it.each(["Original notes", null])(
  "restores opening notes (%s) after a partial save",
  async (originalNotes) => {
    const character: Character = {
      id: "character-1",
      projectId: "project-1",
      name: "Eileen",
      displayName: "Eileen",
      nameType: "literal",
      renpyTag: "eileen",
      color: "#123456",
      avatarUrl: null,
      isLoveInterest: false,
      isNarrator: false,
      notes: originalNotes,
      createdAt: "2026-11-21T12:00:00.000Z",
      updatedAt: "2026-11-21T12:00:00.000Z",
    };
    const updated = { ...character, notes: "Edited notes" };
    const updateCharacter = vi
      .fn()
      .mockResolvedValueOnce(updated)
      .mockResolvedValueOnce(character);
    const uploadAvatar = vi
      .fn()
      .mockRejectedValueOnce(new Error("Avatar upload failed"))
      .mockResolvedValueOnce({ avatarUrl: "/avatars/eileen.png" });
    const hook = {
      characters: [character],
      isLoadingCharacters: false,
      charactersError: null,
      isCreatingCharacter: false,
      isUpdatingCharacter: false,
      isDeletingCharacter: false,
      isUploadingAvatar: false,
      isDeletingAvatar: false,
      refreshCharacters: vi.fn(),
      createCharacter: vi.fn(),
      updateCharacter,
      deleteCharacter: vi.fn(),
      uploadAvatar,
      deleteAvatar: vi.fn(),
    };
    vi.mocked(useCharacters).mockReturnValue(hook);
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:avatar");
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    try {
      const props = {
        open: true,
        projectId: character.projectId,
        characterId: character.id,
        onOpenChange: vi.fn(),
      };
      const { rerender } = render(<CharacterEditDialog {...props} />);
      const notes = screen.getByLabelText("Notes");
      const save = screen.getByRole("button", { name: "Save" });
      const avatar = new File(["avatar"], "avatar.png", { type: "image/png" });
      fireEvent.change(notes, { target: { value: updated.notes } });
      fireEvent.change(screen.getByLabelText("Avatar Image"), {
        target: { files: [avatar] },
      });
      fireEvent.click(save);
      await waitFor(() => expect(uploadAvatar).toHaveBeenCalledTimes(1));
      expect(updateCharacter).toHaveBeenNthCalledWith(
        1,
        character.id,
        expect.objectContaining({ notes: updated.notes })
      );
      expect(props.onOpenChange).not.toHaveBeenCalled();

      vi.mocked(useCharacters).mockReturnValue({
        ...hook,
        characters: [updated],
      });
      rerender(<CharacterEditDialog {...props} />);
      fireEvent.change(notes, { target: { value: originalNotes ?? "" } });
      fireEvent.click(save);

      await waitFor(() =>
        expect(props.onOpenChange).toHaveBeenCalledWith(false)
      );
      expect(updateCharacter).toHaveBeenNthCalledWith(
        2,
        character.id,
        expect.objectContaining({ notes: originalNotes })
      );
    } finally {
      createObjectURL.mockRestore();
      revokeObjectURL.mockRestore();
    }
  }
);
