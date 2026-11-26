import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GitlabExportReview,
  DetectCharactersResponse,
} from "@branchforge/shared";
import { charactersApi } from "@/lib/api/characters";
import type { SyncOperation } from "@/lib/api/gitlab";
import { gitlabApi } from "@/lib/api/gitlab";
import { createTestQueryClient } from "@/test/query-client";
import { GitLabSyncDialog } from "../GitLabSyncDialog";

const {
  mockImport,
  mockExport,
  mockPending,
  useRealPending,
  mockSyncState,
  useRealSync,
  errorToast,
  successToast,
} = vi.hoisted(() => ({
  useRealSync: { current: false },
  useRealPending: { current: false },
  mockImport: vi.fn(),
  mockExport: vi.fn(),
  successToast: vi.fn(),
  mockPending: vi.fn(),
  mockSyncState: {
    operation: null as SyncOperation | null,
    isProcessing: false,
    progress: 0,
    error: null as string | null,
  },
  errorToast: vi.fn(),
}));

vi.mock("@/lib/api/characters", () => ({
  charactersApi: { detectCharacters: vi.fn(), importCharacters: vi.fn() },
}));

vi.mock("@/hooks/useGitLabSync", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useGitLabSync")>();
  const useMockSync = () => ({
    state: mockSyncState,
    exportToGitlab: mockExport,
    importFromGitlab: mockImport,
    reset: vi.fn(),
  });
  return {
    useGitLabSync: () => {
      const useSync = useRealSync.current ? actual.useGitLabSync : useMockSync;
      return useSync();
    },
  };
});

vi.mock("@/hooks/useGitLabPendingChanges", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/hooks/useGitLabPendingChanges")>();
  return {
    useGitLabPendingChanges: (
      ...args: Parameters<typeof actual.useGitLabPendingChanges>
    ) => {
      const usePending = useRealPending.current
        ? actual.useGitLabPendingChanges
        : mockPending;
      return usePending(...args);
    },
  };
});

function pendingState() {
  return {
    changes: [],
    contentChanges: [],
    contentChangedCount: 0,
    isLoading: false,
    error: null,
    isReversing: false,
    isDiscarding: false,
    refetch: vi.fn(),
  };
}

function reviewFor(
  branch = "main",
  actions: GitlabExportReview["actions"] = [
    { action: "update", filePath: "game/script.rpy" },
  ]
): GitlabExportReview {
  return {
    projectId: "project-1",
    repository: {
      repositoryLinkId: "link",
      gitlabProjectId: 42,
      gitlabOrigin: "https://gitlab.com",
    },
    targetBranch: branch,
    branchExisted: true,
    baseBranch: null,
    actions,
    reviewToken: "a".repeat(64),
  };
}

beforeEach(() => {
  useRealSync.current = false;
  useRealPending.current = false;
  vi.spyOn(gitlabApi, "reviewGitlabExport")
    .mockReset()
    .mockImplementation(async (_projectId, branch) => reviewFor(branch));
  mockPending.mockReturnValue(pendingState());
  mockSyncState.operation = null;
  mockSyncState.error = null;
  mockExport.mockReset();
  successToast.mockClear();
  errorToast.mockClear();
});

vi.mock("@/hooks/useLabels", () => ({
  useLabels: () => ({
    labels: [],
    isLoadingLabels: false,
    invalidateLabels: vi.fn(),
  }),
}));

vi.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({ success: successToast, error: errorToast }),
}));

