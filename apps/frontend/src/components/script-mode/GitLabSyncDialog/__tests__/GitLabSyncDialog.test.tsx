import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { gitlabApi } from "@/lib/api/gitlab";
import { createTestQueryClient } from "@/test/query-client";
import { GitLabSyncDialog } from "../GitLabSyncDialog";

vi.mock("@/hooks/useGitLabSync", () => ({
  useGitLabSync: () => ({
    state: { operation: null, isProcessing: false, progress: 0, error: null },
    exportToGitlab: vi.fn(),
    importFromGitlab: vi.fn(),
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
});
