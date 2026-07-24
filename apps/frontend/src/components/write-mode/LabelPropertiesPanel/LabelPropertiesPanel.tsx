import { ChevronRight, ChevronLeft, Pencil } from "lucide-react";
import { cva } from "class-variance-authority";
import type {
  Character,
  LabelDetail,
  Stat,
  RouteConfig,
} from "@branchforge/shared";
import { LabelPropertiesPanelCharacters } from "./LabelPropertiesPanelCharacters";
import { LabelPropertiesPanelIdentity } from "./LabelPropertiesPanelIdentity";
import { LabelPropertiesPanelConditions } from "./LabelPropertiesPanelConditions";
import { LabelPropertiesPanelOutgoingJumps } from "./LabelPropertiesPanelOutgoingJumps";
import { LabelPropertiesPanelIncomingJumps } from "./LabelPropertiesPanelIncomingJumps";

const panelVariants = cva(
  "min-h-0 shrink-0 rounded-lg border border-border bg-panel-tinted mt-3 transition-all duration-300 ease-out",
  {
    variants: {
      collapsed: {
        true: "w-0 opacity-0 translate-x-full pointer-events-none max-md:absolute max-md:z-40 max-md:inset-y-0 max-md:right-0 max-md:h-full max-md:mt-0 max-md:rounded-none",
        false:
          "w-60 opacity-100 translate-x-0 max-md:absolute max-md:z-40 max-md:inset-y-0 max-md:right-0 max-md:h-full max-md:w-72 max-md:shadow-xl max-md:rounded-none max-md:mt-0",
      },
    },
  }
);

interface LabelPropertiesPanelProps {
  activeLabel: LabelDetail | undefined;
  characters: Character[];
  stats: Stat[];
  routeConfigs: RouteConfig[];
  pairGroups: Array<{
    id: string;
    characterAName: string;
    characterBName: string;
    duoEndingLabel: string;
  }>;
  isCollapsed: boolean;
  onCollapseToggle?: () => void;
  onEdit: () => void;
  onCharacterEdit?: (characterId: string) => void;
}

export function LabelPropertiesPanel({
  activeLabel,
  characters,
  stats,
  routeConfigs,
  pairGroups,
  isCollapsed,
  onCollapseToggle,
  onEdit,
  onCharacterEdit,
}: LabelPropertiesPanelProps) {
  return (
    <>
      <div
        className={panelVariants({ collapsed: isCollapsed })}
        aria-hidden={isCollapsed}
        inert={isCollapsed}
      >
        <div className="h-full overflow-y-auto relative">
          <div className="sticky top-0 z-20 bg-card border-b border-border px-3 py-2">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold tracking-wide">
                  Properties
                </h2>
                {activeLabel && (
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    {activeLabel.title}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-2">
                {activeLabel && (
                  <button
                    type="button"
                    onClick={onEdit}
                    className="p-1 rounded-md hover:bg-muted/80 transition-colors"
                    aria-label="Edit label properties"
                    title="Edit label properties"
                  >
                    <Pencil className="size-3.5 text-muted-foreground" />
                  </button>
                )}
                {onCollapseToggle && (
                  <button
                    type="button"
                    onClick={onCollapseToggle}
                    className="p-1 rounded-md hover:bg-muted/80 transition-colors"
                    aria-label="Collapse properties sidebar"
                    title="Collapse properties sidebar"
                  >
                    <ChevronRight className="size-3.5 text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {!activeLabel ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="size-12 rounded-full bg-muted/50 flex items-center justify-center mb-2">
                <span className="text-2xl opacity-40">🏷️</span>
              </div>
              <p className="text-sm text-muted-foreground">No label selected</p>
            </div>
          ) : (
            <div>
              <LabelPropertiesPanelCharacters
                activeLabel={activeLabel}
                characters={characters}
                onCharacterEdit={onCharacterEdit}
              />
              <LabelPropertiesPanelIdentity
                activeLabel={activeLabel}
                routeConfigs={routeConfigs}
                pairGroups={pairGroups}
              />
              <LabelPropertiesPanelConditions
                conditions={activeLabel.conditions}
                stats={stats}
              />
              <LabelPropertiesPanelOutgoingJumps
                activeLabel={activeLabel}
                stats={stats}
              />
              <LabelPropertiesPanelIncomingJumps
                incomingJumps={activeLabel.incomingJumps}
                stats={stats}
              />
            </div>
          )}
        </div>
      </div>

      {isCollapsed && onCollapseToggle && (
        <div className="min-h-0 shrink-0 mt-3 flex items-start -ml-4 max-md:hidden">
          <button
            type="button"
            onClick={onCollapseToggle}
            className="size-12 rounded-lg border border-border bg-card/50 hover:bg-muted/80 transition-colors flex items-center justify-center"
            aria-label="Expand properties sidebar"
            title="Expand properties sidebar"
          >
            <ChevronLeft className="size-4 text-muted-foreground" />
          </button>
        </div>
      )}
    </>
  );
}
