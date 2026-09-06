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
    <div className="h-full min-h-0 overflow-y-auto">
      {!activeLabel ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-muted/50">
            <span className="text-2xl opacity-40">🏷️</span>
          </div>
          <p className="text-sm text-muted-foreground">No label selected</p>
        </div>
      ) : (
        <div>
          <div className="flex items-start justify-between gap-2 px-3 py-2">
            <p className="min-w-0 truncate text-sm font-medium">
              {activeLabel.title}
            </p>
            <button
              type="button"
              onClick={onEdit}
              className="shrink-0 rounded-md p-1 transition-colors hover:bg-muted/80"
              aria-label="Edit label properties"
              title="Edit label properties"
            >
              <Pencil className="size-3.5 text-muted-foreground" />
            </button>
          </div>
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
  );
}
