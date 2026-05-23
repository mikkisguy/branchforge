/**
 * State Variables Content
 *
 * Reusable content component for state stateVariables management.
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

interface StateVariablesContentProps {
  projectId: string;
}

interface StateVariableForm {
  id?: string;
  key: string;
  description: string;
  category: string;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Validate a single state variable
 */
function validateStateVariable(
  stateVariable: StateVariableForm
): string | null {
  if (!stateVariable.key.trim()) {
    return "State variable key is required";
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(stateVariable.key)) {
    return "State variable key can only contain letters, numbers, underscores, and hyphens";
  }
  if (stateVariable.key.length > 50) {
    return "State variable key is too long (max 50 characters)";
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

export function VariablesContent({ projectId }: StateVariablesContentProps) {
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

  // Form state
  const [stateVariablesList, setStateVariablesList] = useState<
    StateVariableForm[]
  >([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const hasInitialized = useRef(false);

  // Combined loading state for any mutation
  const isSaving =
    isCreatingVariable || isUpdatingVariable || isDeletingVariable;

  /**
   * Initialize form state from state stateVariables
   * Guard against re-initialization during save operations
   */
  useEffect(() => {
    // Skip if saving or already initialized for this session
    if (isSaving || hasInitialized.current) {
      return;
    }

    if (variables.length > 0) {
      setStateVariablesList(
        variables.map((sv: Variable) => ({
          id: sv.id,
          key: sv.key,
          description: sv.description ?? "",
          category: sv.category ?? "",
        }))
      );
      hasInitialized.current = true;
    } else if (variables.length === 0) {
      // Initialize with empty state stateVariables
      setStateVariablesList([]);
      hasInitialized.current = true;
    }
  }, [variables, isSaving]);

  /**
   * Add new state variable
   */
  const addStateVariable = useCallback(() => {
    setStateVariablesList((prev) => [
      ...prev,
      {
        key: "",
        description: "",
        category: "",
      },
    ]);
    setEditingIndex(stateVariablesList.length);
  }, [stateVariablesList.length]);

  /**
   * Update state variable field
   */
  const updateStateVariableField = useCallback(
    (index: number, field: keyof StateVariableForm, value: string) => {
      setStateVariablesList((prev) => {
        const newStateVariables = [...prev];
        newStateVariables[index] = {
          ...newStateVariables[index],
          [field]: value,
        };
        return newStateVariables;
      });
    },
    []
  );

  /**
   * Remove state variable
   */
  const removeStateVariable = useCallback(
    async (index: number) => {
      const stateVariable = stateVariablesList[index];
      if (stateVariable.id) {
        // Delete existing state variable
        try {
          await deleteVariable(stateVariable.id);
          setStateVariablesList((prev) => prev.filter((_, i) => i !== index));
        } catch {
          // Error is handled by the hook's toast
        }
      } else {
        // Remove new state variable (not yet saved)
        setStateVariablesList((prev) => prev.filter((_, i) => i !== index));
        if (editingIndex === index) {
          setEditingIndex(null);
        }
      }
    },
    [stateVariablesList, deleteVariable, editingIndex]
  );

  /**
   * Save individual state variable (create or update)
   */
  const saveStateVariable = useCallback(
    async (index: number) => {
      const stateVariable = stateVariablesList[index];
      const validationError = validateStateVariable(stateVariable);
      if (validationError) {
        error(validationError);
        return;
      }

      try {
        if (stateVariable.id) {
          // Update existing state variable
          await updateVariableApi(stateVariable.id, {
            key: stateVariable.key,
            description: stateVariable.description || undefined,
            category: stateVariable.category || undefined,
          });
        } else {
          // Create new state variable
          const newStateVariable = await createVariable({
            key: stateVariable.key,
            description: stateVariable.description || undefined,
            category: stateVariable.category || undefined,
          });
          // Update the form with the new state variable ID
          setStateVariablesList((prev) => {
            const newStateVariables = [...prev];
            newStateVariables[index] = {
              id: newStateVariable.id,
              key: newStateVariable.key,
              description: newStateVariable.description ?? "",
              category: newStateVariable.category ?? "",
            };
            return newStateVariables;
          });
        }
        setEditingIndex(null);
      } catch {
        // Error is handled by the hook's toast
      }
    },
    [stateVariablesList, createVariable, updateVariableApi, error]
  );

  /**
   * Cancel editing
   */
  const cancelEdit = useCallback(
    (index: number) => {
      const stateVariable = stateVariablesList[index];
      if (!stateVariable) {
        return;
      }
      // If it's a new state variable (no id), remove it
      if (!stateVariable.id) {
        setStateVariablesList((prev) => prev.filter((_, i) => i !== index));
      } else {
        // Restore the original state variable from server data
        // Use ID-based lookup instead of index for safety
        const original = variables.find(
          (sv: Variable) => sv.id === stateVariable.id
        );
        if (!original) {
          // State variable no longer exists, remove from list
          setStateVariablesList((prev) => prev.filter((_, i) => i !== index));
          setEditingIndex(null);
          return;
        }
        setStateVariablesList((prev) => {
          const newStateVariables = [...prev];
          newStateVariables[index] = {
            id: original.id,
            key: original.key,
            description: original.description ?? "",
            category: original.category ?? "",
          };
          return newStateVariables;
        });
      }
      setEditingIndex(null);
    },
    [stateVariablesList, variables]
  );

  /**
   * Check if a state variable is valid
   */
  const isStateVariableValid = useMemo(() => {
    return (index: number) =>
      validateStateVariable(stateVariablesList[index]) === null;
  }, [stateVariablesList]);

  // Group state stateVariables by category for display
  const groupedStateVariables = useMemo(() => {
    const groups: Record<string, StateVariableForm[]> = {};
    for (const stateVariable of stateVariablesList) {
      const category = stateVariable.category.trim() || "Uncategorized";
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(stateVariable);
    }
    return groups;
  }, [stateVariablesList]);

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">State Variables Management</h3>
        <p className="text-sm text-muted-foreground mt-1">
          State stateVariables are boolean state stateVariables used in
          conditional branching logic. They control label accessibility, menu
          visibility, and story state changes.
        </p>
      </div>

      {isLoadingVariables ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : variablesError ? (
        <InlineMessage variant="error">
          Failed to load state stateVariables
        </InlineMessage>
      ) : (
        <>
          {stateVariablesList.length === 0 ? (
            <div className="p-8 border border-dashed border-border/30 rounded-md text-center">
              <p className="text-sm text-muted-foreground mb-4">
                No state stateVariables configured yet. Add your first state
                variable to get started.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={addStateVariable}
              >
                <Plus className="size-4 mr-2" />
                Add State Variable
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedStateVariables).map(
                ([category, categoryStateVariables]) => (
                  <div key={category} className="space-y-3">
                    <h3 className="text-sm font-medium text-muted-foreground">
                      {category}
                    </h3>
                    <div className="space-y-2">
                      {categoryStateVariables.map((stateVariable) => {
                        const index = stateVariablesList.indexOf(stateVariable);
                        const isEditing = editingIndex === index;
                        const validationError =
                          validateStateVariable(stateVariable);

                        return (
                          <div
                            key={stateVariable.id || index}
                            className="border border-border/30 rounded-md p-4 space-y-3"
                          >
                            {/* View Mode */}
                            {!isEditing ? (
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-3">
                                    <span className="font-medium font-mono text-sm">
                                      {stateVariable.key || "(unnamed)"}
                                    </span>
                                    {stateVariable.category && (
                                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                        {stateVariable.category}
                                      </span>
                                    )}
                                  </div>
                                  {stateVariable.description && (
                                    <p className="text-sm text-muted-foreground mt-1">
                                      {stateVariable.description}
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
                                    onClick={() => removeStateVariable(index)}
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
                                      htmlFor={`state-variable-key-${index}`}
                                      className="text-xs"
                                    >
                                      State Variable Key *
                                    </Label>
                                    <Input
                                      id={`state-variable-key-${index}`}
                                      type="text"
                                      placeholder="met_alex"
                                      value={stateVariable.key}
                                      onChange={(e) =>
                                        updateStateVariableField(
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
                                      htmlFor={`state-variable-category-${index}`}
                                      className="text-xs"
                                    >
                                      Category
                                    </Label>
                                    <Input
                                      id={`state-variable-category-${index}`}
                                      type="text"
                                      placeholder="Relationships"
                                      value={stateVariable.category}
                                      onChange={(e) =>
                                        updateStateVariableField(
                                          index,
                                          "category",
                                          e.target.value
                                        )
                                      }
                                      disabled={isSaving}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                      Group state stateVariables by category
                                    </p>
                                  </div>
                                </div>

                                <div className="space-y-1">
                                  <Label
                                    htmlFor={`state-variable-description-${index}`}
                                    className="text-xs"
                                  >
                                    Description
                                  </Label>
                                  <Input
                                    id={`state-variable-description-${index}`}
                                    type="text"
                                    placeholder="Player has met Alex"
                                    value={stateVariable.description}
                                    onChange={(e) =>
                                      updateStateVariableField(
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
                                    onClick={() => saveStateVariable(index)}
                                    disabled={
                                      !isStateVariableValid(index) || isSaving
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

              {/* Add State Variable Button */}
              <Button
                type="button"
                variant="outline"
                onClick={addStateVariable}
                disabled={isSaving}
                className="w-full"
              >
                <Plus className="size-4 mr-2" />
                Add Another State Variable
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
