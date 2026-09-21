import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WritingGoalSettings } from "../WritingGoalSettings";

const updateGoalMock = vi.fn();

vi.mock("@/hooks/useWritingGoals", () => ({
  useWritingGoals: () => ({
    settings: {
      dailyWritingGoal: 500,
      dailyWordResetHour: 0,
      dailyWordCounts: [],
      timezone: "Europe/Helsinki",
    },
    isLoading: false,
    isSaving: false,
    // Deliberately recreate this callback every render, matching mutation
    // state updates that previously restarted the component's debounce.
    updateGoal: (params: { dailyWritingGoal?: number | null }) => {
      updateGoalMock(params);
    },
    resetStats: vi.fn(),
    refetch: vi.fn(),
  }),
}));

vi.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({ error: vi.fn() }),
}));

describe("WritingGoalSettings", () => {
  beforeEach(() => {
    updateGoalMock.mockClear();
  });

  it("keeps goal and reset-time edits local until changes are saved", async () => {
    const user = userEvent.setup();
    render(<WritingGoalSettings />);

    fireEvent.change(screen.getByLabelText("Daily word goal"), {
      target: { value: "600" },
    });
    await user.click(screen.getByRole("combobox", { name: "Daily reset time" }));
    await user.click(screen.getByRole("option", { name: "1 AM" }));

    expect(updateGoalMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(updateGoalMock).toHaveBeenCalledWith({
      dailyWritingGoal: 600,
      dailyWordResetHour: 1,
    });
  });

  it("saves toggling the goal immediately", async () => {
    const user = userEvent.setup();
    render(<WritingGoalSettings />);

    await user.click(screen.getByRole("switch", { name: "Daily Writing Goal" }));

    expect(updateGoalMock).toHaveBeenCalledWith({ dailyWritingGoal: null });
  });
});
