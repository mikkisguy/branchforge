/**
 * LabelCharactersDialog Component Tests
 *
 * Tests for the LabelCharactersDialog component which manages label-character associations.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { LabelCharactersDialog } from "../LabelCharactersDialog";
import { labelsApi } from "@/lib/api/labels";
import { charactersApi } from "@/lib/api/characters";
import type { LabelCharacter, Character } from "@branchforge/shared";
import { createTestQueryClient } from "@/test/query-client";

// Mock the toast context
vi.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock the APIs
vi.mock("@/lib/api/labels", () => ({
  labelsApi: {
    getLabelCharacters: vi.fn(),
    addCharacterToLabel: vi.fn(),
    updateCharacterInLabel: vi.fn(),
    removeCharacterFromLabel: vi.fn(),
  },
}));

vi.mock("@/lib/api/characters", () => ({
  charactersApi: {
    listCharacters: vi.fn(),
  },
}));

const mockLabelCharacters: LabelCharacter[] = [
  {
    id: "char-1",
    name: "protagonist",
    displayName: "Protagonist",
    renpyTag: "p",
    notes: "Main character",
  },
  {
    id: "char-2",
    name: "antagonist",
    displayName: "Antagonist",
    renpyTag: "a",
    notes: "Villain",
  },
];

const mockAllCharacters: Character[] = [
  {
    id: "char-1",
    projectId: "test-project-id",
    name: "protagonist",
    displayName: "Protagonist",
    renpyTag: "p",
    color: "#FF6B6B",
    routeAffiliation: null,
    isLoveInterest: false,
    dialogueStyle: null,
    conditionalPrefix: null,
    avatarUrl: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
  {
    id: "char-2",
    projectId: "test-project-id",
    name: "antagonist",
    displayName: "Antagonist",
    renpyTag: "a",
    color: "#4ECDC4",
    routeAffiliation: null,
    isLoveInterest: false,
    dialogueStyle: null,
    conditionalPrefix: null,
    avatarUrl: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
  {
    id: "char-3",
    projectId: "test-project-id",
    name: "mentor",
    displayName: "Mentor",
    renpyTag: "m",
    color: "#95E1D3",
    routeAffiliation: null,
    isLoveInterest: false,
    dialogueStyle: null,
    conditionalPrefix: null,
    avatarUrl: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
];

describe("LabelCharactersDialog", () => {
  let queryClient: QueryClient;
  const onOpenChange = vi.fn();
  const labelId = "test-label-id";
  const labelTitle = "Test Label";
  const projectId = "test-project-id";

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = createTestQueryClient();
    vi.clearAllMocks();

    // Setup default mock implementations
    vi.mocked(labelsApi.getLabelCharacters).mockResolvedValue(
      mockLabelCharacters
    );
    vi.mocked(charactersApi.listCharacters).mockResolvedValue(
      mockAllCharacters
    );
    vi.mocked(labelsApi.addCharacterToLabel).mockResolvedValue(
      mockLabelCharacters[0]
    );
    vi.mocked(labelsApi.updateCharacterInLabel).mockResolvedValue(
      mockLabelCharacters[0]
    );
    vi.mocked(labelsApi.removeCharacterFromLabel).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Rendering", () => {
    it("should show loading state", () => {
      vi.mocked(labelsApi.getLabelCharacters).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );
      vi.mocked(charactersApi.listCharacters).mockResolvedValue(
        mockAllCharacters
      );

      render(
        <LabelCharactersDialog
          open={true}
          onOpenChange={onOpenChange}
          labelId={labelId}
          labelTitle={labelTitle}
          projectId={projectId}
        />,
        { wrapper }
      );

      expect(screen.getByText("Loading characters...")).toBeInTheDocument();
    });

    it("should render dialog with title and description", async () => {
      render(
        <LabelCharactersDialog
          open={true}
          onOpenChange={onOpenChange}
          labelId={labelId}
          labelTitle={labelTitle}
          projectId={projectId}
        />,
        { wrapper }
      );

      await waitFor(() => {
        expect(screen.getByText("Manage Characters")).toBeInTheDocument();
        expect(
          screen.getByText(
            `Assign characters to "${labelTitle}" and add notes.`
          )
        ).toBeInTheDocument();
      });
    });

    it("should render empty state when no characters assigned", async () => {
      vi.mocked(labelsApi.getLabelCharacters).mockResolvedValue([]);

      render(
        <LabelCharactersDialog
          open={true}
          onOpenChange={onOpenChange}
          labelId={labelId}
          labelTitle={labelTitle}
          projectId={projectId}
        />,
        { wrapper }
      );

      await waitFor(() => {
        expect(
          screen.getByText("No characters assigned to this label yet.")
        ).toBeInTheDocument();
      });
    });

    it("should render character list", async () => {
      render(
        <LabelCharactersDialog
          open={true}
          onOpenChange={onOpenChange}
          labelId={labelId}
          labelTitle={labelTitle}
          projectId={projectId}
        />,
        { wrapper }
      );

      await waitFor(() => {
        expect(screen.getByText("Protagonist")).toBeInTheDocument();
        expect(screen.getByText("Antagonist")).toBeInTheDocument();
      });
    });

    it("should show available characters in dropdown", async () => {
      render(
        <LabelCharactersDialog
          open={true}
          onOpenChange={onOpenChange}
          labelId={labelId}
          labelTitle={labelTitle}
          projectId={projectId}
        />,
        { wrapper }
      );

      await waitFor(() => {
        const dropdown = screen.getByLabelText("Add Character");
        expect(dropdown).toBeInTheDocument();
      });
    });
  });

  describe("Adding Characters", () => {
    it("should add character when selected and add button clicked", async () => {
      const user = userEvent.setup();
      const newCharacter: LabelCharacter = {
        id: "char-3",
        name: "mentor",
        displayName: "Mentor",
        renpyTag: "m",
        notes: null,
      };

      vi.mocked(labelsApi.addCharacterToLabel).mockResolvedValue(newCharacter);

      render(
        <LabelCharactersDialog
          open={true}
          onOpenChange={onOpenChange}
          labelId={labelId}
          labelTitle={labelTitle}
          projectId={projectId}
        />,
        { wrapper }
      );

      await waitFor(() => {
        const dropdown = screen.getByLabelText("Add Character");
        expect(dropdown).toBeInTheDocument();
      });

      // Select mentor character
      const dropdown = screen.getByLabelText("Add Character");
      await user.selectOptions(dropdown, "char-3");

      // Click add button
      const addButton = screen.getByRole("button", { name: /add/i });
      await user.click(addButton);

      await waitFor(() => {
        expect(labelsApi.addCharacterToLabel).toHaveBeenCalledWith(labelId, {
          characterId: "char-3",
          notes: null,
        });
      });
    });

    it("should disable add button when no character selected", async () => {
      render(
        <LabelCharactersDialog
          open={true}
          onOpenChange={onOpenChange}
          labelId={labelId}
          labelTitle={labelTitle}
          projectId={projectId}
        />,
        { wrapper }
      );

      await waitFor(() => {
        const addButton = screen.getByRole("button", { name: /add/i });
        expect(addButton).toBeDisabled();
      });
    });
  });

  describe("Editing Characters", () => {
    it("should enter edit mode when edit button clicked", async () => {
      const user = userEvent.setup();

      render(
        <LabelCharactersDialog
          open={true}
          onOpenChange={onOpenChange}
          labelId={labelId}
          labelTitle={labelTitle}
          projectId={projectId}
        />,
        { wrapper }
      );

      await waitFor(() => {
        expect(screen.getByText("Protagonist")).toBeInTheDocument();
      });

      // Find and click edit button for first character
      const editButtons = screen.getAllByRole("button", { name: "Edit" });
      await user.click(editButtons[0]);

      // Should show cancel and save buttons
      expect(
        screen.getByRole("button", { name: "Cancel" })
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
    });

    it("should update character when save button clicked", async () => {
      const user = userEvent.setup();
      const updatedCharacter: LabelCharacter = {
        ...mockLabelCharacters[0],
        notes: "Updated notes",
      };

      vi.mocked(labelsApi.updateCharacterInLabel).mockResolvedValue(
        updatedCharacter
      );

      render(
        <LabelCharactersDialog
          open={true}
          onOpenChange={onOpenChange}
          labelId={labelId}
          labelTitle={labelTitle}
          projectId={projectId}
        />,
        { wrapper }
      );

      await waitFor(() => {
        expect(screen.getByText("Protagonist")).toBeInTheDocument();
      });

      // Click edit button
      const editButtons = screen.getAllByRole("button", { name: "Edit" });
      await user.click(editButtons[0]);

      // Change notes
      const notesInput = screen.getByLabelText(/notes/i);
      await user.clear(notesInput);
      await user.type(notesInput, "Updated notes");

      // Click save button
      const saveButton = screen.getByRole("button", { name: /save/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(labelsApi.updateCharacterInLabel).toHaveBeenCalledWith(
          labelId,
          "char-1",
          {
            notes: "Updated notes",
          }
        );
      });
    });

    it("should cancel edit when cancel button clicked", async () => {
      const user = userEvent.setup();

      render(
        <LabelCharactersDialog
          open={true}
          onOpenChange={onOpenChange}
          labelId={labelId}
          labelTitle={labelTitle}
          projectId={projectId}
        />,
        { wrapper }
      );

      await waitFor(() => {
        expect(screen.getByText("Protagonist")).toBeInTheDocument();
      });

      // Click edit button
      const editButtons = screen.getAllByRole("button", { name: "Edit" });
      await user.click(editButtons[0]);

      // Change notes
      const notesInput = screen.getByLabelText(/notes/i);
      await user.clear(notesInput);
      await user.type(notesInput, "Cancelled notes");

      // Click cancel button
      const cancelButton = screen.getByRole("button", { name: "Cancel" });
      await user.click(cancelButton);

      // Should exit edit mode
      expect(
        screen.queryByRole("button", { name: "Cancel" })
      ).not.toBeInTheDocument();
      expect(labelsApi.updateCharacterInLabel).not.toHaveBeenCalled();
    });
  });

  describe("Removing Characters", () => {
    it("should remove character when delete button clicked and confirmed", async () => {
      const user = userEvent.setup();

      render(
        <LabelCharactersDialog
          open={true}
          onOpenChange={onOpenChange}
          labelId={labelId}
          labelTitle={labelTitle}
          projectId={projectId}
        />,
        { wrapper }
      );

      await waitFor(() => {
        expect(screen.getByText("Protagonist")).toBeInTheDocument();
      });

      // Click delete button for first character (uses aria-label)
      const deleteButtons = screen.getAllByRole("button", { name: /remove/i });
      await user.click(deleteButtons[0]);

      // ConfirmDialog should appear
      await waitFor(() => {
        expect(screen.getByText("Remove Character")).toBeInTheDocument();
      });

      // Click the confirm button in the ConfirmDialog
      const confirmButton = screen.getByRole("button", { name: "Remove" });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(labelsApi.removeCharacterFromLabel).toHaveBeenCalledWith(
          labelId,
          "char-1"
        );
      });
    });

    it("should not remove character when confirmation cancelled", async () => {
      const user = userEvent.setup();

      render(
        <LabelCharactersDialog
          open={true}
          onOpenChange={onOpenChange}
          labelId={labelId}
          labelTitle={labelTitle}
          projectId={projectId}
        />,
        { wrapper }
      );

      await waitFor(() => {
        expect(screen.getByText("Protagonist")).toBeInTheDocument();
      });

      // Click delete button for first character (uses aria-label)
      const deleteButtons = screen.getAllByRole("button", { name: /remove/i });
      await user.click(deleteButtons[0]);

      // ConfirmDialog should appear
      await waitFor(() => {
        expect(screen.getByText("Remove Character")).toBeInTheDocument();
      });

      // Click the cancel button in the ConfirmDialog
      const cancelButton = screen.getByRole("button", { name: "Cancel" });
      await user.click(cancelButton);

      // API should not be called
      expect(labelsApi.removeCharacterFromLabel).not.toHaveBeenCalled();
    });
  });

  describe("Dialog Actions", () => {
    it("should close dialog when close button clicked", async () => {
      const user = userEvent.setup();

      render(
        <LabelCharactersDialog
          open={true}
          onOpenChange={onOpenChange}
          labelId={labelId}
          labelTitle={labelTitle}
          projectId={projectId}
        />,
        { wrapper }
      );

      await waitFor(() => {
        expect(screen.getByText("Manage Characters")).toBeInTheDocument();
      });

      // Click close button in header (X icon button, before Manage Characters text)
      const closeButton = screen
        .getAllByRole("button")
        .find(
          (button) =>
            button.querySelector("svg") &&
            button.closest("div")?.querySelector("h2")?.textContent ===
              "Manage Characters"
        );

      expect(closeButton).toBeDefined();
      await user.click(closeButton!);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("should close dialog when footer close button clicked", async () => {
      const user = userEvent.setup();

      render(
        <LabelCharactersDialog
          open={true}
          onOpenChange={onOpenChange}
          labelId={labelId}
          labelTitle={labelTitle}
          projectId={projectId}
        />,
        { wrapper }
      );

      await waitFor(() => {
        expect(screen.getByText("Manage Characters")).toBeInTheDocument();
      });

      // Click close button in footer
      const closeButton = screen.getByRole("button", { name: "Close" });
      await user.click(closeButton);

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
