/**
 * WritingGoalSettings Component
 *
 * Settings section for configuring daily writing goals.
 * Includes enable/disable toggle, daily goal input, and reset time selection.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  // Explicit state: null = use server value, string = user is editing
  const [localGoalInput, setLocalGoalInput] = useState<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const handleToggleEnabled = (checked: boolean) => {
    updateGoal({ dailyWritingGoal: checked ? dailyGoal : null });
  };

  const handleGoalChange = (value: string) => {
    setLocalGoalInput(value);
  };

  // Persist debounced goal changes to server
  useEffect(() => {
    // Only persist if we have a local value different from server
    if (localGoalInput === null) return;

    const num = parseInt(localGoalInput, 10);
    if (isNaN(num)) return;

    const clamped = Math.max(MIN_GOAL, Math.min(MAX_GOAL, num));

    debounceTimerRef.current = setTimeout(() => {
      updateGoal({ dailyWritingGoal: clamped });
      debounceTimerRef.current = null; // Clear ref after debounce completes
    }, 500); // 500ms debounce

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null; // Clear ref on cleanup
      }
    };
  }, [localGoalInput, updateGoal]);

  // Sync local state with server state when settings change
  useEffect(() => {
    // Skip resetting if a debounce is pending (user is still typing)
    if (debounceTimerRef.current) return;

    if (settings?.dailyWritingGoal != null) {
      setLocalGoalInput(null);
    }
  }, [settings?.dailyWritingGoal]);

  const handleResetHourChange = (value: string) => {
    const hour = parseInt(value, 10);
    if (!isNaN(hour) && hour >= 0 && hour <= 23) {
      updateGoal({ dailyWordResetHour: hour });
    }
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
                  value={localGoalInput ?? dailyGoal}
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
                value={String(resetHour)}
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
      </div>

      {/* Info Box */}
      {isEnabled && (
        <div className="rounded-lg bg-muted/50 border border-border p-3">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">How it works:</span> Only new words
            you write count toward your daily goal. Editing and re-saving
            existing content won't inflate your count. Your progress is tracked
            for the last 7 days.
          </p>
        </div>
      )}

      {/* Reset Stats Button */}
      {isEnabled &&
        settings?.dailyWordCounts &&
        settings.dailyWordCounts.length > 0 && (
          <Button
            type="button"
            variant="outline"
            onClick={handleResetStats}
            className="w-full"
            disabled={isDisabled}
          >
            <RotateCcw className="size-4" />
            <span>Clear recent word count history</span>
          </Button>
        )}

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
