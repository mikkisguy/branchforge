import { AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { useId } from "react";
import type { CharacterConflict } from "@branchforge/shared";

interface WizardConflictsProps {
  conflicts: CharacterConflict[];
  expanded: boolean;
  onToggle: () => void;
  approvedUpdates: Set<string>;
  onChoose: (tag: string, approved: boolean) => void;
  isImporting: boolean;
}

export function WizardConflicts({
  conflicts,
  expanded,
  onToggle,
  approvedUpdates,
  onChoose,
  isImporting,
}: WizardConflictsProps) {
  const choiceId = useId();
  return (
    <div className="border border-border/30 rounded-md overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full p-3 bg-muted/30 flex items-center justify-between hover:bg-muted/50 transition-colors"
        type="button"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2">
          <AlertCircle className="size-4 text-amber-600 dark:text-amber-400" />
          <span className="text-sm font-medium">Definition differs</span>
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
        <div className="p-3 space-y-4 border-t border-border/30">
          <p className="text-xs text-muted-foreground">
            Choose which source definition to keep. BranchForge display names,
            narrator settings, and love-interest settings are preserved.
          </p>
          {conflicts.map((conflict, index) => {
            const fields = conflict.changedFields ?? [
              ...(conflict.existingName !== conflict.detectedName
                ? ["name" as const]
                : []),
              ...(conflict.existingNameType !== conflict.detectedNameType
                ? ["nameType" as const]
                : []),
              ...(conflict.existingColor.toLowerCase() !==
              conflict.detectedColor.toLowerCase()
                ? ["color" as const]
                : []),
            ];
            const values = {
              name: {
                label: "Source name",
                current:
                  conflict.existingNameType === "none"
                    ? "None"
                    : conflict.existingName || "(empty)",
                imported:
                  conflict.detectedNameType === "none"
                    ? "None"
                    : (conflict.detectedName ?? "None"),
              },
              nameType: {
                label: "Name type",
                current: conflict.existingNameType ?? "literal",
                imported: conflict.detectedNameType ?? "literal",
              },
              color: {
                label: "Color",
                current: conflict.existingColor,
                imported: conflict.detectedColor,
              },
            };
            const id = `${choiceId}-${index}`;
            return (
              <div key={conflict.tag} className="space-y-2">
                <p className="font-mono text-sm font-medium">{conflict.tag}</p>
                <dl className="text-xs space-y-2">
                  {fields.map((field) => (
                    <div key={field}>
                      <dt className="font-medium">{values[field].label}</dt>
                      <dd className="text-muted-foreground break-words">
                        BranchForge: {values[field].current}
                      </dd>
                      <dd className="break-words">
                        Imported: {values[field].imported || "(empty)"}
                      </dd>
                    </div>
                  ))}
                </dl>
                <label
                  htmlFor={id}
                  className="block text-xs text-muted-foreground"
                >
                  Definition to keep for {conflict.tag}
                </label>
                <select
                  id={id}
                  value={
                    approvedUpdates.has(conflict.tag) ? "imported" : "current"
                  }
                  onChange={(event) =>
                    onChoose(conflict.tag, event.target.value === "imported")
                  }
                  disabled={isImporting}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="current">Keep BranchForge version</option>
                  <option value="imported">Use imported definition</option>
                </select>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
