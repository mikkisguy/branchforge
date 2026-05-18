/**
 * CharacterReferencePanel Component
 *
 * Right sidebar for character context in WriteMode.
 * Matches app design system with theme colors and simple styling.
 */

import { useMemo } from "react";
import { Heart, ChevronRight, ChevronLeft } from "lucide-react";
import type { Character, LabelDetail } from "@branchforge/shared";
import { cva } from "class-variance-authority";

const panelVariants = cva(
  "min-h-0 shrink-0 rounded-lg border border-border bg-card/50 overflow-hidden mt-3 transition-all duration-300 ease-out",
  {
    variants: {
      collapsed: {
        true: "w-0 opacity-0 translate-x-full pointer-events-none",
        false: "w-56 opacity-100 translate-x-0",
      },
    },
  }
);

interface CharacterReferencePanelProps {
  characters: Character[];
  activeLabel: LabelDetail | undefined;
  isCollapsed?: boolean;
  onCollapseToggle?: () => void;
}

export function CharacterReferencePanel({
  characters,
  activeLabel,
  isCollapsed = false,
  onCollapseToggle,
}: CharacterReferencePanelProps) {
  const labelCharacters = useMemo(() => {
    return activeLabel?.characters ?? [];
  }, [activeLabel?.characters]);

  const characterById = useMemo(() => {
    return new Map(characters.map((c) => [c.id, c]));
  }, [characters]);

  const labelCharacterIds = useMemo(() => {
    return new Set(labelCharacters.map((labelCharacter) => labelCharacter.id));
  }, [labelCharacters]);

  const otherCharacters = useMemo(() => {
    return characters.filter((c) => !labelCharacterIds.has(c.id));
  }, [characters, labelCharacterIds]);

  const resolvedLabelChars = useMemo(() => {
    return labelCharacters
      .map((labelCharacter) => characterById.get(labelCharacter.id))
      .filter((c): c is Character => c !== undefined);
  }, [labelCharacters, characterById]);

  return (
    <>
      <div
        className={panelVariants({ collapsed: isCollapsed })}
        aria-hidden={isCollapsed}
        inert={isCollapsed}
      >
        <div className="h-full overflow-y-auto relative">
          <div className="sticky top-0 z-20 bg-card border-b border-border px-4 py-3">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold tracking-wide">
                  Characters
                </h2>
                {activeLabel && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {resolvedLabelChars.length} in label · {characters.length}{" "}
                    total
                  </p>
                )}
              </div>
              {onCollapseToggle && (
                <button
                  type="button"
                  onClick={onCollapseToggle}
                  className="p-1 rounded-md hover:bg-muted/80 transition-colors"
                  aria-label="Collapse character reference sidebar"
                  title="Collapse character reference sidebar"
                >
                  <ChevronRight className="size-4 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>

          <div className="p-3 space-y-4">
            {!activeLabel ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="size-12 rounded-full bg-muted/50 flex items-center justify-center mb-2">
                  <span className="text-2xl opacity-40">🏷️</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  No label selected
                </p>
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
              <>
                {/* Label Characters */}
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-2">
                    In This Label
                  </h3>

                  {resolvedLabelChars.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <div className="size-12 rounded-full bg-muted/50 flex items-center justify-center mb-2">
                        <span className="text-2xl opacity-40">👥</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        No characters in this label
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {resolvedLabelChars.map((character) => (
                        <div
                          key={character.id}
                          className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors group"
                        >
                          <div
                            className="size-10 rounded-full flex items-center justify-center text-white text-sm font-medium shrink-0 shadow-sm"
                            style={{ backgroundColor: character.color }}
                          >
                            {character.displayName[0] || "?"}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">
                              {character.displayName}
                            </p>
                            {character.dialogueStyle && (
                              <p className="text-xs text-muted-foreground truncate italic">
                                "{character.dialogueStyle}"
                              </p>
                            )}
                          </div>
                          {character.isLoveInterest && (
                            <Heart className="size-4 text-pink-400 fill-pink-400 shrink-0 opacity-70" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Other Characters */}
                {otherCharacters.length > 0 && (
                  <div className="pt-4 border-t border-border">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-2">
                      Other Characters
                    </h3>

                    <div className="space-y-1">
                      {otherCharacters.map((character) => (
                        <div
                          key={character.id}
                          className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted transition-colors group"
                        >
                          <div
                            className="size-6 rounded-full flex items-center justify-center text-white text-xs shrink-0 shadow-sm"
                            style={{ backgroundColor: character.color }}
                          >
                            {character.displayName[0] || "?"}
                          </div>
                          <span className="text-sm text-muted-foreground truncate flex-1">
                            {character.displayName}
                          </span>
                          {character.isLoveInterest && (
                            <Heart className="size-3.5 text-pink-400 fill-pink-400 shrink-0 opacity-70" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {isCollapsed && onCollapseToggle && (
        <div className="min-h-0 shrink-0 mt-3 flex items-center -ml-4">
          <button
            type="button"
            onClick={onCollapseToggle}
            className="p-2 rounded-lg border border-border bg-card/50 hover:bg-muted/80 transition-colors"
            aria-label="Expand character reference sidebar"
            title="Expand character reference sidebar"
          >
            <ChevronLeft className="size-4 text-muted-foreground" />
          </button>
        </div>
      )}
    </>
  );
}
