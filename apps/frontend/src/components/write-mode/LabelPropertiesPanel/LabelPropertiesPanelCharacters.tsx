import { useMemo } from "react";
import { Heart } from "lucide-react";
import { CharacterAvatarChip } from "@/components/ui/CharacterAvatarChip";
import { CollapsibleSection } from "@/components/ide-shared/CollapsibleSection";
import type { Character, LabelDetail } from "@branchforge/shared";

interface LabelPropertiesPanelCharactersProps {
  activeLabel: LabelDetail;
  characters: Character[];
  onCharacterEdit?: (characterId: string) => void;
}

export function LabelPropertiesPanelCharacters({
  activeLabel,
  characters,
  onCharacterEdit,
}: LabelPropertiesPanelCharactersProps) {
  const labelCharacters = useMemo(
    () => activeLabel?.characters ?? [],
    [activeLabel]
  );
  const characterById = useMemo(
    () => new Map(characters.map((c) => [c.id, c])),
    [characters]
  );
  const labelCharacterIds = useMemo(
    () => new Set(labelCharacters.map((c) => c.id)),
    [labelCharacters]
  );
  const otherCharacters = useMemo(
    () => characters.filter((c) => !labelCharacterIds.has(c.id)),
    [characters, labelCharacterIds]
  );
  const resolvedLabelChars = useMemo(
    () =>
      labelCharacters
        .map((c) => characterById.get(c.id))
        .filter((c): c is Character => c !== undefined),
    [labelCharacters, characterById]
  );

  return (
    <CollapsibleSection title="Characters" defaultOpen={true}>
      {resolvedLabelChars.length > 0 ? (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-2">
            In Label
          </h3>
          <div className="space-y-2">
            {resolvedLabelChars.map((char) => {
              const content = (
                <>
                  <div
                    className="size-10 rounded-full flex items-center justify-center text-white text-sm font-medium shrink-0 shadow-sm"
                    style={{ backgroundColor: char.color }}
                  >
                    {char.displayName[0] || "?"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {char.displayName}
                    </p>
                  </div>
                  {char.isLoveInterest && (
                    <Heart className="size-4 text-pink-400 fill-pink-400 shrink-0 opacity-70" />
                  )}
                </>
              );

              return onCharacterEdit ? (
                <button
                  key={char.id}
                  type="button"
                  onClick={() => onCharacterEdit(char.id)}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors group w-full text-left cursor-pointer"
                >
                  {content}
                </button>
              ) : (
                <div
                  key={char.id}
                  className="flex items-center gap-3 p-2 rounded-lg w-full text-left"
                >
                  {content}
                </div>
              );
            })}
          </div>
        </div>
      ) : characters.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="size-12 rounded-full bg-muted/50 flex items-center justify-center mb-2">
            <span className="text-2xl opacity-40">👤</span>
          </div>
          <p className="text-sm text-muted-foreground">
            No characters in project
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="size-12 rounded-full bg-muted/50 flex items-center justify-center mb-2">
            <span className="text-2xl opacity-40">👥</span>
          </div>
          <p className="text-sm text-muted-foreground">
            No characters in this label
          </p>
        </div>
      )}
      {otherCharacters.length > 0 && (
        <div className="pt-4 border-t border-border">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-2">
            Other Characters
          </h3>
          <div className="flex flex-wrap gap-2 px-2">
            {otherCharacters.map((char) => (
              <CharacterAvatarChip
                key={char.id}
                character={char}
                onClick={() => onCharacterEdit?.(char.id)}
              />
            ))}
          </div>
        </div>
      )}
    </CollapsibleSection>
  );
}
