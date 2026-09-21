import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    vi.useFakeTimers();
    updateGoalMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves a spinner value once when the save re-renders the settings", () => {
    const { rerender } = render(<WritingGoalSettings />);

    fireEvent.change(screen.getByLabelText("Daily word goal"), {
      target: { value: "600" },
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    // A TanStack Query mutation re-renders the component after it begins.
    rerender(<WritingGoalSettings />);

    act(() => {
      vi.advanceTimersByTime(1_500);
    });

    expect(updateGoalMock).toHaveBeenCalledTimes(1);
    expect(updateGoalMock).toHaveBeenCalledWith({ dailyWritingGoal: 600 });
  });
});
