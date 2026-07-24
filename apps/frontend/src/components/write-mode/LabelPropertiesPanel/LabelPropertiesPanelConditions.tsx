import { useMemo } from "react";
import { CollapsibleSection } from "@/components/ide-shared/CollapsibleSection";
import {
  formatVariableCondition,
  formatStatCondition,
} from "@/lib/format-conditions";
import { FormattedCondition } from "@/components/write-mode/FormattedCondition";
import type { LabelDetail, Stat } from "@branchforge/shared";

interface LabelPropertiesPanelConditionsProps {
  conditions: LabelDetail["conditions"];
  stats: Stat[];
}

export function LabelPropertiesPanelConditions({
  conditions,
  stats,
}: LabelPropertiesPanelConditionsProps) {
  const statByKey = useMemo(
    () => new Map(stats.map((s) => [s.key, s])),
    [stats]
  );

  if (!conditions) {
    return (
      <CollapsibleSection title="Access Conditions" defaultOpen={false}>
        <p className="text-xs text-muted-foreground">No access conditions</p>
      </CollapsibleSection>
    );
  }

  return (
    <CollapsibleSection title="Access Conditions" defaultOpen={false}>
      <div className="space-y-3 text-xs">
        <div>
          <p className="text-muted-foreground mb-1.5">Variables</p>
          <div className="flex flex-wrap gap-1">
            {conditions.variables &&
            Object.keys(conditions.variables).length > 0 ? (
              Object.entries(conditions.variables).map(
                ([varName, condition]) => (
                  <span
                    key={varName}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/80 border border-border/50 text-xs text-foreground"
                  >
                    <FormattedCondition
                      parts={formatVariableCondition(varName, condition)}
                    />
                  </span>
                )
              )
            ) : (
              <span className="text-muted-foreground">None</span>
            )}
          </div>
        </div>
        <div>
          <p className="text-muted-foreground mb-1.5">Stats</p>
          <div className="flex flex-wrap gap-1">
            {conditions.stats && Object.keys(conditions.stats).length > 0 ? (
              Object.entries(conditions.stats).map(([statKey, value]) => {
                const stat = statByKey.get(statKey);
                const displayName = stat?.name ?? statKey;
                const condition =
                  typeof value === "number"
                    ? { value, operator: ">=" as const }
                    : value;
                return (
                  <span
                    key={statKey}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/80 border border-border/50 text-xs text-foreground"
                  >
                    <FormattedCondition
                      parts={formatStatCondition(displayName, condition)}
                    />
                  </span>
                );
              })
            ) : (
              <span className="text-muted-foreground">None</span>
            )}
          </div>
        </div>
      </div>
    </CollapsibleSection>
  );
}
