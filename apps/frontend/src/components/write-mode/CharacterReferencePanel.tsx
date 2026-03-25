/**
 * CharacterReferencePanel Component
 *
 * Right sidebar for character context in WriteMode.
 */

import { useMemo } from "react";
import type { Character, LabelDetail } from "@branchforge/shared";

interface CharacterReferencePanelProps {
  characters: Character[];
  activeLabel: LabelDetail | undefined;
}

export function CharacterReferencePanel({
  characters,
  activeLabel,
}: CharacterReferencePanelProps) {
  // Get characters in current scene
  const sceneCharacters = activeLabel?.characters ?? [];

  // O(1) character lookup
  const characterById = useMemo(() => {
    return new Map(characters.map((c) => [c.id, c]));
  }, [characters]);

  return (
    <div className="space-y-6 py-4">
      {/* Scene Characters */}
      <div>
        <div className="text-xs font-display tracking-wider text-foreground/50 mb-4 pb-2 border-b border-border/30">
          IN SCENE
        </div>

        {sceneCharacters.length === 0 ? (
          <p className="text-sm text-foreground/40 text-center py-4">
            No characters
          </p>
        ) : (
          <div className="space-y-4">
            {sceneCharacters.map((character) => {
              const fullChar = characterById.get(character.id);
              return (
                <div key={character.id} className="text-center">
                  {/* Avatar/Initial */}
                  <div className="flex justify-center mb-2">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-white font-medium text-lg shadow-sm"
                      style={{
                        backgroundColor:
                          fullChar?.color || "var(--muted-foreground)",
                      }}
                    >
                      {character.displayName[0] || "?"}
                    </div>
                  </div>

                  {/* Name */}
                  <p className="text-sm font-medium text-foreground/90">
                    {character.displayName}
                  </p>

                  {/* Dialogue Style */}
                  {fullChar?.dialogueStyle && (
                    <p className="text-xs text-foreground/50 mt-1 italic line-clamp-2">
                      {fullChar.dialogueStyle}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* All Project Characters */}
      <div className="pt-4 border-t border-border/30">
        <div className="text-xs font-display tracking-wider text-foreground/50 mb-4 pb-2 border-b border-border/30">
          ALL CHARACTERS
        </div>

        {characters.length === 0 ? (
          <p className="text-sm text-foreground/40 text-center py-4">
            No characters
          </p>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {characters.map((character) => (
              <div
                key={character.id}
                className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-foreground/5 transition-colors"
              >
                {/* Color swatch */}
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    backgroundColor:
                      character.color || "var(--muted-foreground)",
                  }}
                />

                {/* Name */}
                <span className="text-sm text-foreground/70 truncate">
                  {character.displayName}
                </span>

                {/* Love interest indicator */}
                {character.isLoveInterest && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-pink-400/70 shrink-0"
                    title="Love Interest"
                    role="img"
                    aria-label="Love Interest"
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
