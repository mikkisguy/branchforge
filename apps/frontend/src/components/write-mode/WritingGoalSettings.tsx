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

export function WritingGoalSettings() {
  const { settings, isLoading, isSaving, updateGoal, resetStats } =
    useWritingGoals();
  const { error: toastError } = useToast();
  const [showResetConfirmDialog, setShowResetConfirmDialog] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  // Null draft values use the server setting. A non-null value is an unsaved
  // change that is applied only when the user chooses Save.
  const [localGoalInput, setLocalGoalInput] = useState<string | null>(null);
  const [localResetHour, setLocalResetHour] = useState<string | null>(null);

  const isDisabled = isLoading || isSaving || isResetting;

  // Detect timezone during render instead of effect chain
  const detectedTimezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    []
  );

  // Save detected timezone if user has none set
  useEffect(() => {
    if (settings && !settings.timezone && detectedTimezone) {
      updateGoal({ timezone: detectedTimezone });
    }
  }, [settings, detectedTimezone, updateGoal]);

  const isEnabled = settings?.dailyWritingGoal != null;
  const dailyGoal = settings?.dailyWritingGoal ?? 500;
  const resetHour = settings?.dailyWordResetHour ?? 0;
  const currentTimezone = settings?.timezone ?? detectedTimezone ?? "UTC";
  const goalInput = localGoalInput ?? String(dailyGoal);
  const selectedResetHour = localResetHour ?? String(resetHour);
  const parsedGoal = parseInt(goalInput, 10);
  const hasValidGoal = !isNaN(parsedGoal);
  const clampedGoal = hasValidGoal
    ? Math.max(MIN_GOAL, Math.min(MAX_GOAL, parsedGoal))
    : null;
  const parsedResetHour = parseInt(selectedResetHour, 10);
  const hasValidResetHour =
    !isNaN(parsedResetHour) && parsedResetHour >= 0 && parsedResetHour <= 23;
  const hasUnsavedChanges = localGoalInput !== null || localResetHour !== null;
  const canSave =
    hasUnsavedChanges &&
    (!isEnabled || (clampedGoal !== null && hasValidResetHour));

  const handleToggleEnabled = (checked: boolean) => {
    updateGoal({ dailyWritingGoal: checked ? dailyGoal : null });
  };

  const handleGoalChange = (value: string) => {
    setLocalGoalInput(value);
  };

  const handleResetHourChange = (value: string) => {
    const hour = parseInt(value, 10);
    if (!isNaN(hour) && hour >= 0 && hour <= 23) {
      setLocalResetHour(value);
    }
  };

  const handleSave = () => {
    if (!canSave) return;

    const changes: {
      dailyWritingGoal?: number | null;
      dailyWordResetHour?: number;
    } = {};

    if (localGoalInput !== null) {
      changes.dailyWritingGoal = clampedGoal;
    }

    if (localResetHour !== null && hasValidResetHour) {
      changes.dailyWordResetHour = parsedResetHour;
    }

    updateGoal(changes);
    setLocalGoalInput(null);
    setLocalResetHour(null);
  };

  const handleResetStats = useCallback(() => {
    setShowResetConfirmDialog(true);
  }, []);

  const handleResetConfirmed = useCallback(async () => {
    setIsResetting(true);
    try {
      await resetStats();
      setShowResetConfirmDialog(false);
    } catch (error) {
      console.error("Failed to reset writing statistics:", error);
      toastError(
        "Failed to reset writing statistics. Please try again or contact support if the problem persists."
      );
    } finally {
      setIsResetting(false);
    }
  }, [resetStats, toastError]);

  // Generate options for reset hour (0-23)
  const hourOptions = Array.from({ length: 24 }, (_, i) => {
    const hour = i;
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    const ampm = hour < 12 ? "AM" : "PM";
    return { value: hour, label: `${displayHour} ${ampm}` };
  });

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <label
                htmlFor="writing-goal-toggle"
                className="text-sm font-medium"
              >
                Daily Writing Goal
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Track your daily word count to build a consistent writing habit
            </p>
          </div>
          <Switch
            id="writing-goal-toggle"
            checked={isEnabled}
            onCheckedChange={handleToggleEnabled}
            disabled={isDisabled}
          />
        </div>

        {isEnabled && (
          <div className="space-y-4 pl-6">
            {/* Daily Goal Input */}
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
                  onChange={(e) => handleGoalChange(e.target.value)}
                  disabled={isDisabled}
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">words</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Common goals: 500, 1000, 1667 (NaNoWriMo), 2000
              </p>
            </div>

            {/* Reset Hour Select */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label
                  htmlFor="reset-hour-select"
                  className="text-sm text-muted-foreground"
                >
                  Daily reset time
                </label>
              </div>
              <Select
                id="reset-hour-select"
                value={selectedResetHour}
                onChange={(value) => handleResetHourChange(value)}
                disabled={isDisabled}
                options={hourOptions.map((opt) => ({
                  value: String(opt.value),
                  label: opt.label,
                }))}
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
            {settings?.dailyWordCounts &&
              settings.dailyWordCounts.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleResetStats}
                  disabled={isDisabled}
                >
                  <RotateCcw className="size-4" />
                  <span>Clear recent word count history</span>
                </Button>
              )}
            <Button
              type="button"
              onClick={handleSave}
              disabled={isDisabled || !canSave}
            >
              Save changes
            </Button>
          </div>
        )}

        {isEnabled && (
          <div className="rounded-lg border border-border bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">How it works:</span> Only new
              words you write count toward your daily goal. Editing and
              re-saving existing content won't inflate your count. Your
              progress is tracked for the last 7 days.
            </p>
          </div>
        )}
      </div>

      {/* Reset Confirmation Dialog */}
      <ConfirmDialog
        open={showResetConfirmDialog}
        onOpenChange={setShowResetConfirmDialog}
        onConfirm={handleResetConfirmed}
        title="Clear word count history?"
        description="This will clear your word count history from the last 7 days, including daily totals and per-label tracking. Your daily goal settings will remain unchanged."
        cancelLabel="Cancel"
        confirmLabel="Clear history"
        isLoading={isResetting}
        loadingLabel="Clearing..."
      />
    </div>
  );
}
