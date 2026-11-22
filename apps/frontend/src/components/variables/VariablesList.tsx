/**
 * Variables List
 *
 * Read-only list of variables with edit and delete actions.
 */

import { useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { Variable, VariableReference } from "@branchforge/shared";
import { Button } from "@/components/ui/button";
import { DeleteVariableDialog } from "./DeleteVariableDialog";

interface VariablesListProps {
  variables: Variable[];
  isSaving: boolean;
  onEdit: (variableId: string) => void;
  onDelete: (variableId: string) => Promise<void>;
  onOpenReference: (reference: VariableReference) => Promise<boolean>;
}

export function VariablesList({
  variables,
  isSaving,
  onEdit,
  onDelete,
  onOpenReference,
}: VariablesListProps) {
  const [deleteTarget, setDeleteTarget] = useState<Variable | null>(null);

  const groupedVariables = useMemo(() => {
    const groups: Record<string, Variable[]> = {};
    for (const variable of variables) {
      const category = variable.category?.trim() || "Uncategorized";
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(variable);
    }
    return groups;
  }, [variables]);

  if (variables.length === 0) {
    return null;
  }

  return (
    <div>
      <div className="space-y-6">
        {Object.entries(groupedVariables).map(([category, items]) => (
          <div key={category} className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              {category}
            </h3>
            <div className="space-y-2">
              {items.map((variable) => (
                <div
                  key={variable.id}
                  className="border border-border/30 rounded-md p-4 flex items-start justify-between"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium font-mono text-sm">
                        {variable.key}
                      </span>
                      {variable.category && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                          {variable.category}
                        </span>
                      )}
                    </div>
                    {variable.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {variable.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(variable.id)}
                      disabled={isSaving}
                      aria-label={`Edit ${variable.key}`}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget(variable)}
                      disabled={isSaving}
                      className="text-destructive hover:text-destructive"
                      aria-label={`Delete ${variable.key}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {deleteTarget && (
        <DeleteVariableDialog
          key={deleteTarget.id}
          variable={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDelete={onDelete}
          onOpenReference={onOpenReference}
        />
      )}
    </div>
  );
}
