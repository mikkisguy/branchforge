import { useMemo } from "react";
import { CollapsibleSection } from "@/components/ide-shared/CollapsibleSection";
import type { LabelDetail, Stat } from "@branchforge/shared";

interface OutgoingJumpItemProps {
  jump: {
    targetLabelId: string;
    targetLabelName: string;
    jumpType: "MENU_CHOICE" | "AUTOMATIC";
    choiceText: string;
    conditionFlags?: string[];
    effects?: Record<string, number>;
  };
  statByKey: Map<string, Stat>;
}

function OutgoingJumpItem({ jump, statByKey }: OutgoingJumpItemProps) {
  return (
    <div className="p-2 rounded-lg bg-muted/30 border border-border/50 text-xs">
      <div className="font-medium text-foreground truncate">
        {jump.targetLabelName}
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
        <span className="truncate flex-1">{jump.choiceText}</span>
      </div>
      {jump.conditionFlags && jump.conditionFlags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {jump.conditionFlags.map((flag) => (
            <span
              key={flag}
              className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted/80 border border-border/50 font-mono text-muted-foreground"
            >
              {flag}
            </span>
          ))}
        </div>
      )}
      {jump.effects && Object.keys(jump.effects).length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {Object.entries(jump.effects).map(([statKey, value]) => {
            const stat = statByKey.get(statKey);
            return (
              <span
                key={statKey}
                className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted/80 border border-border/50 font-mono text-muted-foreground"
              >
                {stat?.name ?? statKey} {value > 0 ? "+" : ""}
                {value}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface LabelPropertiesPanelOutgoingJumpsProps {
  activeLabel: LabelDetail;
  stats: Stat[];
}

export function LabelPropertiesPanelOutgoingJumps({
  activeLabel,
  stats,
}: LabelPropertiesPanelOutgoingJumpsProps) {
  const statByKey = useMemo(
    () => new Map(stats.map((s) => [s.key, s])),
    [stats]
  );

  const outgoingJumps = useMemo(() => {
    if (!activeLabel?.lines) return [];
    const jumps: Array<{
      targetLabelId: string;
      targetLabelName: string;
      jumpType: "MENU_CHOICE" | "AUTOMATIC";
      choiceText: string;
      conditionFlags?: string[];
      effects?: Record<string, number>;
    }> = [];

    for (const line of activeLabel.lines) {
      if (line.menuOptions) {
        for (const opt of line.menuOptions) {
          if (!opt.targetLabelId) continue;
          jumps.push({
            targetLabelId: opt.targetLabelId,
            targetLabelName: opt.targetLabelName,
            jumpType: "MENU_CHOICE",
            choiceText: opt.label,
            conditionFlags: opt.conditionFlags,
            effects: opt.effects?.stats,
          });
        }
      }
      if (line.contentType === "JUMP" && line.content) {
        const match = line.content.match(/jump\s+(\S+)/);
        if (match) {
          jumps.push({
            targetLabelId: match[1],
            targetLabelName: match[1],
            jumpType: "AUTOMATIC",
            choiceText: match[1],
          });
        }
      }
    }
    return jumps;
  }, [activeLabel]);

  return (
    <CollapsibleSection
      title="Outgoing Jumps"
      defaultOpen={false}
      headerAction={
        outgoingJumps.length > 0 ? (
          <span className="text-xs text-muted-foreground">
            ({outgoingJumps.length})
          </span>
        ) : null
      }
    >
      <div className="space-y-2">
        <div className="border-t border-border/50" />
        {outgoingJumps.length === 0 ? (
          <p className="text-xs text-muted-foreground">No outgoing jumps</p>
        ) : (
          <div className="space-y-2">
            {outgoingJumps.map((jump) => (
              <OutgoingJumpItem
                key={`${jump.targetLabelId}-${jump.choiceText}`}
                jump={jump}
                statByKey={statByKey}
              />
            ))}
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}
