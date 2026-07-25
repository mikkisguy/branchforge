import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PairGroupWithNames } from "@branchforge/shared";
import { PairGroupsDialog } from "@/components/pair-groups/PairGroupsDialog";

vi.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@/hooks/useProject", () => ({
  useProject: vi.fn(),
}));

vi.mock("@/hooks/usePairGroups", () => ({
  usePairGroups: vi.fn(),
}));

vi.mock("@/components/pair-groups/PairGroupEditDialog.lazy", () => ({
  PairGroupEditDialog: () => null,
}));

import { useProject } from "@/hooks/useProject";
import { usePairGroups } from "@/hooks/usePairGroups";

const mockPairGroup: PairGroupWithNames = {
  id: "pg-1",
  projectId: "project-1",
  characterAId: "char-a",
  characterBId: "char-b",
  characterAName: "Alex",
  characterBName: "Blake",
  duoEndingLabel: "best_friends_ending",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

describe("PairGroupsDialog", () => {
  const updatePairGroup = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useProject).mockReturnValue({
      currentProject: {
        id: "project-1",
        duoEndingEnabled: true,
      },
      updateProject: vi.fn(),
    } as never);

    vi.mocked(usePairGroups).mockReturnValue({
      pairGroups: [mockPairGroup],
      isLoading: false,
      error: null,
      isDeleting: false,
      isUpdating: false,
      refresh: vi.fn(),
      createPairGroup: vi.fn(),
      updatePairGroup,
      deletePairGroup: vi.fn(),
      isCreating: false,
    } as never);
  });

  it("keeps edit mode and shows validation error for an empty label save", async () => {
    const user = userEvent.setup({ delay: null });

    render(
      <PairGroupsDialog
        open
        onOpenChange={vi.fn()}
        projectId="project-1"
        characters={["Alex", "Blake"]}
      />
    );

    await user.click(
      screen.getByRole("button", {
        name: /edit pair group best_friends_ending/i,
      })
    );

    const input = screen.getByDisplayValue("best_friends_ending");
    await user.clear(input);
    await user.click(screen.getByRole("button", { name: /save label/i }));

    expect(updatePairGroup).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Duo ending label is required"
    );
    expect(screen.getByDisplayValue("")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /save label/i })
    ).toBeInTheDocument();
  });

  it("shows discard confirmation when closing while inline edit has unsaved changes", async () => {
    const user = userEvent.setup({ delay: null });
    const onOpenChange = vi.fn();

    render(
      <PairGroupsDialog
        open
        onOpenChange={onOpenChange}
        projectId="project-1"
        characters={["Alex", "Blake"]}
      />
    );

    // Start inline edit on the pair group
    await user.click(
      screen.getByRole("button", {
        name: /edit pair group best_friends_ending/i,
      })
    );

    // Change the label value to make inline form dirty
    const input = screen.getByDisplayValue("best_friends_ending");
    await user.clear(input);
    await user.type(input, "changed_label");

    // Click the dialog backdrop to trigger close (simulates Escape/backdrop)
    const dialog = document.querySelector(
      'dialog[aria-label="Pair Groups"]'
    ) as HTMLElement;
    await user.click(dialog);

    // Assert discard ConfirmDialog appears
    expect(screen.getByText(/discard unsaved changes/i)).toBeInTheDocument();
  });

  it("disables delete on other rows while any inline label edit is active", async () => {
    const user = userEvent.setup({ delay: null });
    const second: PairGroupWithNames = {
      ...mockPairGroup,
      id: "pg-2",
      duoEndingLabel: "rivals_ending",
      characterAName: "Casey",
      characterBName: "Drew",
    };

    vi.mocked(usePairGroups).mockReturnValue({
      pairGroups: [mockPairGroup, second],
      isLoading: false,
      error: null,
      isDeleting: false,
      isUpdating: false,
      refresh: vi.fn(),
      createPairGroup: vi.fn(),
      updatePairGroup,
      deletePairGroup: vi.fn(),
      isCreating: false,
    } as never);

    render(
      <PairGroupsDialog
        open
        onOpenChange={vi.fn()}
        projectId="project-1"
        characters={["Alex", "Blake", "Casey", "Drew"]}
      />
    );

    await user.click(
      screen.getByRole("button", {
        name: /edit pair group best_friends_ending/i,
      })
    );

    expect(
      screen.getByRole("button", {
        name: /delete pair group rivals_ending/i,
      })
    ).toBeDisabled();
  });
});
