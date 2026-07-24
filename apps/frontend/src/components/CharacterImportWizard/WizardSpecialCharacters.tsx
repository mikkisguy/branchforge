import { Ban, ChevronDown, ChevronUp, BookOpen } from "lucide-react";
import type { EditableCharacter, CharacterGroup } from "./wizard-store";

interface WizardSpecialCharactersProps {
  characters: EditableCharacter[];
  expanded: boolean;
  onToggle: () => void;
  updateCharacter: (
    group: keyof CharacterGroup,
    index: number,
    updates: Partial<EditableCharacter>
  ) => void;
  isImporting: boolean;
}

export function WizardSpecialCharacters({
  characters,
  expanded,
  onToggle,
  updateCharacter,
  isImporting,
}: WizardSpecialCharactersProps) {
  return (
    <div className="border border-border/30 rounded-md overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full p-3 bg-muted/30 flex items-center justify-between hover:bg-muted/50 transition-colors"
        type="button"
      >
        <div className="flex items-center gap-2">
          <Ban className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Special Characters</span>
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
          <p className="text-xs text-muted-foreground mb-2">
            These are typically system characters (narration, unknown speakers)
            that can be excluded from import.
          </p>
          {characters.map((char, index) => (
            <div
              key={char.tag}
              className="flex items-center justify-between p-2 bg-background border border-border/30 rounded-md gap-2"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="checkbox"
                  checked={!char.excluded}
                  onChange={(e) =>
                    updateCharacter("special", index, {
                      excluded: !e.target.checked,
                    })
                  }
                  className="size-4 rounded"
                  disabled={isImporting}
                  aria-label={`Include ${char.tag}`}
                />
                <span className="font-mono text-sm">{char.tag}</span>
                <span className="text-xs text-muted-foreground">
                  ({char.displayName || "(unnamed)"})
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
              </div>
              <div className="flex items-center gap-2">
                {!char.excluded && (
                  <button
                    type="button"
                    onClick={() =>
                      updateCharacter("special", index, {
                        isNarrator: !char.isNarrator,
                      })
                    }
                    disabled={isImporting}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded border transition-colors ${
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
                  </button>
                )}
                <div
                  className="size-4 rounded border border-border/30"
                  style={{ backgroundColor: char.color }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
