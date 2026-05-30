import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { ScriptReferencePanel } from "../ScriptReferencePanel";
import type { Character } from "@branchforge/shared";
import { createTestQueryClient } from "@/test/query-client";

// Mock toast context
vi.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock useVariables hook
vi.mock("@/hooks/useVariables", () => ({
  useVariables: () => ({
    variables: [],
    isLoadingVariables: false,
    variablesError: null,
    isCreatingVariable: false,
    isUpdatingVariable: false,
    isDeletingVariable: false,
    refreshVariables: vi.fn(),
    createVariable: vi.fn(),
    updateVariable: vi.fn(),
    deleteVariable: vi.fn(),
  }),
}));

// Mock useStats hook
vi.mock("@/hooks/useStats", () => ({
  useStats: () => ({
    stats: [],
    isLoadingStats: false,
    statsError: null,
    progression: [],
    isLoadingProgression: false,
    progressionError: null,
    isCreatingStat: false,
    isUpdatingStat: false,
    isDeletingStat: false,
    refreshStats: vi.fn(),
    refreshProgression: vi.fn(),
    createStat: vi.fn(),
    updateStat: vi.fn(),
    deleteStat: vi.fn(),
  }),
}));

describe("ScriptReferencePanel - Characters Section", () => {
  let queryClient: QueryClient;
  const mockProjectId = "test-project";
  const mockOnCollapseToggle = vi.fn();

  const mockCharacters: Character[] = [
    {
      id: "char-1",
      projectId: "test-project",
      name: "emily",
      displayName: "Emily",
      renpyTag: "e",
      color: "#ff6b6b",
      avatarUrl: null,
      isLoveInterest: true,
      routeAffiliation: "route-a",
      dialogueStyle: "default",
      conditionalPrefix: null,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    },
    {
      id: "char-2",
      projectId: "test-project",
      name: "natsuki",
      displayName: "Natsuki",
      renpyTag: "n",
      color: "#ffd93d",
      avatarUrl: "/avatars/natsuki.png",
      isLoveInterest: false,
      routeAffiliation: "route-b",
      dialogueStyle: "default",
      conditionalPrefix: null,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    },
    {
      id: "char-3",
      projectId: "test-project",
      name: "sayori",
      displayName: "Sayori",
      renpyTag: "s",
      color: "#6bcb77",
      avatarUrl: null,
      isLoveInterest: true,
      routeAffiliation: "route-c",
      dialogueStyle: "default",
      conditionalPrefix: null,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    },
  ];

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = createTestQueryClient();
    vi.clearAllMocks();
  });

  it("renders empty state when no characters exist", () => {
    render(
      <ScriptReferencePanel
        projectId={mockProjectId}
        projectCharacters={[]}
        onCollapseToggle={mockOnCollapseToggle}
      />,
      { wrapper }
    );

    expect(screen.getByText("No characters defined")).toBeInTheDocument();
  });

  it("sorts characters alphabetically by displayName", () => {
    const { container } = render(
      <ScriptReferencePanel
        projectId={mockProjectId}
        projectCharacters={[
          mockCharacters[1], // Natsuki
          mockCharacters[0], // Emily
          mockCharacters[2], // Sayori
        ]}
        onCollapseToggle={mockOnCollapseToggle}
      />,
      { wrapper }
    );

    const characterNames = container.querySelectorAll(
      ".text-xs.font-medium.truncate"
    );
    expect(characterNames[0].textContent).toBe("Emily");
    expect(characterNames[1].textContent).toBe("Natsuki");
    expect(characterNames[2].textContent).toBe("Sayori");
  });

  it("displays character avatars when avatarUrl exists", () => {
    const { container } = render(
      <ScriptReferencePanel
        projectId={mockProjectId}
        projectCharacters={[mockCharacters[1]]} // Natsuki with avatarUrl
        onCollapseToggle={mockOnCollapseToggle}
      />,
      { wrapper }
    );

    const avatar = container.querySelector("img[src='/avatars/natsuki.png']");
    expect(avatar).toBeInTheDocument();
    expect(avatar).toHaveAttribute("alt", "Natsuki");
  });

  it("falls back to colored circle when avatarUrl is missing", () => {
    const { container } = render(
      <ScriptReferencePanel
        projectId={mockProjectId}
        projectCharacters={[mockCharacters[0]]} // Emily without avatarUrl
        onCollapseToggle={mockOnCollapseToggle}
      />,
      { wrapper }
    );

    // Check that no img tag is rendered
    const avatar = container.querySelector("img[src='/avatars/natsuki.png']");
    expect(avatar).not.toBeInTheDocument();

    // Check for a div with the character's first letter (E for Emily)
    // This div should have the colored circle class
    const circle = container.querySelector("div.size-8.rounded-full");
    expect(circle).toBeInTheDocument();
    expect(circle?.textContent).toBe("E");
  });

  it("displays Ren'Py tags in monospace", () => {
    const { container } = render(
      <ScriptReferencePanel
        projectId={mockProjectId}
        projectCharacters={mockCharacters}
        onCollapseToggle={mockOnCollapseToggle}
      />,
      { wrapper }
    );

    const tags = container.querySelectorAll(".font-mono");
    expect(tags[0].textContent).toBe("e");
    expect(tags[1].textContent).toBe("n");
    expect(tags[2].textContent).toBe("s");
  });

  it("shows heart icon only for love interests", () => {
    const { container } = render(
      <ScriptReferencePanel
        projectId={mockProjectId}
        projectCharacters={mockCharacters}
        onCollapseToggle={mockOnCollapseToggle}
      />,
      { wrapper }
    );

    const hearts = container.querySelectorAll(".text-pink-400");
    expect(hearts).toHaveLength(2); // Emily and Sayori are love interests
  });
});
