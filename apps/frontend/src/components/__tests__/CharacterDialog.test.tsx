/**
 * CharacterDialog Component Tests
 *
 * Tests for the CharacterDialog component which manages character CRUD operations.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { CharacterDialog } from "../CharacterDialog";
import { charactersApi } from "@/lib/api/characters";
import type { Character } from "@branchforge/shared";
import { createTestQueryClient } from "@/test/query-client";

// Mock the toast context with persistent mock functions
export const mockToastSuccess = vi.fn();
export const mockToastError = vi.fn();

vi.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({
    success: mockToastSuccess,
    error: mockToastError,
  }),
}));

// Mock the characters API
vi.mock("@/lib/api/characters", () => ({
  charactersApi: {
    listCharacters: vi.fn(),
    getCharacter: vi.fn(),
    createCharacter: vi.fn(),
    updateCharacter: vi.fn(),
    deleteCharacter: vi.fn(),
  },
}));

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
    dialogueStyle: "casual",
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
    dialogueStyle: "formal",
    conditionalPrefix: "lucas_",
    avatarUrl: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
];

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
  });

  describe("Rendering", () => {
    it("should show loading state", () => {
      vi.mocked(charactersApi.listCharacters).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

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

    it("should show error state", async () => {
      vi.mocked(charactersApi.listCharacters).mockRejectedValue(
        new Error("Failed to fetch")
      );

      render(
        <CharacterDialog
          open={true}
          onOpenChange={onOpenChange}
          projectId={projectId}
        />,
        { wrapper }
      );

      await waitFor(() => {
        expect(
          screen.getByText(/failed to load characters/i)
        ).toBeInTheDocument();
      });
    });

    it("should show empty state when no characters", async () => {
      vi.mocked(charactersApi.listCharacters).mockResolvedValue([]);

      render(
        <CharacterDialog
          open={true}
          onOpenChange={onOpenChange}
          projectId={projectId}
        />,
        { wrapper }
      );

      await waitFor(() => {
        expect(
          screen.getByText(/no characters configured yet/i)
        ).toBeInTheDocument();
      });
    });

    it("should display characters in list view", async () => {
      vi.mocked(charactersApi.listCharacters).mockResolvedValue(mockCharacters);

      render(
        <CharacterDialog
          open={true}
          onOpenChange={onOpenChange}
          projectId={projectId}
        />,
        { wrapper }
      );

      await waitFor(() => {
        expect(screen.getByText("Eileen")).toBeInTheDocument();
        expect(screen.getByText("Lucas")).toBeInTheDocument();
      });
    });
  });

  describe("Add Character", () => {
    it("should open add form when clicking add button", async () => {
      const user = userEvent.setup({ delay: null });
      vi.mocked(charactersApi.listCharacters).mockResolvedValue([]);

      render(
        <CharacterDialog
          open={true}
          onOpenChange={onOpenChange}
          projectId={projectId}
        />,
        { wrapper }
      );

      await waitFor(() => {
        expect(screen.getByText(/add character/i)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/add character/i));

      // Check for the Ren'Py Tag field which is unique to the edit form
      expect(screen.getByText(/Ren'Py Tag \*/i)).toBeInTheDocument();
    });
  });

  describe("Dialog Controls", () => {
    it("should close dialog when clicking footer close button", async () => {
      const user = userEvent.setup({ delay: null });
      vi.mocked(charactersApi.listCharacters).mockResolvedValue([]);

      render(
        <CharacterDialog
          open={true}
          onOpenChange={onOpenChange}
          projectId={projectId}
        />,
        { wrapper }
      );

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /Close/i })
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /Close/i }));

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
