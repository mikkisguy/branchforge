import { AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import type { CharacterConflict } from "@branchforge/shared";

interface WizardConflictsProps {
  conflicts: CharacterConflict[];
  expanded: boolean;
  onToggle: () => void;
}

export function WizardConflicts({
  conflicts,
  expanded,
  onToggle,
}: WizardConflictsProps) {
  return (
    <div className="border border-amber-200 dark:border-amber-800 rounded-md overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full p-3 bg-amber-50 dark:bg-amber-950/20 flex items-center justify-between hover:bg-amber-100/50 dark:hover:bg-amber-950/30 transition-colors"
        type="button"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2">
          <AlertCircle className="size-4 text-amber-600" />
          <span className="text-sm font-medium">Conflicts</span>
          <span className="text-xs text-muted-foreground">
            ({conflicts.length})
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="size-4" />
        ) : (
          <ChevronDown className="size-4" />
        )}
      </button>

      {expanded && (
        <div className="p-3 space-y-2 border-t border-amber-200 dark:border-amber-800">
          {conflicts.map((conflict) => (
            <div
              key={conflict.tag}
              className="p-3 bg-background border border-border/30 rounded-md"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-sm font-medium">
                  {conflict.tag}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Current:
                  </span>
                  <div
                    className="size-4 rounded border border-border/30"
                    style={{ backgroundColor: conflict.existingColor }}
                  />
                </div>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>
                  Current: {conflict.existingName} ({conflict.existingColor})
                </p>
                <p>
                  Detected: {conflict.detectedName || "(none)"} (
                  {conflict.detectedColor})
                </p>
                <p className="text-amber-600 dark:text-amber-400 mt-1">
                  Review in character management after import
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
