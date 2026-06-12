import { useMemo } from "react";
import { Heart, ChevronRight, ChevronLeft, Pencil } from "lucide-react";
import { CharacterAvatarChip } from "@/components/ui/CharacterAvatarChip";
import { CollapsibleSection } from "@/components/ide-shared/CollapsibleSection";
import type {
  Character,
  LabelDetail,
  Stat,
  RouteConfig,
} from "@branchforge/shared";
import { cva } from "class-variance-authority";
import {
  formatVariableCondition,
  formatStatCondition,
} from "@/lib/format-conditions";
import { FormattedCondition } from "@/components/write-mode/FormattedCondition";

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

const STATUS_COLORS = {
  FINAL: "var(--theme-color)",
  REVIEW: "var(--theme-review-color)",
  DRAFT: "var(--theme-draft-color)",
} as const;

interface LabelPropertiesPanelProps {
  activeLabel: LabelDetail | undefined;
  characters: Character[];
  stats: Stat[];
  routeConfigs: RouteConfig[];
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
  isCollapsed,
  onCollapseToggle,
  onEdit,
  onCharacterEdit,
}: LabelPropertiesPanelProps) {
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

  const routeConfig = useMemo(
    () => routeConfigs.find((r) => r.routeKey === activeLabel?.routeKey),
    [routeConfigs, activeLabel]
  );

  const statByKey = useMemo(
    () => new Map(stats.map((s) => [s.key, s])),
    [stats]
  );

  const outgoingJumps = useMemo(() => {
    if (!activeLabel?.lines) return [];
    const jumps: Array<{
      targetLabelId: string;
      targetLabelName: string;
      jumpType: "MENU_CHOICE" | "AUTOMATIC";
      choiceText: string;
      conditionFlags?: string[];
      effects?: Record<string, number>;
    }> = [];

    for (const line of activeLabel.lines) {
      if (line.menuOptions) {
        for (const opt of line.menuOptions) {
          if (!opt.targetLabelId) continue;
          jumps.push({
            targetLabelId: opt.targetLabelId,
            targetLabelName: opt.targetLabelName,
            jumpType: "MENU_CHOICE",
            choiceText: opt.label,
            conditionFlags: opt.conditionFlags,
            effects: opt.effects?.stats,
          });
        }
      }
      if (line.contentType === "JUMP" && line.content) {
        const match = line.content.match(/jump\s+(\S+)/);
        if (match) {
          jumps.push({
            targetLabelId: match[1],
            targetLabelName: match[1],
            jumpType: "AUTOMATIC",
            choiceText: match[1],
          });
        }
      }
    }
    return jumps;
  }, [activeLabel]);

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
                              {char.dialogueStyle && (
                                <p className="text-xs text-muted-foreground truncate italic">
                                  "{char.dialogueStyle}"
                                </p>
                              )}
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

              <CollapsibleSection title="Identity" defaultOpen={false}>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Title</span>
                    <span
                      className="text-foreground font-medium truncate ml-2 max-w-[120px]"
                      title={activeLabel.title}
                    >
                      {activeLabel.title}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Label Name</span>
                    <span
                      className="text-foreground font-medium font-mono truncate ml-2 max-w-[120px]"
                      title={activeLabel.labelName ?? "—"}
                    >
                      {activeLabel.labelName ?? "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Route</span>
                    <span
                      className="text-foreground font-medium truncate ml-2 max-w-[120px]"
                      title={routeConfig?.routeName ?? "Shared"}
                    >
                      {routeConfig?.routeName ?? "Shared"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Status</span>
                    <div className="flex items-center gap-1.5 ml-2">
                      {activeLabel.status && (
                        <span
                          className="size-2 rounded-full shrink-0"
                          style={{
                            backgroundColor:
                              STATUS_COLORS[
                                activeLabel.status as keyof typeof STATUS_COLORS
                              ] ?? "#9ca3af",
                          }}
                        />
                      )}
                      <span className="text-foreground font-medium">
                        {activeLabel.status ?? "—"}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Visibility</span>
                    <span
                      className="text-foreground font-medium truncate ml-2 max-w-[120px]"
                      title={activeLabel.visibility ?? "—"}
                    >
                      {activeLabel.visibility ?? "—"}
                    </span>
                  </div>
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Access Conditions" defaultOpen={false}>
                {!activeLabel.conditions ? (
                  <p className="text-xs text-muted-foreground">
                    No access conditions
                  </p>
                ) : (
                  <div className="space-y-3 text-xs">
                    <div>
                      <p className="text-muted-foreground mb-1.5">Variables</p>
                      <div className="flex flex-wrap gap-1">
                        {activeLabel.conditions.variables &&
                        Object.keys(activeLabel.conditions.variables).length >
                          0 ? (
                          Object.entries(activeLabel.conditions.variables).map(
                            ([varName, condition]) => (
                              <span
                                key={varName}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/80 border border-border/50 text-xs text-foreground"
                              >
                                <FormattedCondition
                                  parts={formatVariableCondition(
                                    varName,
                                    condition
                                  )}
                                />
                              </span>
                            )
                          )
                        ) : (
                          <span className="text-muted-foreground">None</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1.5">Stats</p>
                      <div className="flex flex-wrap gap-1">
                        {activeLabel.conditions.stats &&
                        Object.keys(activeLabel.conditions.stats).length > 0 ? (
                          Object.entries(activeLabel.conditions.stats).map(
                            ([statKey, value]) => {
                              const stat = statByKey.get(statKey);
                              const displayName = stat?.name ?? statKey;
                              const condition =
                                typeof value === "number"
                                  ? { value, operator: ">=" as const }
                                  : value;
                              return (
                                <span
                                  key={statKey}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/80 border border-border/50 text-xs text-foreground"
                                >
                                  <FormattedCondition
                                    parts={formatStatCondition(
                                      displayName,
                                      condition
                                    )}
                                  />
                                </span>
                              );
                            }
                          )
                        ) : (
                          <span className="text-muted-foreground">None</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </CollapsibleSection>

              <CollapsibleSection
                title="Outgoing Jumps"
                defaultOpen={false}
                headerAction={
                  outgoingJumps.length > 0 ? (
                    <span className="text-xs text-muted-foreground">
                      ({outgoingJumps.length})
                    </span>
                  ) : null
                }
              >
                <div className="space-y-2">
                  <div className="border-t border-border/50" />
                  {outgoingJumps.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No outgoing jumps
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {outgoingJumps.map((jump, i) => (
                        <div
                          key={`${jump.targetLabelId}-${jump.choiceText}-${i}`}
                          className="p-2 rounded-lg bg-muted/30 border border-border/50 text-xs"
                        >
                          <div className="font-medium text-foreground truncate">
                            {jump.targetLabelName}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-muted-foreground">
                            {jump.jumpType === "MENU_CHOICE" ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600">
                                Choice
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-green-500/10 text-green-600">
                                Auto
                              </span>
                            )}
                            <span className="truncate flex-1">
                              {jump.choiceText}
                            </span>
                          </div>
                          {jump.conditionFlags &&
                            jump.conditionFlags.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {jump.conditionFlags.map((flag) => (
                                  <span
                                    key={flag}
                                    className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted/80 border border-border/50 font-mono text-muted-foreground"
                                  >
                                    {flag}
                                  </span>
                                ))}
                              </div>
                            )}
                          {jump.effects &&
                            Object.keys(jump.effects).length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {Object.entries(jump.effects).map(
                                  ([statKey, value]) => {
                                    const stat = statByKey.get(statKey);
                                    return (
                                      <span
                                        key={statKey}
                                        className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted/80 border border-border/50 font-mono text-muted-foreground"
                                      >
                                        {stat?.name ?? statKey}{" "}
                                        {value > 0 ? "+" : ""}
                                        {value}
                                      </span>
                                    );
                                  }
                                )}
                              </div>
                            )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CollapsibleSection>

              <CollapsibleSection
                title="Incoming Jumps"
                defaultOpen={false}
                headerAction={
                  activeLabel.incomingJumps &&
                  activeLabel.incomingJumps.length > 0 ? (
                    <span className="text-xs text-muted-foreground">
                      ({activeLabel.incomingJumps.length})
                    </span>
                  ) : null
                }
              >
                {!activeLabel.incomingJumps ||
                activeLabel.incomingJumps.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No incoming jumps
                  </p>
                ) : (
                  <div className="space-y-2">
                    {activeLabel.incomingJumps.map((jump) => (
                      <div
                        key={`${jump.sourceLabelId}-${jump.choiceText}`}
                        className="p-2 rounded-lg bg-muted/30 border border-border/50 text-xs"
                      >
                        <div className="font-medium text-foreground truncate">
                          {jump.sourceLabelTitle}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-muted-foreground">
                          {jump.jumpType === "MENU_CHOICE" ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600">
                              Choice
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-green-500/10 text-green-600">
                              Auto
                            </span>
                          )}
                          <span className="truncate flex-1">
                            {jump.choiceText?.trim()
                              ? jump.choiceText
                              : "Untitled choice"}
                          </span>
                        </div>
                        {jump.conditions && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {jump.conditions.variables &&
                              Object.entries(jump.conditions.variables).map(
                                ([varName, condition]) => (
                                  <span
                                    key={varName}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/80 border border-border/50 text-muted-foreground"
                                  >
                                    <FormattedCondition
                                      parts={formatVariableCondition(
                                        varName,
                                        condition
                                      )}
                                    />
                                  </span>
                                )
                              )}
                            {jump.conditions.stats &&
                              Object.entries(jump.conditions.stats).map(
                                ([statKey, condition]) => {
                                  const stat = statByKey.get(statKey);
                                  const displayName = stat?.name ?? statKey;
                                  return (
                                    <span
                                      key={statKey}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/80 border border-border/50 text-foreground"
                                    >
                                      <FormattedCondition
                                        parts={formatStatCondition(
                                          displayName,
                                          condition
                                        )}
                                      />
                                    </span>
                                  );
                                }
                              )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CollapsibleSection>
            </div>
          )}
        </div>
      </div>

      {isCollapsed && onCollapseToggle && (
        <div className="min-h-0 shrink-0 mt-3 flex items-start -ml-4">
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
