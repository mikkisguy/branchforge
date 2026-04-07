import { useMemo } from "react";
import { Heart } from "lucide-react";
import type {
  Character,
  LabelCharacter,
  LabelDetail,
} from "@branchforge/shared";

interface CharacterReferencePanelProps {
  sceneCharacters: LabelCharacter[];
  projectCharacters: Character[];
  activeLabel?: LabelDetail | null;
  statusColor: string;
}

export function CharacterReferencePanel({
  sceneCharacters,
  projectCharacters,
  activeLabel,
  statusColor,
}: CharacterReferencePanelProps) {
  const characterById = useMemo(
    () =>
      new Map(projectCharacters.map((character) => [character.id, character])),
    [projectCharacters]
  );

  const sceneCharacterIds = useMemo(
    () => new Set(sceneCharacters.map((character) => character.id)),
    [sceneCharacters]
  );

  const otherCharacters = useMemo(
    () =>
      projectCharacters.filter(
        (character) => !sceneCharacterIds.has(character.id)
      ),
    [projectCharacters, sceneCharacterIds]
  );

  return (
    <div className="w-64 min-h-0 shrink-0 rounded-lg border border-border bg-card/50 overflow-hidden mt-3">
      <div className="h-full overflow-y-auto">
        <div className="sticky top-0 z-20 bg-card border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold tracking-wide">Characters</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {sceneCharacters.length} in scene · {projectCharacters.length} total
          </p>
        </div>

        <div className="p-3 space-y-4">
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-2">
              In This Scene
            </h3>

            {sceneCharacters.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-2">
                  <span className="text-2xl opacity-40">👥</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  No characters in this scene
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {sceneCharacters.map((sceneCharacter) => {
                  const resolvedCharacter = characterById.get(
                    sceneCharacter.id
                  );
                  const displayName =
                    resolvedCharacter?.displayName ??
                    sceneCharacter.displayName;
                  const avatarColor =
                    resolvedCharacter?.color ?? "var(--theme-color)";

                  return (
                    <div
                      key={sceneCharacter.id}
                      className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-muted transition-colors group"
                    >
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-medium shrink-0 shadow-sm"
                        style={{ backgroundColor: avatarColor }}
                      >
                        {displayName[0] || "?"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {displayName}
                        </p>
                        {resolvedCharacter?.dialogueStyle && (
                          <p className="text-xs text-muted-foreground truncate italic">
                            "{resolvedCharacter.dialogueStyle}"
                          </p>
                        )}
                      </div>
                      {resolvedCharacter?.isLoveInterest && (
                        <Heart className="w-4 h-4 text-pink-400 fill-pink-400 shrink-0 opacity-70" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

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
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs shrink-0 shadow-sm"
                      style={{ backgroundColor: character.color }}
                    >
                      {character.displayName[0] || "?"}
                    </div>
                    <span className="text-sm text-muted-foreground truncate flex-1">
                      {character.displayName}
                    </span>
                    {character.isLoveInterest && (
                      <Heart className="w-3.5 h-3.5 text-pink-400 fill-pink-400 shrink-0 opacity-70" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-border">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-2">
              Scene Info
            </h3>

            <div className="space-y-2 text-sm px-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: statusColor }}
                />
                <span>Status: {activeLabel?.status ?? "Unknown"}</span>
              </div>
              {activeLabel?.routeKey && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/50" />
                  <span>Route: {activeLabel.routeKey}</span>
                </div>
              )}
              {activeLabel?.groupType && activeLabel?.groupValue && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/50" />
                  <span>
                    {activeLabel.groupType}: {activeLabel.groupValue}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
