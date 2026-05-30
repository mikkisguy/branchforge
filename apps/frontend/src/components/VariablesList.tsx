/**
 * Variables List
 *
 * Read-only list of variables with edit and delete actions.
 */

import { useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { Variable } from "@branchforge/shared";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface VariablesListProps {
  variables: Variable[];
  isSaving: boolean;
  onEdit: (variableId: string) => void;
  onDelete: (variableId: string) => void | Promise<void>;
}

export function VariablesList({
  variables,
  isSaving,
  onEdit,
  onDelete,
}: VariablesListProps) {
  const [deleteTarget, setDeleteTarget] = useState<Variable | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      await onDelete(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
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
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
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

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isDeleting) {
            setDeleteTarget(null);
          }
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Variable"
        description={`Are you sure you want to delete ${deleteTarget?.key || "this variable"}? This action cannot be undone and will remove it from your project.`}
        cancelLabel="Cancel"
        confirmLabel="Delete Variable"
        isLoading={isDeleting}
        loadingLabel="Deleting..."
      />
    </>
  );
}
