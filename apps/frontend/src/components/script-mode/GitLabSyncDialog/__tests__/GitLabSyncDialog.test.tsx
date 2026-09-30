import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DetectCharactersResponse } from "@branchforge/shared";
import { charactersApi } from "@/lib/api/characters";
import { gitlabApi } from "@/lib/api/gitlab";
import { createTestQueryClient } from "@/test/query-client";
import { GitLabSyncDialog } from "../GitLabSyncDialog";

const { mockImport } = vi.hoisted(() => ({ mockImport: vi.fn() }));

vi.mock("@/lib/api/characters", () => ({
  charactersApi: { detectCharacters: vi.fn(), importCharacters: vi.fn() },
}));

vi.mock("@/hooks/useGitLabSync", () => ({
  useGitLabSync: () => ({
    state: { operation: null, isProcessing: false, progress: 0, error: null },
    exportToGitlab: vi.fn(),
    importFromGitlab: mockImport,
    reset: vi.fn(),
  }),
}));

vi.mock("@/hooks/useGitLabPendingChanges", () => ({
  useGitLabPendingChanges: () => ({
    changes: [],
    contentChanges: [],
    contentChangedCount: 0,
    isLoading: false,
    error: null,
    isReversing: false,
    isDiscarding: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/useLabels", () => ({
  useLabels: () => ({
    labels: [],
    isLoadingLabels: false,
    invalidateLabels: vi.fn(),
  }),
}));

vi.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

describe("GitLabSyncDialog", () => {
  it("selects the linked default branch after fetching branches", async () => {
    let resolveBranches!: (branches: string[]) => void;
    const branches = new Promise<string[]>((resolve) => {
      resolveBranches = resolve;
    });
    const getBranches = vi
      .spyOn(gitlabApi, "getBranches")
      .mockReturnValue(branches);
    const queryClient = createTestQueryClient();

    try {
      render(
        <QueryClientProvider client={queryClient}>
          <GitLabSyncDialog
            open
            onOpenChange={vi.fn()}
            operationType="export"
            projectId="project-1"
            defaultBranch="develop"
          />
        </QueryClientProvider>
      );

      expect(
        screen.getByRole("button", { name: "Export to branch" })
      ).toBeDisabled();

      resolveBranches(["main", "develop"]);

      await waitFor(() => {
        expect(
          screen.getByRole("combobox", { name: "Branch" })
        ).toHaveTextContent("develop");
        expect(
          screen.getByRole("button", { name: "Export to develop" })
        ).toBeEnabled();
      });
      expect(getBranches).toHaveBeenCalledWith("project-1");
    } finally {
      getBranches.mockRestore();
      queryClient.clear();
    }
  });

  it("selects the new default when the linked target changes", async () => {
    const getBranches = vi
      .spyOn(gitlabApi, "getBranches")
      .mockImplementation(async (projectId) =>
        projectId === "project-1"
          ? ["main", "develop", "release"]
          : ["release", "feature"]
      );
    const queryClient = createTestQueryClient();
    const onOpenChange = vi.fn();
    const renderDialog = (projectId: string, defaultBranch: string) => (
      <QueryClientProvider client={queryClient}>
        <GitLabSyncDialog
          open
          onOpenChange={onOpenChange}
          operationType="export"
          projectId={projectId}
          defaultBranch={defaultBranch}
        />
      </QueryClientProvider>
    );

    try {
      const { rerender } = render(renderDialog("project-1", "main"));
      await waitFor(() =>
        expect(
          screen.getByRole("combobox", { name: "Branch" })
        ).toHaveTextContent("main")
      );

      fireEvent.click(screen.getByRole("combobox", { name: "Branch" }));
      fireEvent.click(screen.getByRole("option", { name: "develop" }));
      expect(
        screen.getByRole("combobox", { name: "Branch" })
      ).toHaveTextContent("develop");

      rerender(renderDialog("project-1", "release"));
      await waitFor(() =>
        expect(
          screen.getByRole("combobox", { name: "Branch" })
        ).toHaveTextContent("release")
      );

      rerender(renderDialog("project-2", "feature"));
      await waitFor(() => {
        expect(
          screen.getByRole("combobox", { name: "Branch" })
        ).toHaveTextContent("feature");
        expect(
          screen.getByRole("button", { name: "Export to feature" })
        ).toBeEnabled();
      });
      expect(getBranches).toHaveBeenCalledWith("project-2");
    } finally {
      getBranches.mockRestore();
      queryClient.clear();
    }
  });
});

describe("GitLabSyncDialog character review after pull", () => {
  beforeEach(() => {
    mockImport.mockReset();
    vi.mocked(charactersApi.detectCharacters).mockClear();
  });

  const character = {
    tag: "w",
    name: "Welcome!",
    displayName: "Welcome!",
    nameType: "literal" as const,
    color: "#ffffff",
    isSpecial: false,
    sourceFile: "characters.rpy",
    confidence: 1,
  };

  async function pull(review: DetectCharactersResponse) {
    mockImport.mockResolvedValue({
      status: "COMPLETED",
      characterReview: review,
    });
    const onOpenChange = vi.fn();
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <GitLabSyncDialog
          open
          onOpenChange={onOpenChange}
          operationType="import"
          projectId="project-1"
          defaultBranch="main"
        />
      </QueryClientProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    await waitFor(() => expect(mockImport).toHaveBeenCalled());
    return onOpenChange;
  }

  it("closes normally without re-detection when every character is unchanged", async () => {
    const onOpenChange = await pull({
      characters: [character],
      conflicts: [],
      existingTags: ["w"],
      excludedTags: [],
      narratorCharacterTags: ["w"],
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false), {
      timeout: 2000,
    });
    expect(screen.queryByText("Review Characters")).not.toBeInTheDocument();
    expect(charactersApi.detectCharacters).not.toHaveBeenCalled();
  });

  it("reviews a new character even if the pull has already inserted it", async () => {
    await pull({
      characters: [character],
      conflicts: [],
      existingTags: [],
      excludedTags: [],
      narratorCharacterTags: [],
    });
    expect(await screen.findByText("Review Characters")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Include w" })
    ).toBeInTheDocument();
    expect(charactersApi.detectCharacters).not.toHaveBeenCalled();
  });

  it("opens review for a real source difference with keep selected", async () => {
    await pull({
      characters: [character],
      existingTags: ["w"],
      excludedTags: [],
      narratorCharacterTags: ["w"],
      conflicts: [
        {
          tag: "w",
          existingName: "Hello!",
          detectedName: "Welcome!",
          existingColor: "#ffffff",
          detectedColor: "#ffffff",
          changedFields: ["name"],
        },
      ],
    });
    expect(
      await screen.findByRole("combobox", { name: "Definition to keep for w" })
    ).toHaveValue("current");
    expect(
      screen.getByRole("button", { name: "Apply Changes" })
    ).toBeDisabled();
  });
});
