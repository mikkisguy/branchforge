/**
 * Stat Progression View
 *
 * Shows all labels that affect a selected stat, including condition
 * thresholds and effect deltas. This helps authors understand where and
 * how stat values change across the visual novel.
 */

import { Loader2 } from "lucide-react";
import type { StatProgression as StatProgressionType } from "@branchforge/shared";

interface StatProgressionProps {
  progression: StatProgressionType | null;
  isLoading: boolean;
  error: Error | null;
}

export function StatProgression({
  progression,
  isLoading,
  error,
}: StatProgressionProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    console.error(error);
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-destructive mb-2">
          Failed to load progression data
        </p>
        <p className="text-xs text-muted-foreground">
          Unable to load progression. Please try again.
        </p>
      </div>
    );
  }

  if (!progression) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">
          Select a stat to see its progression
        </p>
      </div>
    );
  }

  if (progression.labels.length === 0) {
    return (
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-medium">{progression.statName}</h3>
          <p className="text-xs text-muted-foreground">
            Range: {progression.minValue}&ndash;{progression.maxValue}
            {" · "}0 labels
          </p>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-muted-foreground mb-1">
            No labels reference this stat yet
          </p>
          <p className="text-xs text-muted-foreground">
            Label conditions and effects using &quot;{progression.statKey}
            &quot; will appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">{progression.statName}</h3>
        <p className="text-xs text-muted-foreground">
          Range: {progression.minValue}&ndash;{progression.maxValue}
          {" · "}
          {progression.labels.length} label
          {progression.labels.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="border border-border/30 rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="border-b border-border/30">
              <th className="text-left p-3 font-medium text-muted-foreground">
                Label
              </th>
              <th className="text-left p-3 font-medium text-muted-foreground">
                Route
              </th>
              <th className="text-center p-3 font-medium text-muted-foreground">
                Condition
              </th>
              <th className="text-center p-3 font-medium text-muted-foreground">
                Effect
              </th>
            </tr>
          </thead>
          <tbody>
            {progression.labels.map((le) => (
              <tr
                key={le.labelId}
                className="border-b border-border/20 last:border-b-0 hover:bg-muted/30"
              >
                <td className="p-3">{le.labelTitle}</td>
                <td className="p-3">
                  {le.routeKey ? (
                    <span className="text-xs px-2 py-0.5 rounded bg-muted font-mono">
                      {le.routeKey}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Shared
                    </span>
                  )}
                </td>
                <td className="p-3 text-center">
                  {le.conditionValue !== null ? (
                    <span className="font-mono text-xs">
                      &ge; {le.conditionValue}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">&mdash;</span>
                  )}
                </td>
                <td className="p-3 text-center">
                  {le.effectDelta !== null ? (
                    <span
                      className={`font-mono text-xs ${
                        le.effectDelta > 0
                          ? "text-green-600 dark:text-green-400"
                          : le.effectDelta < 0
                            ? "text-red-600 dark:text-red-400"
                            : "text-muted-foreground"
                      }`}
                    >
                      {le.effectDelta > 0 ? "+" : ""}
                      {le.effectDelta}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">&mdash;</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
