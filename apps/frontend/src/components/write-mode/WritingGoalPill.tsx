/**
 * WritingGoalPill Component
 *
 * Simple pill-shaped writing goal indicator showing "[count] to go" with percentage.
 * Matches app design system with theme colors and gentle feedback.
 */

import { memo } from "react";

interface WritingGoalPillProps {
  current: number; // Current word count for today
  goal: number; // Daily word goal
  onClick?: () => void; // Optional click handler to open stats dialog
}

export const WritingGoalPill = memo(function WritingGoalPill({
  current,
  goal,
  onClick,
}: WritingGoalPillProps) {
  const remaining = Math.max(0, goal - current);
  const progress = goal > 0 ? Math.min(current / goal, 1) : 0;
  const progressPercent = Math.round(progress * 100);
  const radius = 10;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);
  const isComplete = progress >= 1;

  return (
    // react-doctor-disable-next-line react-doctor/no-static-element-interactions
    <div
      className={`flex items-center gap-2.5 rounded-xl border border-border/60 bg-card px-3 py-1.5 transition-all duration-200 outline-none ${
        onClick
          ? "cursor-pointer hover:bg-accent/50 hover:border-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          : ""
      }`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {/* Circular progress */}
      <div className="relative size-6 shrink-0">
        <svg className="size-6 -rotate-90" viewBox="0 0 24 24" aria-hidden>
          <circle
            cx="12"
            cy="12"
            r={radius}
            className="fill-none stroke-muted"
            strokeWidth="2"
          />
          <circle
            cx="12"
            cy="12"
            r={radius}
            className={`fill-none transition-all duration-500 ease-out ${
              isComplete ? "stroke-green-500" : "stroke-[var(--theme-color)]"
            }`}
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
      </div>

      {/* Text indicator */}
      <span className="text-xs font-medium shrink-0 text-muted-foreground max-sm:whitespace-normal whitespace-nowrap">
        {remaining} words to go
      </span>

      {/* Percentage indicator */}
      <span className="text-xs text-muted-foreground/60 shrink-0">
        {progressPercent}%
      </span>

      {/* Goal indicator */}
      <span className="text-xs text-muted-foreground/60 shrink-0">
        {goal} words
      </span>

      {/* Click hint */}
      {onClick && (
        <span className="text-xs text-muted-foreground/40 shrink-0 max-sm:hidden">
          Click for stats
        </span>
      )}
    </div>
  );
});
