/**
 * Variables Content
 *
 * Reusable content component for variables management.
 * Can be rendered inline or wrapped in a dialog.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Loader2, Plus, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineMessage } from "@/components/ui/inline-error";
import { useVariables } from "@/hooks/useVariables";
import { useToast } from "@/contexts/ToastContext";
import type { Variable } from "@branchforge/shared";

interface VariablesContentProps {
  projectId: string;
}

interface VariableForm {
  id?: string;
  key: string;
  description: string;
  category: string;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Validate a single variable
 */
function validateVariable(stateVariable: VariableForm): string | null {
  if (!stateVariable.key.trim()) {
    return "Variable key is required";
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(stateVariable.key)) {
    return "Variable key can only contain letters, numbers, underscores, and hyphens";
  }
  if (stateVariable.key.length > 50) {
    return "Variable key is too long (max 50 characters)";
  }
  if (stateVariable.description && stateVariable.description.length > 500) {
    return "Description is too long (max 500 characters)";
  }
  if (stateVariable.category && stateVariable.category.length > 50) {
    return "Category is too long (max 50 characters)";
  }
  return null;
}

// ============================================================================
// Component
// ============================================================================

export function VariablesContent({ projectId }: VariablesContentProps) {
  const {
    variables,
    isLoadingVariables,
    variablesError,
    isCreatingVariable,
    isUpdatingVariable,
    isDeletingVariable,
    createVariable,
    updateVariable: updateVariableApi,
    deleteVariable,
  } = useVariables(projectId);
  const { error } = useToast();

  // Form state - list of state variable entries
  const [variablesList, setVariablesList] = useState<VariableForm[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const hasInitialized = useRef(false);

  // Combined loading state for any mutation
  const isSaving =
    isCreatingVariable || isUpdatingVariable || isDeletingVariable;

  /**
   * Initialize form state from variables data.
   * Guard against re-initialization during save operations.
   */
  useEffect(() => {
    // Skip if saving or already initialized for this session
    if (isSaving || hasInitialized.current) {
      return;
    }

    if (variables.length > 0) {
      setVariablesList(
        variables.map((sv: Variable) => ({
          id: sv.id,
          key: sv.key,
          description: sv.description ?? "",
          category: sv.category ?? "",
        }))
      );
      hasInitialized.current = true;
    } else if (variables.length === 0) {
      // Initialize with empty variables
      setVariablesList([]);
      hasInitialized.current = true;
    }
  }, [variables, isSaving]);

  /**
   * Add new variable
   */
  const addVariable = useCallback(() => {
    setVariablesList((prev) => [
      ...prev,
      {
        key: "",
        description: "",
        category: "",
      },
    ]);
    setEditingIndex(variablesList.length);
  }, [variablesList.length]);

  /**
   * Update variable field
   */
  const updateVariableField = useCallback(
    (index: number, field: keyof VariableForm, value: string) => {
      setVariablesList((prev) => {
        const newVariables = [...prev];
        newVariables[index] = {
          ...newVariables[index],
          [field]: value,
        };
        return newVariables;
      });
    },
    []
  );

  /**
   * Remove variable
   */
  const removeVariable = useCallback(
    async (index: number) => {
      const stateVariable = variablesList[index];
      if (stateVariable.id) {
        // Delete existing variable
        try {
          await deleteVariable(stateVariable.id);
          setVariablesList((prev) => prev.filter((_, i) => i !== index));
        } catch {
          // Error is handled by the hook's toast
        }
      } else {
        // Remove new variable (not yet saved)
        setVariablesList((prev) => prev.filter((_, i) => i !== index));
        if (editingIndex === index) {
          setEditingIndex(null);
        }
      }
    },
    [variablesList, deleteVariable, editingIndex]
  );

  /**
   * Save individual variable (create or update)
   */
  const saveVariable = useCallback(
    async (index: number) => {
      const stateVariable = variablesList[index];
      const validationError = validateVariable(stateVariable);
      if (validationError) {
        error(validationError);
        return;
      }

      try {
        if (stateVariable.id) {
          // Update existing variable
          await updateVariableApi(stateVariable.id, {
            key: stateVariable.key,
            description: stateVariable.description || undefined,
            category: stateVariable.category || undefined,
          });
        } else {
          // Create new variable
          const newVariable = await createVariable({
            key: stateVariable.key,
            description: stateVariable.description || undefined,
            category: stateVariable.category || undefined,
          });
          // Update the form with the new variable ID
          setVariablesList((prev) => {
            const newVariables = [...prev];
            newVariables[index] = {
              id: newVariable.id,
              key: newVariable.key,
              description: newVariable.description ?? "",
              category: newVariable.category ?? "",
            };
            return newVariables;
          });
        }
        setEditingIndex(null);
      } catch {
        // Error is handled by the hook's toast
      }
    },
    [variablesList, createVariable, updateVariableApi, error]
  );

  /**
   * Cancel editing
   */
  const cancelEdit = useCallback(
    (index: number) => {
      const stateVariable = variablesList[index];
      if (!stateVariable) {
        return;
      }
      // If it's a new variable (no id), remove it
      if (!stateVariable.id) {
        setVariablesList((prev) => prev.filter((_, i) => i !== index));
      } else {
        // Restore the original variable from server data
        // Use ID-based lookup instead of index for safety
        const original = variables.find(
          (sv: Variable) => sv.id === stateVariable.id
        );
        if (!original) {
          // Variable no longer exists, remove from list
          setVariablesList((prev) => prev.filter((_, i) => i !== index));
          setEditingIndex(null);
          return;
        }
        setVariablesList((prev) => {
          const newVariables = [...prev];
          newVariables[index] = {
            id: original.id,
            key: original.key,
            description: original.description ?? "",
            category: original.category ?? "",
          };
          return newVariables;
        });
      }
      setEditingIndex(null);
    },
    [variablesList, variables]
  );

  /**
   * Check if a variable is valid
   */
  const isVariableValid = useMemo(() => {
    return (index: number) => validateVariable(variablesList[index]) === null;
  }, [variablesList]);

  // Group variables by category for display
  const groupedVariables = useMemo(() => {
    const groups: Record<string, VariableForm[]> = {};
    for (const stateVariable of variablesList) {
      const category = stateVariable.category.trim() || "Uncategorized";
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(stateVariable);
    }
    return groups;
  }, [variablesList]);

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">Variables Management</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Variables are boolean flags used in conditional branching logic. They
          control label accessibility, menu visibility, and story state changes.
        </p>
      </div>

      {isLoadingVariables ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : variablesError ? (
        <InlineMessage variant="error">Failed to load variables</InlineMessage>
      ) : (
        <>
          {variablesList.length === 0 ? (
            <div className="p-8 border border-dashed border-border/30 rounded-md text-center">
              <p className="text-sm text-muted-foreground mb-4">
                No variables configured yet. Add your first variable to get
                started.
              </p>
              <Button type="button" variant="outline" onClick={addVariable}>
                <Plus className="size-4 mr-2" />
                Add Variable
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedVariables).map(
                ([category, categoryVariables]) => (
                  <div key={category} className="space-y-3">
                    <h3 className="text-sm font-medium text-muted-foreground">
                      {category}
                    </h3>
                    <div className="space-y-2">
                      {categoryVariables.map((variableForm) => {
                        const index = variablesList.indexOf(variableForm);
                        const isEditing = editingIndex === index;
                        const validationError = validateVariable(variableForm);

                        return (
                          <div
                            key={variableForm.id || index}
                            className="border border-border/30 rounded-md p-4 space-y-3"
                          >
                            {/* View Mode */}
                            {!isEditing ? (
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-3">
                                    <span className="font-medium font-mono text-sm">
                                      {variableForm.key || "(unnamed)"}
                                    </span>
                                    {variableForm.category && (
                                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                        {variableForm.category}
                                      </span>
                                    )}
                                  </div>
                                  {variableForm.description && (
                                    <p className="text-sm text-muted-foreground mt-1">
                                      {variableForm.description}
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setEditingIndex(index)}
                                    disabled={isSaving}
                                  >
                                    <Pencil className="size-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeVariable(index)}
                                    disabled={isSaving}
                                    className="text-destructive hover:text-destructive"
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              /* Edit Mode */
                              <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1">
                                    <Label
                                      htmlFor={`variable-key-${index}`}
                                      className="text-xs"
                                    >
                                      Variable Key *
                                    </Label>
                                    <Input
                                      id={`variable-key-${index}`}
                                      type="text"
                                      placeholder="met_alex"
                                      value={variableForm.key}
                                      onChange={(e) =>
                                        updateVariableField(
                                          index,
                                          "key",
                                          e.target.value
                                        )
                                      }
                                      disabled={isSaving}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                      Unique identifier (letters, numbers,
                                      underscores)
                                    </p>
                                  </div>

                                  <div className="space-y-1">
                                    <Label
                                      htmlFor={`variable-category-${index}`}
                                      className="text-xs"
                                    >
                                      Category
                                    </Label>
                                    <Input
                                      id={`variable-category-${index}`}
                                      type="text"
                                      placeholder="Relationships"
                                      value={variableForm.category}
                                      onChange={(e) =>
                                        updateVariableField(
                                          index,
                                          "category",
                                          e.target.value
                                        )
                                      }
                                      disabled={isSaving}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                      Group variables by category
                                    </p>
                                  </div>
                                </div>

                                <div className="space-y-1">
                                  <Label
                                    htmlFor={`variable-description-${index}`}
                                    className="text-xs"
                                  >
                                    Description
                                  </Label>
                                  <Input
                                    id={`variable-description-${index}`}
                                    type="text"
                                    placeholder="Player has met Alex"
                                    value={variableForm.description}
                                    onChange={(e) =>
                                      updateVariableField(
                                        index,
                                        "description",
                                        e.target.value
                                      )
                                    }
                                    disabled={isSaving}
                                  />
                                </div>

                                {validationError && (
                                  <p className="text-xs text-destructive">
                                    {validationError}
                                  </p>
                                )}

                                <div className="flex justify-end gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => cancelEdit(index)}
                                    disabled={isSaving}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => saveVariable(index)}
                                    disabled={
                                      !isVariableValid(index) || isSaving
                                    }
                                  >
                                    {isSaving && (
                                      <Loader2 className="size-4 animate-spin mr-2" />
                                    )}
                                    Save
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )
              )}

              {/* Add Variable Button */}
              <Button
                type="button"
                variant="outline"
                onClick={addVariable}
                disabled={isSaving}
                className="w-full"
              >
                <Plus className="size-4 mr-2" />
                Add Another Variable
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
