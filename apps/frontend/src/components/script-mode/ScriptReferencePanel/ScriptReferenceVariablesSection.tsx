import { Pencil, Plus, Loader2 } from "lucide-react";
import { CollapsibleSection } from "@/components/ide-shared/CollapsibleSection";
import type { Variable } from "@branchforge/shared";

export interface ScriptReferenceVariablesSectionProps {
  isLoading: boolean;
  groupedVariables: Record<string, Variable[]>;
  onManage: () => void;
}

export function ScriptReferenceVariablesSection({
  isLoading,
  groupedVariables,
  onManage,
}: ScriptReferenceVariablesSectionProps) {
  return (
    <CollapsibleSection
      title="Variables"
      defaultOpen={false}
      headerAction={
        <button
          type="button"
          onClick={onManage}
          className="p-1 rounded hover:bg-muted/80 transition-colors"
          aria-label="Manage variables"
          title="Manage variables"
        >
          <Pencil className="size-3 text-muted-foreground" />
        </button>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : Object.keys(groupedVariables).length === 0 ? (
        <div className="text-center py-3">
          <p className="text-xs text-muted-foreground mb-2">
            No variables defined
          </p>
          <button
            type="button"
            onClick={onManage}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Plus className="size-3" />
            Add variable
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(groupedVariables).map(([category, categoryVars]) => (
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
          ))}
          <button
            type="button"
            onClick={onManage}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full justify-center pt-1"
          >
            <Plus className="size-3" />
            Manage variables
          </button>
        </div>
      )}
    </CollapsibleSection>
  );
}
