/**
 * WritingGoalPill Component
 *
 * Simple pill-shaped writing goal indicator showing "[count] to go" with percentage.
 * Matches app design system with theme colors and gentle feedback.
 */

interface WritingGoalPillProps {
  current: number;
  goal: number;
  type: "words" | "lines";
}

export function WritingGoalPill({ current, goal, type }: WritingGoalPillProps) {
  const remaining = Math.max(0, goal - current);
  const progress = goal > 0 ? Math.min(current / goal, 1) : 0;
  const progressPercent = Math.round(progress * 100);
  const radius = 10;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-card px-3 py-1.5">
      {/* Circular progress */}
      <div className="relative h-6 w-6 shrink-0">
        <svg className="h-6 w-6 -rotate-90" viewBox="0 0 24 24" aria-hidden>
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
            className="fill-none stroke-[var(--theme-color)] transition-all duration-500 ease-out"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
      </div>

      {/* Text indicator */}
      <span className="text-xs font-medium shrink-0 text-muted-foreground whitespace-nowrap">
        {remaining} {type} to go
      </span>

      {/* Percentage indicator */}
      <span className="text-xs text-muted-foreground/60 shrink-0">
        {progressPercent}%
      </span>

      {/* Goal setting hint */}
      <button
        className="text-xs text-muted-foreground/60 hover:text-foreground transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-ring rounded px-1"
        title={`Goal: ${goal} ${type}`}
        onClick={() => {
          // TODO: Implement goal setting popover
        }}
      >
        {goal} {type}
      </button>
    </div>
  );
}
