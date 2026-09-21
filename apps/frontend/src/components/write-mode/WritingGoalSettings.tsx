/**
 * WritingGoalSettings Component
 *
 * Settings section for configuring daily writing goals.
 * Includes enable/disable toggle, daily goal input, and reset time selection.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useWritingGoals } from "@/hooks/useWritingGoals";
import { useToast } from "@/contexts/ToastContext";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

// Writing goal constraints
const MIN_GOAL = 1;
const MAX_GOAL = 100000;
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => {
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const ampm = hour < 12 ? "AM" : "PM";
  return { value: String(hour), label: `${displayHour} ${ampm}` };
});

export function WritingGoalSettings() {
  const { settings, isLoading, isSaving, updateGoal, resetStats } =
    useWritingGoals();
  const { error: toastError } = useToast();
  const isEnabled = settings?.dailyWritingGoal != null;
  const dailyGoal = settings?.dailyWritingGoal ?? 500;
  const resetHour = settings?.dailyWordResetHour ?? 0;
  const currentTimezone = useWritingGoalTimezone(settings, updateGoal);
  const draft = useWritingGoalDraft({
    isEnabled,
    dailyGoal,
    resetHour,
    updateGoal,
  });
  const reset = useWritingStatsReset(resetStats, toastError);

  return (
    <>
      <WritingGoalForm
        isEnabled={isEnabled}
        isDisabled={isLoading || isSaving || reset.isResetting}
        goalInput={draft.goalInput}
        selectedResetHour={draft.selectedResetHour}
        currentTimezone={currentTimezone}
        canSave={draft.canSave}
        showClearHistory={(settings?.dailyWordCounts.length ?? 0) > 0}
        onToggleEnabled={(checked) =>
          updateGoal({ dailyWritingGoal: checked ? dailyGoal : null })
        }
        onGoalChange={draft.setGoalInput}
        onResetHourChange={draft.setResetHour}
        onSave={draft.save}
        onClearHistory={reset.openConfirmation}
      />
      <ConfirmDialog
        open={reset.isConfirmationOpen}
        onOpenChange={reset.setConfirmationOpen}
        onConfirm={reset.confirm}
        title="Clear word count history?"
        description="This will clear your word count history from the last 7 days, including daily totals and per-label tracking. Your daily goal settings will remain unchanged."
        cancelLabel="Cancel"
        confirmLabel="Clear history"
        isLoading={reset.isResetting}
        loadingLabel="Clearing..."
      />
    </>
  );
}

type WritingGoalUpdate = Parameters<
  ReturnType<typeof useWritingGoals>["updateGoal"]
>[0];

function useWritingGoalTimezone(
  settings: ReturnType<typeof useWritingGoals>["settings"],
  updateGoal: (params: WritingGoalUpdate) => void
) {
  const detectedTimezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    []
  );

  useEffect(() => {
    if (settings && !settings.timezone && detectedTimezone) {
      // react-doctor-disable-next-line react-doctor/no-pass-data-to-parent -- Persisting a missing timezone is this settings hook's one-time initialization responsibility.
      updateGoal({ timezone: detectedTimezone });
    }
  }, [settings, detectedTimezone, updateGoal]);

  return settings?.timezone ?? detectedTimezone ?? "UTC";
}

function useWritingGoalDraft({
  isEnabled,
  dailyGoal,
  resetHour,
  updateGoal,
}: {
  isEnabled: boolean;
  dailyGoal: number;
  resetHour: number;
  updateGoal: (params: WritingGoalUpdate) => void;
}) {
  const [localGoalInput, setLocalGoalInput] = useState<string | null>(null);
  const [localResetHour, setLocalResetHour] = useState<string | null>(null);
  const goalInput = localGoalInput ?? String(dailyGoal);
  const selectedResetHour = localResetHour ?? String(resetHour);
  const clampedGoal = parseClampedGoal(goalInput);
  const parsedResetHour = parseResetHour(selectedResetHour);
  const canSave =
    (localGoalInput !== null || localResetHour !== null) &&
    (!isEnabled || (clampedGoal !== null && parsedResetHour !== null));

  const setResetHour = (value: string) => {
    if (parseResetHour(value) !== null) {
      setLocalResetHour(value);
    }
  };

  const save = () => {
    if (!canSave) return;

    updateGoal(
      createWritingGoalChanges(
        localGoalInput,
        localResetHour,
        clampedGoal,
        parsedResetHour
      )
    );
    setLocalGoalInput(null);
    setLocalResetHour(null);
  };

  return {
    goalInput,
    selectedResetHour,
    canSave,
    setGoalInput: setLocalGoalInput,
    setResetHour,
    save,
  };
}

function useWritingStatsReset(
  resetStats: () => Promise<void>,
  toastError: (message: string) => void
) {
  const [isConfirmationOpen, setConfirmationOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const openConfirmation = useCallback(() => setConfirmationOpen(true), []);
  const confirm = useCallback(async () => {
    setIsResetting(true);
    try {
      await resetStats();
      setConfirmationOpen(false);
    } catch (error) {
      console.error("Failed to reset writing statistics:", error);
      toastError(
        "Failed to reset writing statistics. Please try again or contact support if the problem persists."
      );
    } finally {
      setIsResetting(false);
    }
  }, [resetStats, toastError]);

  return {
    isConfirmationOpen,
    setConfirmationOpen,
    isResetting,
    openConfirmation,
    confirm,
  };
}

function parseClampedGoal(value: string): number | null {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? null : Math.max(MIN_GOAL, Math.min(MAX_GOAL, parsed));
}

function parseResetHour(value: string): number | null {
  const parsed = parseInt(value, 10);
  return !isNaN(parsed) && parsed >= 0 && parsed <= 23 ? parsed : null;
}

function createWritingGoalChanges(
  localGoalInput: string | null,
  localResetHour: string | null,
  clampedGoal: number | null,
  parsedResetHour: number | null
): WritingGoalUpdate {
  const changes: WritingGoalUpdate = {};
  if (localGoalInput !== null) changes.dailyWritingGoal = clampedGoal;
  if (localResetHour !== null && parsedResetHour !== null) {
    changes.dailyWordResetHour = parsedResetHour;
  }
  return changes;
}

interface WritingGoalFormProps {
  isEnabled: boolean;
  isDisabled: boolean;
  goalInput: string;
  selectedResetHour: string;
  currentTimezone: string;
  canSave: boolean;
  showClearHistory: boolean;
  onToggleEnabled: (checked: boolean) => void;
  onGoalChange: (value: string) => void;
  onResetHourChange: (value: string) => void;
  onSave: () => void;
  onClearHistory: () => void;
}

function WritingGoalForm({
  isEnabled,
  isDisabled,
  goalInput,
  selectedResetHour,
  currentTimezone,
  canSave,
  showClearHistory,
  onToggleEnabled,
  onGoalChange,
  onResetHourChange,
  onSave,
  onClearHistory,
}: WritingGoalFormProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <label
              htmlFor="writing-goal-toggle"
              className="text-sm font-medium"
            >
              Daily Writing Goal
            </label>
            <p className="text-xs text-muted-foreground">
              Track your daily word count to build a consistent writing habit
            </p>
          </div>
          <Switch
            id="writing-goal-toggle"
            checked={isEnabled}
            onCheckedChange={onToggleEnabled}
            disabled={isDisabled}
          />
        </div>

        {isEnabled && (
          <div className="space-y-4 pl-6">
            <div className="space-y-2">
              <label
                htmlFor="daily-goal-input"
                className="text-sm text-muted-foreground"
              >
                Daily word goal
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id="daily-goal-input"
                  type="number"
                  min={MIN_GOAL}
                  max={MAX_GOAL}
                  step="100"
                  value={goalInput}
                  onChange={(event) => onGoalChange(event.target.value)}
                  disabled={isDisabled}
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">words</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Common goals: 500, 1000, 1667 (NaNoWriMo), 2000
              </p>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="reset-hour-select"
                className="text-sm text-muted-foreground"
              >
                Daily reset time
              </label>
              <Select
                id="reset-hour-select"
                value={selectedResetHour}
                onChange={onResetHourChange}
                disabled={isDisabled}
                options={HOUR_OPTIONS}
                className="w-40"
              />
              <p className="text-xs text-muted-foreground">
                Your word count will reset at this time each day (currently{" "}
                {currentTimezone})
              </p>
            </div>
          </div>
        )}

        {isEnabled && (
          <div className="flex justify-end gap-2 pl-6">
            {showClearHistory && (
              <Button
                type="button"
                variant="outline"
                onClick={onClearHistory}
                disabled={isDisabled}
              >
                <RotateCcw className="size-4" />
                <span>Clear recent word count history</span>
              </Button>
            )}
            <Button
              type="button"
              onClick={onSave}
              disabled={isDisabled || !canSave}
            >
              Save changes
            </Button>
          </div>
        )}

        {isEnabled && (
          <div className="rounded-lg border border-border bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">How it works:</span> Only new words
              you write count toward your daily goal. Editing and re-saving
              existing content won't inflate your count. Your progress is
              tracked for the last 7 days.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
