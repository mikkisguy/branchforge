/**
 * WritingStatsDialog Component
 *
 * Dialog showing 7-day word count history with a bar chart.
 * Displays daily progress relative to the daily goal.
 */

import { format } from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DailyWordCount {
  date: string;
  count: number;
}

interface WritingStatsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dailyGoal: number;
  dailyWordCounts: DailyWordCount[];
}

// Custom tooltip for the chart
function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
}) {
  if (active && payload && payload.length > 0) {
    return (
      <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg">
        <p className="text-sm font-medium">{payload[0].value} words</p>
      </div>
    );
  }
  return null;
}

export function WritingStatsDialog({
  open,
  onOpenChange,
  dailyGoal,
  dailyWordCounts,
}: WritingStatsDialogProps) {
  // Prepare chart data with filled-in missing dates
  const chartData = dailyWordCounts.map((entry) => {
    const date = new Date(entry.date);
    return {
      dateLabel: format(date, "EEE MMM d"), // e.g., "Mon Jan 15"
      count: entry.count,
    };
  });

  // Calculate statistics
  const totalWords = dailyWordCounts.reduce(
    (sum, entry) => sum + entry.count,
    0
  );
  const avgWords =
    dailyWordCounts.length > 0
      ? Math.round(totalWords / dailyWordCounts.length)
      : 0;
  const daysMetGoal = dailyWordCounts.filter(
    (entry) => entry.count >= dailyGoal
  ).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[500px] max-w-[95vw]">
        <DialogHeader className="flex-row items-center justify-between p-6 pb-4">
          <DialogTitle className="text-lg font-medium">
            Writing Statistics
          </DialogTitle>
          <button
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close dialog"
          >
            <X className="size-5" />
          </button>
        </DialogHeader>

        <div className="p-6 pt-0 space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-[var(--theme-color)]">
                {totalWords.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Total words</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-foreground">
                {avgWords.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Avg/day</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-green-500">
                {daysMetGoal}/{dailyWordCounts.length}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Goals met</p>
            </div>
          </div>

          {/* Chart */}
          {chartData.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Last 7 Days</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 20, right: 10, left: 10, bottom: 20 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border)"
                      opacity={0.3}
                    />
                    <XAxis
                      dataKey="dateLabel"
                      tick={{
                        fill: "hsl(var(--muted-foreground))",
                        fontSize: 11,
                      }}
                      axisLine={{ stroke: "var(--border)" }}
                    />
                    <YAxis
                      tick={{
                        fill: "hsl(var(--muted-foreground))",
                        fontSize: 11,
                      }}
                      axisLine={{ stroke: "var(--border)" }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <ReferenceLine
                      y={dailyGoal}
                      stroke="hsl(var(--muted-foreground) / 0.5)"
                      strokeDasharray="4 4"
                      label={{
                        value: "Goal",
                        fill: "hsl(var(--muted-foreground))",
                        fontSize: 10,
                      }}
                    />
                    <Bar
                      dataKey="count"
                      fill="var(--theme-color)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">No writing data yet</p>
              <p className="text-xs mt-1">
                Start writing to track your progress
              </p>
            </div>
          )}

          {/* Info text */}
          <p className="text-xs text-muted-foreground text-center">
            Your daily writing goal is {dailyGoal.toLocaleString()} words. Word
            counts reset at midnight your local time.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
