import { useMemo } from "react";
import { ChevronRight, ChevronLeft, Heart } from "lucide-react";
import { CharacterAvatarChip } from "@/components/ui/CharacterAvatarChip";
import { CollapsibleSection } from "@/components/ide-shared/CollapsibleSection";
import { VariablesContent } from "@/components/VariablesContent";
import { StatsContent } from "@/components/StatsContent";
import { cva } from "class-variance-authority";
import type { Character, LabelCharacter } from "@branchforge/shared";

interface ScriptReferencePanelProps {
  projectId: string;
  sceneCharacters: LabelCharacter[];
  projectCharacters: Character[];
  isCollapsed?: boolean;
  onCollapseToggle?: () => void;
}

const panelVariants = cva(
  "min-h-0 shrink-0 rounded-lg border border-border bg-card/50 overflow-hidden mt-3 transition-all duration-300 ease-out",
  {
    variants: {
      collapsed: {
        true: "w-0 opacity-0 translate-x-full pointer-events-none",
        false: "w-64 opacity-100 translate-x-0",
      },
    },
  }
);

export function ScriptReferencePanel({
  projectId,
  sceneCharacters,
  projectCharacters,
  isCollapsed = false,
  onCollapseToggle,
}: ScriptReferencePanelProps) {
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
    <>
      <div
        className={panelVariants({ collapsed: isCollapsed })}
        aria-hidden={isCollapsed}
        inert={isCollapsed}
      >
        <div className="h-full overflow-y-auto relative">
          <div className="sticky top-0 z-20 bg-card border-b border-border px-4 py-3">
            {onCollapseToggle && (
              <button
                type="button"
                onClick={onCollapseToggle}
                className="absolute top-2 right-2 z-30 p-1 rounded-md hover:bg-muted/80 transition-colors"
                aria-label="Collapse reference sidebar"
                title="Collapse reference sidebar"
              >
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>
            )}
            <h2 className="text-sm font-semibold tracking-wide">Reference</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Project definitions
            </p>
          </div>
          <div>
            <CollapsibleSection title="Characters" defaultOpen={true}>
              {sceneCharacters.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-4 text-center">
                  <div className="size-10 rounded-full bg-muted/50 flex items-center justify-center mb-2">
                    <span className="text-xl opacity-40">👥</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
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
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors group"
                      >
                        <div
                          className="size-8 rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0 shadow-sm"
                          style={{ backgroundColor: avatarColor }}
                        >
                          {displayName[0] || "?"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate">
                            {displayName}
                          </p>
                        </div>
                        {resolvedCharacter?.isLoveInterest && (
                          <Heart className="size-3 text-pink-400 fill-pink-400 shrink-0 opacity-70" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {otherCharacters.length > 0 && sceneCharacters.length > 0 && (
                <div className="pt-3 border-t border-border mt-3">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Others
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {otherCharacters.map((character) => (
                      <CharacterAvatarChip
                        key={character.id}
                        character={character}
                      />
                    ))}
                  </div>
                </div>
              )}
            </CollapsibleSection>

            <CollapsibleSection title="Variables" defaultOpen={false}>
              <VariablesContent projectId={projectId} />
            </CollapsibleSection>

            <CollapsibleSection title="Stats" defaultOpen={false}>
              <StatsContent projectId={projectId} />
            </CollapsibleSection>
          </div>
        </div>
      </div>

      {isCollapsed && onCollapseToggle && (
        <div className="min-h-0 shrink-0 mt-3 flex items-center -ml-4">
          <button
            type="button"
            onClick={onCollapseToggle}
            className="p-2 rounded-lg border border-border bg-card/50 hover:bg-muted/80 transition-colors"
            aria-label="Expand reference sidebar"
            title="Expand reference sidebar"
          >
            <ChevronLeft className="size-4 text-muted-foreground" />
          </button>
        </div>
      )}
    </>
  );
}
