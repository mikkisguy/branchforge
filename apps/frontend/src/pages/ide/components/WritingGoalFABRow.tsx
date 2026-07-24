import { BarChart3 } from "lucide-react";
import { useFABPopover } from "@/components/ide-shared";

interface WritingGoalFABRowProps {
  todayWordCount: number;
  dailyGoal: number;
  onOpenStats: () => void;
}

export function WritingGoalFABRow({
  todayWordCount,
  dailyGoal,
  onOpenStats,
}: WritingGoalFABRowProps) {
  const { closePopover } = useFABPopover();
  const pct =
    dailyGoal > 0
      ? Math.min(100, Math.round((todayWordCount / dailyGoal) * 100))
      : 0;
  return (
    <button
      type="button"
      onClick={() => {
        onOpenStats();
        closePopover();
      }}
      className="flex flex-col w-full px-3 py-2 text-sm hover:bg-muted/50 transition-colors text-left"
    >
      <span className="flex items-center gap-3 w-full">
        <BarChart3 className="size-4 shrink-0" />
        <span className="flex-1">Writing Goal</span>
        <span className="text-xs text-muted-foreground shrink-0">{pct}%</span>
      </span>
      <span className="pl-7 text-xs text-muted-foreground mt-0.5">
        {todayWordCount.toLocaleString()} / {dailyGoal.toLocaleString()} words
      </span>
    </button>
  );
}