describe("GitLabSyncDialog", () => {
  it.each([true, false])(
    "handles a completed export with noChanges=%s",
    async (noChanges) => {
      const branchesSpy = vi
        .spyOn(gitlabApi, "getBranches")
        .mockResolvedValue(["main"]);
      const result: SyncOperation = {
        id: "operation-1",
        projectId: "project-1",
        operation: "EXPORT",
        status: "COMPLETED",
        branch: "main",
        conflictCount: 0,
        errorMessage: null,
        startedAt: "2026-10-04T00:00:00Z",
        completedAt: null,
        ...(noChanges ? { noChanges: true } : {}),
      };
      mockExport.mockResolvedValue(result);
      const onOpenChange = vi.fn();
      const queryClient = createTestQueryClient();
      const dialog = (
        <QueryClientProvider client={queryClient}>
          <GitLabSyncDialog
            open
            onOpenChange={onOpenChange}
            operationType="export"
            projectId="project-1"
          />
        </QueryClientProvider>
      );
      try {
        const view = render(dialog);
        const button = await screen.findByRole("button", {
          name: "Push changes",
        });
        await waitFor(() => expect(button).toBeEnabled());
        vi.useFakeTimers();
        try {
          await act(async () => {
            fireEvent.click(button);
            await vi.advanceTimersByTimeAsync(0);
          });
          expect(mockExport).toHaveBeenCalledOnce();
          mockSyncState.operation = result;
          view.rerender(
            <QueryClientProvider client={queryClient}>
              <GitLabSyncDialog
                open
                onOpenChange={onOpenChange}
                operationType="export"
                projectId="project-1"
              />
            </QueryClientProvider>
          );
          if (noChanges) {
            expect(screen.getByRole("status")).toHaveTextContent(
              "No changes to push."
            );
            expect(
              screen.queryByText("Export completed")
            ).not.toBeInTheDocument();
            expect(successToast).not.toHaveBeenCalled();
            await act(async () => {
              await vi.advanceTimersByTimeAsync(1100);
            });
            expect(onOpenChange).not.toHaveBeenCalled();
            fireEvent.click(screen.getByRole("button", { name: "Close" }));
            expect(onOpenChange).toHaveBeenCalledWith(false);
          } else {
            expect(screen.getByText("Export completed")).toBeInTheDocument();
            expect(successToast).toHaveBeenCalledWith(
              "Export completed successfully"
            );
            await act(async () => {
              await vi.advanceTimersByTimeAsync(2000);
            });
            expect(onOpenChange).toHaveBeenCalledWith(false);
          }
        } finally {
          vi.useRealTimers();
        }
      } finally {
        branchesSpy.mockRestore();
        queryClient.clear();
      }
    }
  );

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
        screen.getByRole("button", { name: "Push changes" })
      ).toBeDisabled();

      resolveBranches(["main", "develop"]);

      await waitFor(() => {
        expect(
          screen.getByRole("combobox", { name: "Branch" })
        ).toHaveTextContent("develop");
        expect(
          screen.getByRole("button", { name: "Push changes" })
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
          screen.getByRole("button", { name: "Push changes" })
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

describe("GitLab pull structural-change preflight", () => {
  function renderPull() {
    return render(
      <QueryClientProvider client={createTestQueryClient()}>
        <GitLabSyncDialog
          open
          onOpenChange={vi.fn()}
          operationType="import"
          projectId="project-1"
          defaultBranch="main"
        />
      </QueryClientProvider>
    );
  }

  it.each(["CREATED", "RENAMED", "DELETED"] as const)(
    "explains and blocks a pending %s file",
    (kind) => {
      mockImport.mockClear();
      mockPending.mockReturnValue({
        ...pendingState(),
        changes: [
          {
            fileId: "file-1",
            filePath: "game/new.rpy",
            previousFilePath: "game/old.rpy",
            kind,
            contentChanged: false,
          },
        ],
      });
      renderPull();
      expect(mockPending).toHaveBeenCalledWith("project-1", { enabled: true });
      expect(
        screen.getByRole("region", { name: "File changes blocking pull" })
      ).toHaveTextContent("game/new.rpy");
      expect(
        screen.getByText("Push or discard file changes before pulling")
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Import" }));
      expect(mockImport).not.toHaveBeenCalled();
    }
  );

  it("allows content-only edits to be pulled", () => {
    mockPending.mockReturnValue({
      ...pendingState(),
      contentChangedCount: 1,
      contentChanges: [
        {
          fileId: "file-1",
          filePath: "game/script.rpy",
        },
      ],
    });
    renderPull();
    expect(screen.getByRole("button", { name: "Import" })).toBeEnabled();
    expect(
      screen.queryByRole("region", { name: "File changes blocking pull" })
    ).not.toBeInTheDocument();
  });

  it("disables import while the initial pending-file check loads", () => {
    mockPending.mockReturnValue({ ...pendingState(), isLoading: true });
    renderPull();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Checking pending file changes"
    );
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
  });

  it("shows a request error without replacing it with a generic failure toast", async () => {
    const message =
      "Push or discard your structural file changes before pulling from GitLab";
    mockSyncState.error = message;
    mockImport.mockResolvedValue(null);
    const pending = pendingState();
    mockPending.mockReturnValue(pending);
    renderPull();
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    await waitFor(() => expect(pending.refetch).toHaveBeenCalled());
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(errorToast).not.toHaveBeenCalled();
  });
});

describe("exact export review", () => {
  function renderReview() {
    vi.spyOn(gitlabApi, "getBranches").mockResolvedValue(["main", "other"]);
    const queryClient = createTestQueryClient();
    const element = (open = true) => (
      <QueryClientProvider client={queryClient}>
        <GitLabSyncDialog
          open={open}
          onOpenChange={vi.fn()}
          operationType="export"
          projectId="project-1"
        />
      </QueryClientProvider>
    );
    return { ...render(element()), element };
  }

  it("shows content updates once and keeps the destination in the branch selector", async () => {
    mockPending.mockReturnValue({
      ...pendingState(),
      contentChanges: [{ fileId: "file-1", filePath: "game/script.rpy" }],
      contentChangedCount: 1,
    });
    renderReview();

    expect(await screen.findAllByText(/game\/script\.rpy/)).toHaveLength(1);
    expect(screen.getAllByText(/\bmain\b/)).toHaveLength(1);
    expect(screen.getByRole("combobox", { name: "Branch" })).toHaveTextContent(
      "main"
    );
    expect(screen.queryByText("Undo file changes")).not.toBeInTheDocument();
  });

  it("shows the reviewed base for a new branch", async () => {
    vi.mocked(gitlabApi.reviewGitlabExport).mockImplementation(
      async (_projectId, branch) =>
        branch === "feature/export"
          ? {
              ...reviewFor(branch),
              branchExisted: false,
              baseBranch: "release",
            }
          : reviewFor(branch)
    );
    renderReview();

    await screen.findByRole("combobox", { name: "Branch" });
    fireEvent.click(
      screen.getByRole("button", { name: "Create a new branch" })
    );
    fireEvent.change(screen.getByRole("textbox", { name: "New branch name" }), {
      target: { value: "feature/export" },
    });

    expect(
      await screen.findByText("New branch starts from release.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create branch and push" })
    ).toBeEnabled();
  });

  it("keeps the missing branch warning visible through a branch refresh", async () => {
    vi.mocked(gitlabApi.reviewGitlabExport).mockResolvedValue({
      ...reviewFor(),
      branchExisted: false,
      baseBranch: "release",
    });
    renderReview();
    const warning = await screen.findByRole("alert");
    expect(warning).toHaveTextContent("This branch no longer exists.");
    expect(screen.getByRole("button", { name: "Push changes" })).toBeDisabled();

    let resolveBranches!: (branches: string[]) => void;
    vi.mocked(gitlabApi.getBranches).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveBranches = resolve;
      })
    );
    const refresh = screen.getByRole("button", { name: "Refresh review" });
    refresh.focus();
    fireEvent.click(refresh);
    await waitFor(() =>
      expect(refresh).toHaveAttribute("aria-disabled", "true")
    );
    expect(refresh).toHaveFocus();
    expect(warning).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Branch" })).toHaveTextContent(
      "main"
    );

    await act(async () => resolveBranches(["other"]));
    expect(warning).toBeVisible();
    expect(refresh).toHaveFocus();
    expect(screen.getByRole("button", { name: "Push changes" })).toBeDisabled();
  });

  it("announces undo load failures and offers a retry", async () => {
    const pending = pendingState();
    mockPending.mockReturnValue({
      ...pending,
      error: new Error("Request failed"),
    });
    renderReview();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not load changes available for undo."
    );
    expect(screen.queryByText("Undo file changes")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(pending.refetch).toHaveBeenCalledOnce();
  });

  it("keeps undo collapsed and requires an updated review after undo", async () => {
    useRealPending.current = true;
    vi.spyOn(gitlabApi, "getPendingChanges").mockResolvedValue({
      changes: [
        {
          fileId: "file-1",
          filePath: "game/script.rpy",
          previousFilePath: null,
          kind: "CREATED",
          contentChanged: false,
        },
      ],
      contentChanges: [],
      contentChangedCount: 0,
    });
    const reverse = vi
      .spyOn(gitlabApi, "reversePendingOperation")
      .mockResolvedValue({
        success: true,
        reversed: true,
        operation: null,
      });
    vi.mocked(gitlabApi.reviewGitlabExport)
      .mockResolvedValueOnce(
        reviewFor("main", [{ action: "create", filePath: "game/script.rpy" }])
      )
      .mockResolvedValueOnce(reviewFor("main", []));
    renderReview();

    expect(
      await screen.findByText("Create: game/script.rpy")
    ).toBeInTheDocument();
    const undo = await screen.findByText("Undo file changes");
    const disclosure = undo.closest("details");
    expect(disclosure).not.toHaveAttribute("open");
    fireEvent.click(undo);
    expect(disclosure).toHaveAttribute("open");
    fireEvent.click(screen.getByRole("button", { name: "Cancel creation" }));

    expect(await screen.findByText("No changes to push.")).toBeInTheDocument();
    expect(reverse).toHaveBeenCalledWith("project-1", "file-1");
    expect(screen.getByRole("button", { name: "Push changes" })).toBeDisabled();
  });

  it("shows generated and moved paths and sends the reviewed token on explicit confirmation", async () => {
    vi.mocked(gitlabApi.reviewGitlabExport).mockResolvedValue(
      reviewFor("main", [
        { action: "create", filePath: "game/branchforge_variables.rpy" },
        {
          action: "move",
          previousPath: "game/old.rpy",
          filePath: "game/new.rpy",
        },
      ])
    );
    renderReview();
    expect(
      await screen.findByText("Create: game/branchforge_variables.rpy")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Move: game/old.rpy → game/new.rpy")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Push changes" }));
    await waitFor(() =>
      expect(mockExport).toHaveBeenCalledWith(
        "project-1",
        "main",
        "Sync export from BranchForge",
        "a".repeat(64)
      )
    );
  });

  it("disables confirmation for an empty review", async () => {
    vi.mocked(gitlabApi.reviewGitlabExport).mockResolvedValue(
      reviewFor("main", [])
    );
    renderReview();
    expect(await screen.findByText("No changes to push.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Push changes" })).toBeDisabled();
  });

  it("refreshes after a stale response and waits for a new explicit confirmation", async () => {
    mockExport.mockResolvedValue(null);
    renderReview();
    const button = await screen.findByRole("button", {
      name: "Push changes",
    });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(
      await screen.findByText(
        "The push was not confirmed. Refresh the review and confirm again."
      )
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(gitlabApi.reviewGitlabExport).toHaveBeenCalledTimes(2)
    );
    expect(mockExport).toHaveBeenCalledOnce();
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(mockExport).toHaveBeenCalledTimes(2));
  });

  it("keeps the real sync hook's confirmation error visible after refreshing", async () => {
    useRealSync.current = true;
    const failure = "The GitLab token no longer has push permission.";
    const submit = vi
      .spyOn(gitlabApi, "exportToGitlab")
      .mockRejectedValueOnce(new Error(failure));
    renderReview();

    const button = await screen.findByRole("button", {
      name: "Push changes",
    });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);

    expect(await screen.findByText(failure)).toBeInTheDocument();
    await waitFor(() =>
      expect(gitlabApi.reviewGitlabExport).toHaveBeenCalledTimes(2)
    );
    expect(screen.getByText(failure)).toBeInTheDocument();
    expect(submit).toHaveBeenCalledOnce();
  });

  it("exposes explicit recovery after a reopened dialog cannot review a pending export", async () => {
    vi.mocked(gitlabApi.reviewGitlabExport).mockRejectedValueOnce(
      new Error(
        "Recover the previous GitLab export before reviewing another push."
      )
    );
    const recover = vi
      .spyOn(gitlabApi, "recoverGitlabExport")
      .mockResolvedValue({ recovered: true });
    renderReview();
    fireEvent.click(
      await screen.findByRole("button", { name: "Recover previous export" })
    );
    await waitFor(() => expect(recover).toHaveBeenCalledWith("project-1"));
    expect(
      await screen.findByText("Update: game/script.rpy")
    ).toBeInTheDocument();
    expect(mockExport).not.toHaveBeenCalled();
  });

  it("offers refresh without recovery for an unrelated review error", async () => {
    vi.mocked(gitlabApi.reviewGitlabExport).mockRejectedValueOnce(
      new Error("GitLab is unreachable")
    );
    renderReview();
    expect(
      await screen.findByText("GitLab is unreachable")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Recover previous export" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Refresh review" })
    ).toBeEnabled();
  });

  it("does not announce a recovered export when another request already recovered it", async () => {
    vi.mocked(gitlabApi.reviewGitlabExport).mockRejectedValueOnce(
      new Error(
        "Recover the previous GitLab export before reviewing another push."
      )
    );
    vi.spyOn(gitlabApi, "recoverGitlabExport").mockResolvedValue({
      recovered: false,
    });
    renderReview();
    fireEvent.click(
      await screen.findByRole("button", { name: "Recover previous export" })
    );
    expect(
      await screen.findByText(
        "No previous export needs recovery. Review the current changes before confirming."
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Previous export recovered. Review the current changes before confirming."
      )
    ).not.toBeInTheDocument();
  });

  it("ignores an old response when the branch changes", async () => {
    let resolveOld!: (review: GitlabExportReview) => void;
    vi.mocked(gitlabApi.reviewGitlabExport).mockImplementation(
      (_project, branch) =>
        branch === "main"
          ? new Promise((resolve) => {
              resolveOld = resolve;
            })
          : Promise.resolve(
              reviewFor(branch, [
                { action: "delete", filePath: "game/other.rpy" },
              ])
            )
    );
    renderReview();
    await waitFor(() =>
      expect(gitlabApi.reviewGitlabExport).toHaveBeenCalled()
    );
    fireEvent.click(await screen.findByLabelText("Branch"));
    fireEvent.click(await screen.findByRole("option", { name: "other" }));
    expect(
      await screen.findByText("Delete: game/other.rpy")
    ).toBeInTheDocument();
    await act(async () =>
      resolveOld(
        reviewFor("main", [{ action: "create", filePath: "game/stale.rpy" }])
      )
    );
    expect(
      screen.queryByText("Create: game/stale.rpy")
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Push changes" })).toBeEnabled();
  });
});
