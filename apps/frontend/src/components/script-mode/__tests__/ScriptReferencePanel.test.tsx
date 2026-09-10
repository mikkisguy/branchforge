import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { ScriptReferencePanel } from "../ScriptReferencePanel";
import type { Character, Variable } from "@branchforge/shared";
import { createTestQueryClient } from "@/test/query-client";

const { mockVariables } = vi.hoisted(() => ({
  mockVariables: [] as Variable[],
}));

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
    variables: mockVariables,
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
      isNarrator: false,
      routeAffiliation: "route-a",
      nameType: "literal",
      notes: "test notes",
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
      isNarrator: false,
      routeAffiliation: "route-b",
      nameType: "literal",
      notes: "test notes",
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
      isNarrator: false,
      routeAffiliation: "route-c",
      nameType: "literal",
      notes: "test notes",
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
    mockVariables.length = 0;
    vi.clearAllMocks();
  });

  it("renders empty state when no characters exist", () => {
    render(
      <ScriptReferencePanel projectId={mockProjectId} projectCharacters={[]} />,
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
      />,
      { wrapper }
    );

    const hearts = container.querySelectorAll(".text-pink-400");
    expect(hearts).toHaveLength(2); // Emily and Sayori are love interests
  });

  it("trims variable categories and falls back to Uncategorized", async () => {
    const user = userEvent.setup();
    mockVariables.push(
      {
        id: "var-1",
        projectId: mockProjectId,
        key: "blank_category",
        description: null,
        category: "   ",
        createdAt: "2024-01-01T00:00:00.000Z",
      },
      {
        id: "var-2",
        projectId: mockProjectId,
        key: "null_category",
        description: null,
        category: null,
        createdAt: "2024-01-01T00:00:00.000Z",
      },
      {
        id: "var-3",
        projectId: mockProjectId,
        key: "story_flag",
        description: null,
        category: "  Story  ",
        createdAt: "2024-01-01T00:00:00.000Z",
      }
    );

    render(
      <ScriptReferencePanel projectId={mockProjectId} projectCharacters={[]} />,
      { wrapper }
    );

    await user.click(screen.getByRole("button", { name: "Variables" }));

    const variablesSection = screen
      .getByRole("button", { name: "Variables" })
      .closest("div.border-b") as HTMLElement;

    expect(
      within(variablesSection).getByRole("heading", { name: "Uncategorized" })
    ).toBeInTheDocument();
    expect(
      within(variablesSection).getByRole("heading", { name: "Story" })
    ).toBeInTheDocument();
    expect(
      within(variablesSection).queryByRole("heading", { name: "  Story  " })
    ).not.toBeInTheDocument();
    expect(
      within(variablesSection).getByText("blank_category")
    ).toBeInTheDocument();
    expect(
      within(variablesSection).getByText("null_category")
    ).toBeInTheDocument();
    expect(within(variablesSection).getByText("story_flag")).toBeInTheDocument();
  });
});
