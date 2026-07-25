/**
 * Dirty-form guard coverage for PairGroupEditDialog create/edit forms.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PairGroupWithNames } from "@branchforge/shared";
import { PairGroupEditDialog } from "@/components/pair-groups/PairGroupEditDialog";

vi.mock("@/hooks/usePairGroups", () => ({
  usePairGroups: vi.fn(),
}));

vi.mock("@/hooks/useCharacters", () => ({
  useCharacters: vi.fn(),
}));

import { usePairGroups } from "@/hooks/usePairGroups";
import { useCharacters } from "@/hooks/useCharacters";

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

describe("PairGroupEditDialog — dirty form guard", () => {
  const createPairGroup = vi.fn();
  const updatePairGroup = vi.fn();
  const onOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useCharacters).mockReturnValue({
      characters: [
        { id: "char-a", displayName: "Alex" },
        { id: "char-b", displayName: "Blake" },
      ],
    } as never);

    vi.mocked(usePairGroups).mockReturnValue({
      pairGroups: [mockPairGroup],
      isLoading: false,
      error: null,
      isDeleting: false,
      isUpdating: false,
      isCreating: false,
      refresh: vi.fn(),
      createPairGroup,
      updatePairGroup,
      deletePairGroup: vi.fn(),
    } as never);
  });

  it("disables Create when the create form is clean", () => {
    render(
      <PairGroupEditDialog
        open
        onOpenChange={onOpenChange}
        projectId="project-1"
      />
    );

    expect(
      screen.getByRole("button", { name: /create pair group/i })
    ).toBeDisabled();
  });

  it("shows discard confirmation when Cancel is clicked on a dirty create form", async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <PairGroupEditDialog
        open
        onOpenChange={onOpenChange}
        projectId="project-1"
      />
    );

    await user.type(screen.getByLabelText(/duo ending label/i), "new_ending");
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(screen.getByText(/discard unsaved changes/i)).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("closes via onOpenChange(false) on successful create without discard prompt", async () => {
    createPairGroup.mockResolvedValue(mockPairGroup);
    const user = userEvent.setup({ delay: null });
    render(
      <PairGroupEditDialog
        open
        onOpenChange={onOpenChange}
        projectId="project-1"
      />
    );

    await user.click(screen.getByLabelText(/character a/i));
    await user.click(screen.getByRole("option", { name: "Alex" }));
    await user.click(screen.getByLabelText(/character b/i));
    await user.click(screen.getByRole("option", { name: "Blake" }));
    await user.type(screen.getByLabelText(/duo ending label/i), "new_ending");

    await user.click(
      screen.getByRole("button", { name: /create pair group/i })
    );

    expect(createPairGroup).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(
      screen.queryByRole("heading", { name: /discard unsaved changes/i })
    ).not.toBeInTheDocument();
  });

  it("disables Save when the edit form is clean", () => {
    render(
      <PairGroupEditDialog
        open
        onOpenChange={onOpenChange}
        projectId="project-1"
        pairGroupId="pg-1"
      />
    );

    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
  });

  it("shows discard confirmation on Escape for a dirty edit form", async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <PairGroupEditDialog
        open
        onOpenChange={onOpenChange}
        projectId="project-1"
        pairGroupId="pg-1"
      />
    );

    const input = screen.getByLabelText(/duo ending label/i);
    await user.clear(input);
    await user.type(input, "changed_ending");
    await user.keyboard("{Escape}");

    expect(screen.getByText(/discard unsaved changes/i)).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("closes via onOpenChange(false) on successful edit save without discard prompt", async () => {
    updatePairGroup.mockResolvedValue({
      ...mockPairGroup,
      duoEndingLabel: "changed_ending",
    });
    const user = userEvent.setup({ delay: null });
    render(
      <PairGroupEditDialog
        open
        onOpenChange={onOpenChange}
        projectId="project-1"
        pairGroupId="pg-1"
      />
    );

    const input = screen.getByLabelText(/duo ending label/i);
    await user.clear(input);
    await user.type(input, "changed_ending");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(updatePairGroup).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(
      screen.queryByRole("heading", { name: /discard unsaved changes/i })
    ).not.toBeInTheDocument();
  });
});
