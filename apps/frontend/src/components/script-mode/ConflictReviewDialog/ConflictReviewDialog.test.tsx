import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { ConflictReviewDialog } from "./ConflictReviewDialog";
import { ToastProvider } from "@/contexts/ToastContext";
import { gitlabApi } from "@/lib/api/gitlab";

vi.mock("@/lib/api/gitlab", () => ({
  gitlabApi: {
    detectConflicts: vi.fn(),
  },
}));

describe("ConflictReviewDialog", () => {
  beforeEach(() => {
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
});
