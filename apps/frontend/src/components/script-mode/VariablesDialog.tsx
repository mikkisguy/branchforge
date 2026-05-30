import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { DialogShell } from "@/components/ui/DialogShell";
import { InlineMessage } from "@/components/ui/inline-error";
import { Button } from "@/components/ui/button";
import { VariablesList } from "@/components/VariablesList";
import { VariableEditDialog } from "@/components/VariableEditDialog";
import { useVariables } from "@/hooks/useVariables";

interface VariablesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

export function VariablesDialog({
  open,
  onOpenChange,
  projectId,
}: VariablesDialogProps) {
  const MODE_NEW = "__new__" as const;
  type EditMode = null | typeof MODE_NEW | string;

  const [editingVariableId, setEditingVariableId] = useState<EditMode>(null);

  const {
    variables,
    isLoadingVariables,
    variablesError,
    isCreatingVariable,
    isUpdatingVariable,
    isDeletingVariable,
    deleteVariable,
  } = useVariables(projectId);

  const isSaving =
    isCreatingVariable || isUpdatingVariable || isDeletingVariable;

  const handleDelete = async (variableId: string) => {
    try {
      await deleteVariable(variableId);
    } catch {
      // Error handled by hook toast
    }
  };

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="Variables Management"
      description="Manage variables used in branching logic."
      maxWidth="3xl"
    >
      {isLoadingVariables ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : variablesError ? (
        <InlineMessage variant="error">Failed to load variables</InlineMessage>
      ) : variables.length === 0 ? (
        <div className="space-y-4">
          <div className="p-8 border border-dashed border-border/30 rounded-md text-center">
            <p className="text-sm text-muted-foreground">
              No variables configured yet. Add your first variable to get
              started.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => setEditingVariableId(MODE_NEW)}
            disabled={isSaving}
            className="w-full"
          >
            <Plus className="size-4 mr-2" />
            Add Variable
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => setEditingVariableId(MODE_NEW)}
            disabled={isSaving}
            className="w-full"
          >
            <Plus className="size-4 mr-2" />
            Add Another Variable
          </Button>
          <VariablesList
            variables={variables}
            isSaving={isSaving}
            onEdit={setEditingVariableId}
            onDelete={handleDelete}
          />
        </div>
      )}

      <VariableEditDialog
        open={open && editingVariableId !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setEditingVariableId(null);
        }}
        projectId={projectId}
        variableId={
          editingVariableId === MODE_NEW
            ? undefined
            : (editingVariableId as string | undefined)
        }
      />
    </DialogShell>
  );
}
