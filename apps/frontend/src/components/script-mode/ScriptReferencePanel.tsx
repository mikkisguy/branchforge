import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  ChevronLeft,
  Heart,
  Plus,
  Pencil,
  Loader2,
  BookText,
} from "lucide-react";
import { CollapsibleSection } from "@/components/ide-shared/CollapsibleSection";
import { VariablesDialog } from "./VariablesDialog";
import { StatManagementDialog } from "./StatManagementDialog";
import { WorldElementsDialog } from "@/components/WorldElementsDialog";
import { useVariables } from "@/hooks/useVariables";
import { useStats } from "@/hooks/useStats";
import { useWorldElements } from "@/hooks/useWorldElements";
import { cva } from "class-variance-authority";
import type { Character } from "@branchforge/shared";

interface ScriptReferencePanelProps {
  projectId: string;
  projectCharacters: Character[];
  isCollapsed?: boolean;
  onCollapseToggle?: () => void;
  onCharacterEdit?: (characterId: string) => void;
}

const panelVariants = cva(
  "min-h-0 shrink-0 rounded-lg border border-border bg-panel-tinted overflow-hidden mt-3 transition-all duration-300 ease-out",
  {
    variants: {
      collapsed: {
        true: "w-0 opacity-0 translate-x-full pointer-events-none",
        false: "w-64 opacity-100 translate-x-0",
      },
    },
  }
);

interface CharacterNodeProps {
  character: Character;
  failedAvatars: Record<string, boolean>;
  onAvatarError: (characterId: string) => void;
  canEdit: boolean;
  onEdit?: (characterId: string) => void;
}

