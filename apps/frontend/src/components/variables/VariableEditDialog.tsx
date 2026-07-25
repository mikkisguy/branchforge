/**
 * Variable Edit Dialog
 *
 * Modal for creating or editing a single variable.
 */

import { useState, useEffect, useMemo } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormErrorMessage } from "@/components/ui/form-error-message";
import { useVariables } from "@/hooks/useVariables";
import type { Variable } from "@branchforge/shared";
import { useDirtyForm } from "@/hooks/useDirtyForm";
import { useDirtyDialogWarning } from "@/hooks/useDirtyDialogWarning";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface VariableEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  variableId?: string;
}

interface VariableFormState {
  key: string;
  description: string;
  category: string;
}

interface VariableFormErrors {
  key?: string;
  description?: string;
  category?: string;
}

const initialForm: VariableFormState = {
  key: "",
  description: "",
  category: "",
};

function validateVariable(form: VariableFormState): VariableFormErrors {
  const errors: VariableFormErrors = {};

  if (!form.key.trim()) {
    errors.key = "Variable key is required";
  } else if (!/^[a-zA-Z0-9_]+$/.test(form.key)) {
    errors.key =
      "Variable key can only contain letters, numbers, and underscores";
  } else if (form.key.length > 50) {
    errors.key = "Variable key is too long (max 50 characters)";
  }

  if (form.description && form.description.length > 500) {
    errors.description = "Description is too long (max 500 characters)";
  }

  if (form.category && form.category.length > 50) {
    errors.category = "Category is too long (max 50 characters)";
  }

  return errors;
}

interface VariableFormContentProps {
  variableId: string | undefined;
  variables: Variable[];
  isSaving: boolean;
  onSave: (
    variableId: string | undefined,
    form: VariableFormState
  ) => Promise<void>;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

function VariableFormContent({
  variableId,
  variables,
  isSaving,
  onSave,
  onClose,
  onDirtyChange,
}: VariableFormContentProps) {
  const [form, setForm] = useState<VariableFormState>(() => {
    if (!variableId) return initialForm;
    const variable = variables.find((item: Variable) => item.id === variableId);
    if (!variable) return initialForm;
    return {
      key: variable.key,
      description: variable.description ?? "",
      category: variable.category ?? "",
    };
  });
  const initialSnapshot: VariableFormState = useMemo(() => {
    if (!variableId) return initialForm;
    const variable = variables.find((v) => v.id === variableId);
    if (!variable) return initialForm;
    return {
      key: variable.key,
      description: variable.description ?? "",
      category: variable.category ?? "",
    };
  }, [variableId, variables]);
  const { isDirty } = useDirtyForm(initialSnapshot, form);
  useEffect(() => {
    // react-doctor-disable-next-line react-doctor/no-prop-callback-in-effect
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);
  const [errors, setErrors] = useState<VariableFormErrors>({});

  // react-doctor-disable-next-line react-doctor/no-event-handler
  const isEditMode = !!variableId;

  // Close dialog if editing a variable that no longer exists
  useEffect(() => {
    // react-doctor-disable-next-line react-doctor/no-event-handler
    if (isEditMode && !variables.find((item) => item.id === variableId)) {
      // react-doctor-disable-next-line react-doctor/no-prop-callback-in-effect
      onClose();
    }
  }, [isEditMode, variableId, variables, onClose]);

  const handleChange = (field: keyof VariableFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleSave = async () => {
    const validationErrors = validateVariable(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    try {
      await onSave(variableId, form);
    } catch {
      // Error handled by hook toast
    }
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-3">
        <div className="space-y-1">
          <Label htmlFor="variable-key" className="text-xs">
            Variable Key *
          </Label>
          <Input
            id="variable-key"
            type="text"
            placeholder="met_alex"
            value={form.key}
            onChange={(event) => handleChange("key", event.target.value)}
            disabled={isSaving || isEditMode}
            aria-required="true"
            aria-invalid={!!errors.key}
            aria-describedby={errors.key ? "variable-key-error" : undefined}
          />
          <p className="text-xs text-muted-foreground">
            {isEditMode
              ? "Key cannot be changed after creation"
              : "Unique identifier (letters, numbers, underscores)"}
          </p>
          <FormErrorMessage id="variable-key-error" message={errors.key} />
        </div>

        <div className="space-y-1">
          <Label htmlFor="variable-category" className="text-xs">
            Category
          </Label>
          <Input
            id="variable-category"
            type="text"
            placeholder="Relationships"
            value={form.category}
            onChange={(event) => handleChange("category", event.target.value)}
            disabled={isSaving}
            aria-invalid={!!errors.category}
            aria-describedby={
              errors.category ? "variable-category-error" : undefined
            }
          />
          <FormErrorMessage
            id="variable-category-error"
            message={errors.category}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="variable-description" className="text-xs">
          Description
        </Label>
        <Input
          id="variable-description"
          type="text"
          placeholder="Player has met Alex"
          value={form.description}
          onChange={(event) => handleChange("description", event.target.value)}
          disabled={isSaving}
          aria-invalid={!!errors.description}
          aria-describedby={
            errors.description ? "variable-description-error" : undefined
          }
        />
        <FormErrorMessage
          id="variable-description-error"
          message={errors.description}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={isSaving}
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || isSaving}
        >
          {isSaving && <Loader2 className="size-4 animate-spin mr-2" />}
          Save
        </Button>
      </div>
    </div>
  );
}

export function VariableEditDialog({
  open,
  onOpenChange,
  projectId,
  variableId,
}: VariableEditDialogProps) {
  const {
    variables,
    isLoadingVariables,
    createVariable,
    updateVariable,
    isCreatingVariable,
    isUpdatingVariable,
  } = useVariables(projectId);

  const isSaving = isCreatingVariable || isUpdatingVariable;
  const isEditMode = !!variableId;

  const [isDirty, setIsDirty] = useState(false);
  const {
    handleOpenChange,
    confirmDiscard,
    discardDialogOpen,
    setDiscardDialogOpen,
  } = useDirtyDialogWarning(isDirty, onOpenChange);

  const handleSave = async (
    id: string | undefined,
    form: VariableFormState
  ) => {
    if (id) {
      await updateVariable(id, {
        description: form.description.trim() || undefined,
        category: form.category.trim() || undefined,
      });
    } else {
      await createVariable({
        key: form.key.trim(),
        description: form.description.trim() || undefined,
        category: form.category.trim() || undefined,
      });
    }
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-xl w-full">
          <DialogHeader>
            <DialogTitle>
              {isEditMode ? "Edit Variable" : "Add Variable"}
            </DialogTitle>
            <DialogDescription>
              {isEditMode
                ? "Update variable details."
                : "Create a new variable for branching logic."}
            </DialogDescription>
          </DialogHeader>

          {isEditMode && isLoadingVariables ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-6 animate-spin" />
            </div>
          ) : (
            <VariableFormContent
              key={`${variableId ?? "new"}-${open}`}
              variableId={variableId}
              variables={variables}
              isSaving={isSaving}
              onSave={handleSave}
              onClose={() => handleOpenChange(false)}
              onDirtyChange={setIsDirty}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={discardDialogOpen}
        onOpenChange={setDiscardDialogOpen}
        onConfirm={confirmDiscard}
        title="Discard unsaved changes?"
        description="You have unsaved changes. Are you sure you want to discard them?"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
      />
    </>
  );
}
