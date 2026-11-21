import { expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Stat, Variable } from "@branchforge/shared";
import { useStats } from "@/hooks/useStats";
import { useVariables } from "@/hooks/useVariables";
import { StatEditDialog } from "@/components/stats/StatEditDialog";
import { VariableEditDialog } from "@/components/variables/VariableEditDialog";

vi.mock("@/hooks/useStats");
vi.mock("@/hooks/useVariables");

const projectId = "project-1";
const createdAt = "2026-11-21T12:00:00.000Z";

it("clears the edited category and preserves a description added during a refetch", async () => {
  const variable: Variable = {
    id: "variable-1",
    projectId,
    key: "met_alice",
    description: null,
    category: "Characters",
    createdAt,
  };
  const updateVariable = vi.fn().mockResolvedValue(variable);
  const hook = {
    variables: [variable],
    isLoadingVariables: false,
    variablesError: null,
    isCreatingVariable: false,
    isUpdatingVariable: false,
    isDeletingVariable: false,
    refreshVariables: vi.fn(),
    createVariable: vi.fn(),
    updateVariable,
    deleteVariable: vi.fn(),
  };
  vi.mocked(useVariables).mockReturnValue(hook);
  const props = {
    open: true,
    projectId,
    variableId: variable.id,
    onOpenChange: vi.fn(),
  };
  const { rerender } = render(<VariableEditDialog {...props} />);
  vi.mocked(useVariables).mockReturnValue({
    ...hook,
    variables: [{ ...variable, description: "Added in another session" }],
  });
  rerender(<VariableEditDialog {...props} />);

  fireEvent.change(screen.getByLabelText("Category"), {
    target: { value: "" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => {
    expect(updateVariable).toHaveBeenCalledWith(variable.id, {
      category: null,
      description: undefined,
    });
  });
});

it("preserves a description added during a refetch when saving a stat name", async () => {
  const stat: Stat = {
    id: "stat-1",
    projectId,
    characterId: null,
    key: "trust",
    name: "Trust",
    minValue: 0,
    maxValue: 10,
    description: null,
    createdAt,
    updatedAt: createdAt,
  };
  const updateStat = vi.fn().mockResolvedValue(stat);
  const hook = {
    stats: [stat],
    isLoadingStats: false,
    statsError: null,
    progression: [],
    isLoadingProgression: false,
    progressionError: null,
    refreshProgression: vi.fn(),
    isCreatingStat: false,
    isUpdatingStat: false,
    isDeletingStat: false,
    refreshStats: vi.fn(),
    createStat: vi.fn(),
    updateStat,
    deleteStat: vi.fn(),
  };
  vi.mocked(useStats).mockReturnValue(hook);
  const props = {
    open: true,
    projectId,
    statId: stat.id,
    onOpenChange: vi.fn(),
  };
  const { rerender } = render(<StatEditDialog {...props} />);
  vi.mocked(useStats).mockReturnValue({
    ...hook,
    stats: [{ ...stat, description: "Added in another session" }],
  });
  rerender(<StatEditDialog {...props} />);

  fireEvent.change(screen.getByLabelText(/Name/), {
    target: { value: "Trust Level" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => {
    expect(updateStat).toHaveBeenCalledWith(stat.id, {
      name: "Trust Level",
      minValue: 0,
      maxValue: 10,
      description: undefined,
    });
  });
});
