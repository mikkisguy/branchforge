import { CollapsibleSection } from "@/components/ide-shared/CollapsibleSection";
import { CharacterNode } from "./ScriptReferenceCharacterNode";
import type { Character } from "@branchforge/shared";

export interface ScriptReferenceCharactersSectionProps {
  characters: Character[];
  failedAvatars: Record<string, boolean>;
  onAvatarError: (characterId: string) => void;
  canEdit: boolean;
  onEdit?: (characterId: string) => void;
}

export function ScriptReferenceCharactersSection({
  characters,
  failedAvatars,
  onAvatarError,
  canEdit,
  onEdit,
}: ScriptReferenceCharactersSectionProps) {
  return (
    <CollapsibleSection title="Characters" defaultOpen={true}>
      {characters.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-4 text-center">
          <div className="size-10 rounded-full bg-muted/50 flex items-center justify-center mb-2">
            <span className="text-xl opacity-40">👥</span>
          </div>
          <p className="text-xs text-muted-foreground">No characters defined</p>
        </div>
      ) : (
        <div className="space-y-1">
          {characters.map((character) => (
            <CharacterNode
              key={character.id}
              character={character}
              failedAvatars={failedAvatars}
              onAvatarError={onAvatarError}
              canEdit={canEdit}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}
