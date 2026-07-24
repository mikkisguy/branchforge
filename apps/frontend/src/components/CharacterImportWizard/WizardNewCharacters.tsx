import {
  CheckCircle2,
  AlertTriangle,
  Ban,
  ChevronDown,
  ChevronUp,
  BookOpen,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getNameTypeBadge, type EditableCharacter } from "./wizard-store";
import type { CharacterGroups } from "./wizard-store";

interface WizardNewCharactersProps {
  characters: EditableCharacter[];
  expanded: boolean;
  onToggle: () => void;
  updateCharacter: (
    group: CharacterGroups,
    index: number,
    updates: Partial<EditableCharacter>
  ) => void;
  isImporting: boolean;
  existingTags: string[];
}

export function WizardNewCharacters({
  characters,
  expanded,
  onToggle,
  updateCharacter,
  isImporting,
  existingTags,
}: WizardNewCharactersProps) {
  return (
    <div className="border border-border/30 rounded-md overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full p-3 bg-muted/30 flex items-center justify-between hover:bg-muted/50 transition-colors"
        type="button"
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-green-600" />
          <span className="text-sm font-medium">New Characters</span>
          <span className="text-xs text-muted-foreground">
            ({characters.length})
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="size-4" />
        ) : (
          <ChevronDown className="size-4" />
        )}
      </button>

      {expanded && (
        <div className="p-3 space-y-2 border-t border-border/30">
          {characters.map((char, index) => {
            const badge = getNameTypeBadge(char.nameType);
            const showEmptyHint = char.nameType === "empty";
            return (
              <div
                key={char.tag}
                className="p-3 bg-background border border-border/30 rounded-md space-y-2"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="checkbox"
                      checked={!char.excluded}
                      onChange={(e) =>
                        updateCharacter("new", index, {
                          excluded: !e.target.checked,
                        })
                      }
                      className="size-4 rounded"
                      disabled={isImporting}
                      aria-label={`Include ${char.tag}`}
                    />
                    <span className="font-mono text-sm font-medium">
                      {char.tag}
                    </span>
                    {char.isNarrator && (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded bg-purple-50 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800"
                        title="This character is marked as narrator"
                      >
                        <BookOpen className="size-3" />
                        Narrator
                      </span>
                    )}
                    {existingTags.includes(char.tag) && (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded bg-muted text-muted-foreground border border-border/30"
                        title="This character is already in the database. Re-confirming will update it (idempotent upsert)."
                        data-testid={`already-imported-badge-${char.tag}`}
                      >
                        Already imported
                      </span>
                    )}
                    {badge && (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                        title={badge.helper}
                        data-testid={`name-type-badge-${char.tag}`}
                      >
                        <AlertTriangle className="size-3" />
                        {badge.label}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className="size-6 rounded border border-border/30"
                      style={{ backgroundColor: char.color }}
                      title={char.color}
                    />
                    {char.excluded && (
                      <Ban className="size-4 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {!char.excluded && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          Display Name (in BF)
                        </Label>
                        <Input
                          value={char.displayName}
                          placeholder={showEmptyHint ? "(unnamed)" : undefined}
                          onChange={(e) =>
                            updateCharacter("new", index, {
                              displayName: e.target.value,
                            })
                          }
                          className="h-7 text-sm"
                          disabled={isImporting}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          Color
                        </Label>
                        <Input
                          type="color"
                          value={char.color}
                          onChange={(e) =>
                            updateCharacter("new", index, {
                              color: e.target.value,
                            })
                          }
                          className="h-7 text-sm p-1"
                          disabled={isImporting}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          updateCharacter("new", index, {
                            isNarrator: !char.isNarrator,
                          })
                        }
                        disabled={isImporting}
                        className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded border transition-colors ${
                          char.isNarrator
                            ? "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-700"
                            : "bg-muted/50 text-muted-foreground border-border/30 hover:bg-muted"
                        }`}
                        title={
                          char.isNarrator
                            ? "Remove narrator mark"
                            : "Mark as narrator (what_italic=True in export)"
                        }
                      >
                        <BookOpen className="size-3" />
                        {char.isNarrator ? "Narrator" : "Mark as Narrator"}
                      </button>
                    </div>
                    {badge && (
                      <p
                        className="text-xs text-muted-foreground"
                        data-testid={`name-type-helper-${char.tag}`}
                      >
                        {badge.helper}
                      </p>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
