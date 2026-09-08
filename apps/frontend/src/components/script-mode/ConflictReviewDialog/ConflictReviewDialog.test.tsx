import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { ConflictReviewDialog } from "./ConflictReviewDialog";
import { ToastProvider } from "@/contexts/ToastContext";
import { gitlabApi } from "@/lib/api/gitlab";

const showToast = vi.fn();

vi.mock("@/lib/api/gitlab", () => ({
  gitlabApi: {
    detectConflicts: vi.fn(),
  },
}));

vi.mock("@/contexts/ToastContext", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/contexts/ToastContext")>();
  return {
    ...actual,
    useToast: () => ({
      showToast,
    }),
  };
});

describe("ConflictReviewDialog", () => {
  beforeEach(() => {
    showToast.mockReset();
    vi.mocked(gitlabApi.detectConflicts).mockReset();
    vi.mocked(gitlabApi.detectConflicts).mockResolvedValue({
      hasConflicts: false,
      conflicts: [],
    });
  });

  it("issues exactly one conflict request when opened", async () => {
    render(
      <ToastProvider>
        <ConflictReviewDialog
          open
          onOpenChange={vi.fn()}
          projectId="project-1"
          branch="main"
        />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(gitlabApi.detectConflicts).toHaveBeenCalledTimes(1);
    });

    expect(gitlabApi.detectConflicts).toHaveBeenCalledWith(
      "project-1",
      "main",
      expect.any(AbortSignal)
    );
  });

  it("shows a destructive toast with the rejection message for five seconds", async () => {
    vi.mocked(gitlabApi.detectConflicts).mockRejectedValue(
      new Error("GitLab unavailable")
    );

    render(
      <ToastProvider>
        <ConflictReviewDialog
          open
          onOpenChange={vi.fn()}
          projectId="project-1"
          branch="main"
        />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith({
        variant: "destructive",
        message: "GitLab unavailable",
        duration: 5000,
      });
    });
  });
});
