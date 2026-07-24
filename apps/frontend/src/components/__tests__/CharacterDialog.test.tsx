/**
 * CharacterDialog Component Tests
 *
 * Tests for the CharacterDialog refactored to use CharacterList + CharacterEditDialog.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { CharacterDialog } from "../CharacterDialog";
import type { CharacterEditDialogProps } from "../CharacterEditDialog";
import type { Character } from "@branchforge/shared";
import { createTestQueryClient } from "@/test/query-client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Mock the toast context
export const mockToastSuccess = vi.fn();
export const mockToastError = vi.fn();

vi.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({
    success: mockToastSuccess,
    error: mockToastError,
  }),
}));

// Mock the useCharacters hook
vi.mock("@/hooks/useCharacters", () => ({
  useCharacters: vi.fn(),
}));

// Mock the lazy CharacterEditDialog wrapper to render immediately
vi.mock("../CharacterEditDialog/CharacterEditDialog.lazy", () => {
  const MockCharacterEditDialog = ({
    open,
    onOpenChange,
    characterId,
  }: CharacterEditDialogProps) => {
    if (!open) return null;

    // Pre-fill data for editing character "char-1" (Eileen)
    const isEditingEileen = characterId === "char-1";

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {characterId ? "Edit Character" : "Add Character"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label htmlFor="name">Name *</label>
              <input
                id="name"
                type="text"
                value={isEditingEileen ? "Eileen" : ""}
                readOnly
                aria-label="Name *"
              />
            </div>
            <div>
              <label htmlFor="displayName">Display Name *</label>
              <input
                id="displayName"
                type="text"
                value={isEditingEileen ? "Eileen" : ""}
                readOnly
                aria-label="Display Name *"
              />
            </div>
            <div>
              <label htmlFor="renpyTag">Ren'Py Tag *</label>
              <input
                id="renpyTag"
                type="text"
                value={isEditingEileen ? "a" : ""}
                readOnly
                aria-label="Ren'Py Tag *"
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  return { CharacterEditDialog: MockCharacterEditDialog };
});

import { useCharacters } from "@/hooks/useCharacters";

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
  {
    id: "char-2",
    projectId: "test-project-id",
    name: "Lucas",
    displayName: "Lucas",
    renpyTag: "l",
    color: "#4ECDC4",
    routeAffiliation: "LUCAS",
    isLoveInterest: true,
    isNarrator: false,
    notes: "formal notes",
    conditionalPrefix: "lucas_",
    avatarUrl: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
];

const mockUseCharactersDefault = {
  characters: [] as Character[],
  isLoadingCharacters: false,
  charactersError: null,
  isCreatingCharacter: false,
  isUpdatingCharacter: false,
  isDeletingCharacter: false,
  isUploadingAvatar: false,
  isDeletingAvatar: false,
  createCharacter: vi.fn(),
  updateCharacter: vi.fn(),
  deleteCharacter: vi.fn(),
  uploadAvatar: vi.fn(),
  deleteAvatar: vi.fn(),
  refreshCharacters: vi.fn(),
};

describe("CharacterDialog", () => {
  let queryClient: QueryClient;
  const projectId = "test-project-id";
  const onOpenChange = vi.fn();

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = createTestQueryClient();
    vi.clearAllMocks();
    mockToastSuccess.mockClear();
    mockToastError.mockClear();
    vi.mocked(useCharacters).mockReturnValue(mockUseCharactersDefault);
  });

  describe("Rendering", () => {
    it("should show loading state", () => {
      vi.mocked(useCharacters).mockReturnValue({
        ...mockUseCharactersDefault,
        isLoadingCharacters: true,
      });

      render(
        <CharacterDialog
          open={true}
          onOpenChange={onOpenChange}
          projectId={projectId}
        />,
        { wrapper }
      );

      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("should show error state", () => {
      vi.mocked(useCharacters).mockReturnValue({
        ...mockUseCharactersDefault,
        charactersError: new Error("Failed to fetch"),
      });

      render(
        <CharacterDialog
          open={true}
          onOpenChange={onOpenChange}
          projectId={projectId}
        />,
        { wrapper }
      );

      expect(
        screen.getByText(/failed to load characters/i)
      ).toBeInTheDocument();
    });

    it("should show empty state when no characters", () => {
      vi.mocked(useCharacters).mockReturnValue({
        ...mockUseCharactersDefault,
        characters: [],
      });

      render(
        <CharacterDialog
          open={true}
          onOpenChange={onOpenChange}
          projectId={projectId}
        />,
        { wrapper }
      );

      expect(
        screen.getByText(/no characters configured yet/i)
      ).toBeInTheDocument();
    });

    it("should display characters in list view", () => {
      vi.mocked(useCharacters).mockReturnValue({
        ...mockUseCharactersDefault,
        characters: mockCharacters,
      });

      render(
        <CharacterDialog
          open={true}
          onOpenChange={onOpenChange}
          projectId={projectId}
        />,
        { wrapper }
      );

      expect(screen.getByText("Eileen")).toBeInTheDocument();
      expect(screen.getByText("Lucas")).toBeInTheDocument();
    });
  });

  describe("Add Character", () => {
    it("should open CharacterEditDialog when clicking add button", async () => {
      const user = userEvent.setup({ delay: null });
      vi.mocked(useCharacters).mockReturnValue({
        ...mockUseCharactersDefault,
        characters: [],
      });

      render(
        <CharacterDialog
          open={true}
          onOpenChange={onOpenChange}
          projectId={projectId}
        />,
        { wrapper }
      );

      await user.click(screen.getByRole("button", { name: /add character/i }));

      // CharacterEditDialog should render with "Add Character" title
      expect(
        screen.getByRole("heading", { name: "Add Character" })
      ).toBeInTheDocument();
    });
  });

  describe("Edit Character", () => {
    it("should open CharacterEditDialog in edit mode with character data pre-filled", async () => {
      const user = userEvent.setup({ delay: null });
      vi.mocked(useCharacters).mockReturnValue({
        ...mockUseCharactersDefault,
        characters: mockCharacters,
      });

      render(
        <CharacterDialog
          open={true}
          onOpenChange={onOpenChange}
          projectId={projectId}
        />,
        { wrapper }
      );

      // Click edit button for Eileen
      const editButton = screen.getByRole("button", { name: /edit eileen/i });
      await user.click(editButton);

      // CharacterEditDialog should render with "Edit Character" title
      expect(
        await screen.findByRole("heading", { name: "Edit Character" })
      ).toBeInTheDocument();

      // Character's name should be pre-filled
      const nameInput = await screen.findByLabelText("Name *");
      expect(nameInput).toHaveValue("Eileen");

      // Character's display name should be pre-filled
      const displayNameInput = await screen.findByLabelText("Display Name *");
      expect(displayNameInput).toHaveValue("Eileen");

      // Character's renpyTag should be pre-filled
      const tagInput = await screen.findByLabelText("Ren'Py Tag *");
      expect(tagInput).toHaveValue("a");
    });
  });

  describe("Dialog Controls", () => {
    it("should close dialog when clicking footer close button", async () => {
      const user = userEvent.setup({ delay: null });
      vi.mocked(useCharacters).mockReturnValue({
        ...mockUseCharactersDefault,
        characters: [],
      });

      render(
        <CharacterDialog
          open={true}
          onOpenChange={onOpenChange}
          projectId={projectId}
        />,
        { wrapper }
      );

      await user.click(screen.getByRole("button", { name: "Close" }));

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
