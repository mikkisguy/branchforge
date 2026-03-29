/**
 * WritingGoalSettings Component
 *
 * Settings section for configuring daily writing goals.
 * Includes enable/disable toggle, daily goal input, and reset time selection.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useWritingGoals } from "@/hooks/useWritingGoals";
import { useToast } from "@/contexts/ToastContext";
import { Target, Clock, RotateCcw } from "lucide-react";

// Writing goal constraints
const MIN_GOAL = 1;
const MAX_GOAL = 100000;

export function WritingGoalSettings() {
  const { settings, isLoading, isSaving, updateGoal, resetStats } =
    useWritingGoals();
  const { error: toastError } = useToast();
  const [detectedTimezone, setDetectedTimezone] = useState<string | null>(null);
  const [showResetConfirmDialog, setShowResetConfirmDialog] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  // Local state for immediate feedback; debounced to sync with server
  const [localGoalInput, setLocalGoalInput] = useState<string | undefined>(
    undefined
  );
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDisabled = isLoading || isSaving || isResetting;

  // Auto-detect timezone on mount
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setDetectedTimezone(tz);
  }, []);

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
    if (localGoalInput === undefined) return;

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
      setLocalGoalInput(undefined);
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
              <Target className="w-4 h-4 text-muted-foreground" />
              <label className="text-sm font-medium">Daily Writing Goal</label>
            </div>
            <p className="text-xs text-muted-foreground">
              Track your daily word count to build a consistent writing habit
            </p>
          </div>
          <Switch
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
                <input
                  id="daily-goal-input"
                  type="number"
                  min={MIN_GOAL}
                  max={MAX_GOAL}
                  step="100"
                  value={localGoalInput ?? dailyGoal}
                  onChange={(e) => handleGoalChange(e.target.value)}
                  disabled={isDisabled}
                  className="w-32 px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
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
                <Clock className="w-4 h-4 text-muted-foreground" />
                <label
                  htmlFor="reset-hour-select"
                  className="text-sm text-muted-foreground"
                >
                  Daily reset time
                </label>
              </div>
              <select
                id="reset-hour-select"
                value={resetHour}
                onChange={(e) => handleResetHourChange(e.target.value)}
                disabled={isDisabled}
                className="px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {hourOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
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
      {(isEnabled ||
        (settings?.dailyWordCounts && settings.dailyWordCounts.length > 0)) && (
        <div className="pt-2 border-t border-border">
          <button
            onClick={handleResetStats}
            disabled={isDisabled}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Clear recent word count history</span>
          </button>
          <p className="text-xs text-muted-foreground mt-1">
            Clear your word count history from the last 7 days
          </p>
        </div>
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
