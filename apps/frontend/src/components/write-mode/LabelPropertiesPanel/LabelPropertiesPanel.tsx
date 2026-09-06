import { Pencil } from "lucide-react";
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
  onEdit: () => void;
  onCharacterEdit?: (characterId: string) => void;
}

export function LabelPropertiesPanel({
  activeLabel,
  characters,
  stats,
  routeConfigs,
  pairGroups,
  onEdit,
  onCharacterEdit,
}: LabelPropertiesPanelProps) {
  return (
    <div className="h-full min-h-0 overflow-hidden bg-transparent">
      <div className="relative h-full overflow-y-auto">
        <div className="sticky top-0 z-20 border-b border-border bg-panel px-3 py-2">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold tracking-wide">
                Properties
              </h2>
              {activeLabel && (
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {activeLabel.title}
                </p>
              )}
            </div>
            {activeLabel && (
              <button
                type="button"
                onClick={onEdit}
                className="rounded-md p-1 transition-colors hover:bg-muted/80"
                aria-label="Edit label properties"
                title="Edit label properties"
              >
                <Pencil className="size-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        {!activeLabel ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-muted/50">
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
  );
}
