/**
 * Variable Edit Dialog
 *
 * Modal for creating or editing a single variable.
 */

import { useEffect, useRef, useState } from "react";
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
import { useVariables } from "@/hooks/useVariables";
import type { Variable } from "@branchforge/shared";

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

const INITIAL_FORM: VariableFormState = {
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

  const [form, setForm] = useState<VariableFormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<VariableFormErrors>({});
  const [initializedForVariableId, setInitializedForVariableId] = useState<
    string | null
  >(null);
  const hasInitializedRef = useRef(false);

  const isSaving = isCreatingVariable || isUpdatingVariable;
  const isEditMode = !!variableId;

  useEffect(() => {
    if (!open) {
      setForm(INITIAL_FORM);
      setErrors({});
      setInitializedForVariableId(null);
      hasInitializedRef.current = false;
      return;
    }

    if (isLoadingVariables) {
      return;
    }

    if (variableId && variableId !== initializedForVariableId) {
      hasInitializedRef.current = false;
    }

    if (!hasInitializedRef.current) {
      if (variableId) {
        const variable = variables.find(
          (item: Variable) => item.id === variableId
        );
        if (variable) {
          setForm({
            key: variable.key,
            description: variable.description ?? "",
            category: variable.category ?? "",
          });
          setInitializedForVariableId(variableId);
        }
      } else {
        setForm(INITIAL_FORM);
        setInitializedForVariableId(null);
      }
      setErrors({});
      hasInitializedRef.current = true;
    }
  }, [
    open,
    variableId,
    variables,
    isLoadingVariables,
    initializedForVariableId,
  ]);

  const handleChange = (field: keyof VariableFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors({});
  };

  const handleSave = async () => {
    const validationErrors = validateVariable(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    try {
      if (variableId) {
        await updateVariable(variableId, {
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
    } catch {
      // Error handled by hook toast
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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

        <div className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-3">
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
              />
              <p className="text-xs text-muted-foreground">
                {isEditMode
                  ? "Key cannot be changed after creation"
                  : "Unique identifier (letters, numbers, underscores)"}
              </p>
              {errors.key && (
                <p className="text-xs text-destructive">{errors.key}</p>
              )}
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
                onChange={(event) =>
                  handleChange("category", event.target.value)
                }
                disabled={isSaving}
              />
              {errors.category && (
                <p className="text-xs text-destructive">{errors.category}</p>
              )}
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
              onChange={(event) =>
                handleChange("description", event.target.value)
              }
              disabled={isSaving}
            />
            {errors.description && (
              <p className="text-xs text-destructive">{errors.description}</p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="size-4 animate-spin mr-2" />}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