function CharacterNode({
  character,
  failedAvatars,
  onAvatarError,
  canEdit,
  onEdit,
}: CharacterNodeProps) {
  const inner = (
    <>
      {/* Avatar: image or colored circle */}
      {character.avatarUrl ? (
        <>
          <img
            src={character.avatarUrl}
            alt={character.displayName}
            className={cn(
              "size-8 rounded-full shrink-0 object-cover",
              failedAvatars[character.id] && "hidden"
            )}
            onError={() => onAvatarError(character.id)}
          />
          {failedAvatars[character.id] && (
            <div
              className="size-8 rounded-full flex items-center justify-center text-white text-[10px] font-medium shrink-0 shadow-sm"
              style={{
                backgroundColor: character.color ?? "var(--theme-color)",
              }}
            >
              {character.displayName[0] || "?"}
            </div>
          )}
        </>
      ) : (
        <div
          className="size-8 rounded-full flex items-center justify-center text-white text-[10px] font-medium shrink-0 shadow-sm"
          style={{
            backgroundColor: character.color ?? "var(--theme-color)",
          }}
        >
          {character.displayName[0] || "?"}
        </div>
      )}

      {/* Name and tag */}
      <div className="min-w-0 flex-1 ml-1.5">
        <p className="text-xs font-medium truncate">{character.displayName}</p>
        <span className="font-mono text-[10px] text-foreground/70 font-semibold">
          {character.renpyTag}
        </span>
      </div>

      {/* Love interest indicator */}
      {character.isLoveInterest && (
        <Heart className="size-2.5 text-pink-400 fill-pink-400 shrink-0 opacity-70" />
      )}
    </>
  );

  if (canEdit && onEdit) {
    return (
      <button
        type="button"
        onClick={() => onEdit(character.id)}
        className="flex items-center gap-2 p-1.5 rounded-md hover:bg-muted transition-colors group cursor-pointer w-full text-left"
      >
        {inner}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 p-1.5 rounded-md w-full text-left">
      {inner}
    </div>
  );
}

export function ScriptReferencePanel({
  projectId,
  projectCharacters,
  isCollapsed = false,
  onCollapseToggle,
  onCharacterEdit,
}: ScriptReferencePanelProps) {
  const [variablesDialogOpen, setVariablesDialogOpen] = useState(false);
  const [statsDialogOpen, setStatsDialogOpen] = useState(false);
  const [worldElementsDialogOpen, setWorldElementsDialogOpen] = useState(false);
  const [failedAvatars, setFailedAvatars] = useState<Record<string, boolean>>(
    {}
  );

  // Skip API calls if projectId is not valid
  const { variables, isLoadingVariables } = useVariables(
    projectId && projectId.trim() ? projectId : ""
  );
  const { stats, isLoadingStats } = useStats(
    projectId && projectId.trim() ? projectId : ""
  );
  const { elements, isLoadingElements } = useWorldElements(
    projectId && projectId.trim() ? projectId : ""
  );

  // Group variables by category for display
  const groupedVariables = useMemo(() => {
    const groups: Record<string, typeof variables> = {};
    for (const variable of variables) {
      const category =
        (variable.category?.trim() as string | undefined) || "Uncategorized";
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(variable);
    }
    return groups;
  }, [variables]);

  const sortedCharacters = useMemo(
    () =>
      projectCharacters.toSorted((a, b) =>
        a.displayName.localeCompare(b.displayName)
      ),
    [projectCharacters]
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
            {/* Characters */}
            <CollapsibleSection title="Characters" defaultOpen={true}>
              {sortedCharacters.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-4 text-center">
                  <div className="size-10 rounded-full bg-muted/50 flex items-center justify-center mb-2">
                    <span className="text-xl opacity-40">👥</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    No characters defined
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {sortedCharacters.map((character) => (
                    <CharacterNode
                      key={character.id}
                      character={character}
                      failedAvatars={failedAvatars}
                      onAvatarError={(id) => {
                        setFailedAvatars((prev) => ({ ...prev, [id]: true }));
                      }}
                      canEdit={!!onCharacterEdit}
                      onEdit={onCharacterEdit}
                    />
                  ))}
                </div>
              )}
            </CollapsibleSection>

            {/* Variables — read-only list, edit via dialog */}
            <CollapsibleSection
              title="Variables"
              defaultOpen={false}
              headerAction={
                <button
                  type="button"
                  onClick={() => setVariablesDialogOpen(true)}
                  className="p-1 rounded hover:bg-muted/80 transition-colors"
                  aria-label="Manage variables"
                  title="Manage variables"
                >
                  <Pencil className="size-3 text-muted-foreground" />
                </button>
              }
            >
              {isLoadingVariables ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              ) : variables.length === 0 ? (
                <div className="text-center py-3">
                  <p className="text-xs text-muted-foreground mb-2">
                    No variables defined
                  </p>
                  <button
                    type="button"
                    onClick={() => setVariablesDialogOpen(true)}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Plus className="size-3" />
                    Add variable
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(groupedVariables).map(
                    ([category, categoryVars]) => (
                      <div key={category}>
                        <h3 className="text-xs font-medium text-muted-foreground mb-1.5">
                          {category}
                        </h3>
                        <div className="space-y-1">
                          {categoryVars.map((variable) => (
                            <div
                              key={variable.id}
                              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 transition-colors"
                            >
                              <span className="font-mono text-xs truncate flex-1">
                                {variable.key}
                              </span>
                              {variable.description && (
                                <span
                                  className="text-xs text-muted-foreground truncate max-w-[100px]"
                                  title={variable.description}
                                >
                                  {variable.description}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  )}
                  <button
                    type="button"
                    onClick={() => setVariablesDialogOpen(true)}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full justify-center pt-1"
                  >
                    <Plus className="size-3" />
                    Manage variables
                  </button>
                </div>
              )}
            </CollapsibleSection>

            {/* Stats — read-only list, edit via dialog */}
            <CollapsibleSection
              title="Stats"
              defaultOpen={false}
              headerAction={
                <button
                  type="button"
                  onClick={() => setStatsDialogOpen(true)}
                  className="p-1 rounded hover:bg-muted/80 transition-colors"
                  aria-label="Manage stats"
                  title="Manage stats"
                >
                  <Pencil className="size-3 text-muted-foreground" />
                </button>
              }
            >
              {isLoadingStats ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              ) : stats.length === 0 ? (
                <div className="text-center py-3">
                  <p className="text-xs text-muted-foreground mb-2">
                    No stats defined
                  </p>
                  <button
                    type="button"
                    onClick={() => setStatsDialogOpen(true)}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Plus className="size-3" />
                    Add stat
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  {stats.map((stat) => (
                    <div
                      key={stat.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-mono text-xs truncate block">
                          {stat.name}
                        </span>
                        {stat.description && (
                          <span className="text-xs text-muted-foreground truncate block">
                            {stat.description}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                        {stat.minValue}–{stat.maxValue}
                      </span>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setStatsDialogOpen(true)}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full justify-center pt-1"
                  >
                    <Plus className="size-3" />
                    Manage stats
                  </button>
                </div>
              )}
            </CollapsibleSection>

            {/* World Elements — read-only list, edit via dialog */}
            <CollapsibleSection
              title="World Bible"
              defaultOpen={false}
              headerAction={
                <button
                  type="button"
                  onClick={() => setWorldElementsDialogOpen(true)}
                  className="p-1 rounded hover:bg-muted/80 transition-colors"
                  aria-label="Manage world elements"
                  title="Manage world elements"
                >
                  <BookText className="size-3 text-muted-foreground" />
                </button>
              }
            >
              {isLoadingElements ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              ) : elements.length === 0 ? (
                <div className="text-center py-3">
                  <p className="text-xs text-muted-foreground mb-2">
                    No world elements defined
                  </p>
                  <button
                    type="button"
                    onClick={() => setWorldElementsDialogOpen(true)}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Plus className="size-3" />
                    Add element
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  {elements
                    .toSorted((a, b) =>
                      a.type !== b.type
                        ? a.type.localeCompare(b.type)
                        : a.name.localeCompare(b.name)
                    )
                    .map((element) => (
                      <div
                        key={element.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="text-xs truncate block">
                            {element.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {element.type.charAt(0) +
                              element.type.slice(1).toLowerCase()}
                          </span>
                        </div>
                      </div>
                    ))}
                  <button
                    type="button"
                    onClick={() => setWorldElementsDialogOpen(true)}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full justify-center pt-1"
                  >
                    <Plus className="size-3" />
                    Manage elements
                  </button>
                </div>
              )}
            </CollapsibleSection>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <VariablesDialog
        open={variablesDialogOpen}
        onOpenChange={setVariablesDialogOpen}
        projectId={projectId}
      />
      <StatManagementDialog
        open={statsDialogOpen}
        onOpenChange={setStatsDialogOpen}
        projectId={projectId}
      />
      <WorldElementsDialog
        open={worldElementsDialogOpen}
        onOpenChange={setWorldElementsDialogOpen}
        projectId={projectId}
      />

      {isCollapsed && onCollapseToggle && (
        <div className="min-h-0 shrink-0 mt-3 flex items-start -ml-4">
          <button
            type="button"
            onClick={onCollapseToggle}
            className="size-12 rounded-lg border border-border bg-card/50 hover:bg-muted/80 transition-colors flex items-center justify-center"
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
