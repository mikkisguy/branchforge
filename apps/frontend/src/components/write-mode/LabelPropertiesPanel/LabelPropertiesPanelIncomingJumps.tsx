import { useMemo } from "react";
import { CollapsibleSection } from "@/components/ide-shared/CollapsibleSection";
import {
  formatVariableCondition,
  formatStatCondition,
} from "@/lib/format-conditions";
import { FormattedCondition } from "@/components/write-mode/FormattedCondition";
import type { LabelDetail, Stat } from "@branchforge/shared";

interface LabelPropertiesPanelIncomingJumpsProps {
  incomingJumps: LabelDetail["incomingJumps"];
  stats: Stat[];
}

export function LabelPropertiesPanelIncomingJumps({
  incomingJumps,
  stats,
}: LabelPropertiesPanelIncomingJumpsProps) {
  const statByKey = useMemo(
    () => new Map(stats.map((s) => [s.key, s])),
    [stats]
  );

  const hasJumps = incomingJumps && incomingJumps.length > 0;

  return (
    <CollapsibleSection
      title="Incoming Jumps"
      defaultOpen={false}
      headerAction={
        hasJumps ? (
          <span className="text-xs text-muted-foreground">
            ({incomingJumps.length})
          </span>
        ) : null
      }
    >
      {!hasJumps ? (
        <p className="text-xs text-muted-foreground">No incoming jumps</p>
      ) : (
        <div className="space-y-2">
          {incomingJumps.map((jump, i) => (
            <div
              key={`${jump.sourceLabelId}-${jump.choiceText}-${i}`}
              className="p-2 rounded-lg bg-muted/30 border border-border/50 text-xs"
            >
              <div className="font-medium text-foreground truncate">
                {jump.sourceLabelTitle}
              </div>
              <div className="flex items-center gap-2 mt-1 text-muted-foreground">
                {jump.jumpType === "MENU_CHOICE" ? (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600">
                    Choice
                  </span>
                ) : (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-green-500/10 text-green-600">
                    Auto
                  </span>
                )}
                <span className="truncate flex-1">
                  {jump.choiceText?.trim()
                    ? jump.choiceText
                    : "Untitled choice"}
                </span>
              </div>
              {jump.conditions && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {jump.conditions.variables &&
                    Object.entries(jump.conditions.variables).map(
                      ([varName, condition]) => (
                        <span
                          key={varName}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/80 border border-border/50 text-muted-foreground"
                        >
                          <FormattedCondition
                            parts={formatVariableCondition(varName, condition)}
                          />
                        </span>
                      )
                    )}
                  {jump.conditions.stats &&
                    Object.entries(jump.conditions.stats).map(
                      ([statKey, condition]) => {
                        const stat = statByKey.get(statKey);
                        const displayName = stat?.name ?? statKey;
                        return (
                          <span
                            key={statKey}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/80 border border-border/50 text-foreground"
                          >
                            <FormattedCondition
                              parts={formatStatCondition(
                                displayName,
                                condition
                              )}
                            />
                          </span>
                        );
                      }
                    )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}
