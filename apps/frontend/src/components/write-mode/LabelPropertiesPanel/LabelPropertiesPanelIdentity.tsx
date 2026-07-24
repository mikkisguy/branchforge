import { useMemo } from "react";
import { CollapsibleSection } from "@/components/ide-shared/CollapsibleSection";
import type { LabelDetail, RouteConfig } from "@branchforge/shared";

const STATUS_COLORS = {
  FINAL: "var(--theme-final-color)",
  REVIEW: "var(--theme-review-color)",
  DRAFT: "var(--theme-draft-color)",
} as const;

interface PairGroup {
  id: string;
  characterAName: string;
  characterBName: string;
  duoEndingLabel: string;
}

interface LabelPropertiesPanelIdentityProps {
  activeLabel: LabelDetail;
  routeConfigs: RouteConfig[];
  pairGroups: PairGroup[];
}

export function LabelPropertiesPanelIdentity({
  activeLabel,
  routeConfigs,
  pairGroups,
}: LabelPropertiesPanelIdentityProps) {
  const routeConfig = useMemo(
    () => routeConfigs.find((r) => r.routeKey === activeLabel?.routeKey),
    [routeConfigs, activeLabel]
  );

  const duoEndingLabel = useMemo(() => {
    if (!activeLabel?.duoPairId) return null;
    return pairGroups.find((g) => g.id === activeLabel.duoPairId) ?? null;
  }, [activeLabel, pairGroups]);

  return (
    <CollapsibleSection title="Identity" defaultOpen={false}>
      <div className="space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Title</span>
          <span
            className="text-foreground font-medium truncate ml-2 max-w-[120px]"
            title={activeLabel.title}
          >
            {activeLabel.title}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Label Name</span>
          <span
            className="text-foreground font-medium font-mono truncate ml-2 max-w-[120px]"
            title={activeLabel.labelName ?? "—"}
          >
            {activeLabel.labelName ?? "—"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Route</span>
          <span
            className="text-foreground font-medium truncate ml-2 max-w-[120px]"
            title={routeConfig?.routeName ?? "Shared"}
          >
            {routeConfig?.routeName ?? "Shared"}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Status</span>
          <div className="flex items-center gap-1.5 ml-2">
            {activeLabel.status && (
              <span
                className="size-2 rounded-full shrink-0"
                style={{
                  backgroundColor:
                    STATUS_COLORS[
                      activeLabel.status as keyof typeof STATUS_COLORS
                    ] ?? "#9ca3af",
                }}
              />
            )}
            <span className="text-foreground font-medium">
              {activeLabel.status ?? "—"}
            </span>
          </div>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Visibility</span>
          <span
            className="text-foreground font-medium truncate ml-2 max-w-[120px]"
            title={activeLabel.visibility ?? "—"}
          >
            {activeLabel.visibility ?? "—"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Duo Ending</span>
          <span className="text-foreground font-medium truncate ml-2 max-w-[120px]">
            {duoEndingLabel
              ? `${duoEndingLabel.characterAName} & ${duoEndingLabel.characterBName}`
              : "—"}
          </span>
        </div>
      </div>
    </CollapsibleSection>
  );
}
