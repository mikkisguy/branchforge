/**
 * Ren'Py Definitions Dialog
 *
 * Dialog for managing Ren'Py definitions for a project.
 * Ren'Py definitions are static declarations for export to RPY files.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Loader2, X, Plus, Trash2, Pencil, Code } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { InlineMessage } from "@/components/ui/inline-error";
import { useRenpyDefinitions } from "@/hooks/useRenpyDefinitions";
import { useToast } from "@/contexts/ToastContext";
import { RenpyDefinitionCategory } from "@branchforge/shared";

interface RenpyDefinitionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

interface RenpyDefinitionForm {
  id?: string;
  category: RenpyDefinitionCategory;
  tag: string;
  displayName: string;
  definitionCode: string;
  referenceTag: string;
  sortOrder: number;
}

const CATEGORIES = [
  { value: "CHARACTER", label: "Characters" },
  { value: "TRANSFORM", label: "Transforms" },
  { value: "IMAGE", label: "Images" },
  { value: "INIT", label: "Init Statements" },
] as const;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Validate a single Ren'Py definition
 * Tag validation is category-aware: IMAGE allows spaces, others don't
 */
function validateRenpyDefinition(
  definition: RenpyDefinitionForm
): string | null {
  if (!definition.tag.trim()) {
    return "Tag is required";
  }
  // IMAGE category allows spaces for names like "bg cafe"
  // Other categories require strict identifier format (no spaces)
  const isImage = definition.category === "IMAGE";
  const tagRegex = isImage
    ? /^[a-zA-Z0-9_]+(?:[a-zA-Z0-9_ ]*[a-zA-Z0-9_]+)?$/
    : /^[a-zA-Z0-9_]+$/;
  const tagMessage = isImage
    ? "Tag can only contain letters, numbers, underscores, and spaces (no leading/trailing spaces)"
    : "Tag can only contain letters, numbers, and underscores";

  if (!tagRegex.test(definition.tag)) {
    return tagMessage;
  }
  if (definition.tag.length > 100) {
    return "Tag is too long (max 100 characters)";
  }
  if (!definition.displayName.trim()) {
    return "Display name is required";
  }
  if (definition.displayName.length > 200) {
    return "Display name is too long (max 200 characters)";
  }
  if (!definition.definitionCode.trim()) {
    return "Definition code is required";
  }
  if (definition.sortOrder < 0) {
    return "Sort order must be a non-negative number";
  }
  return null;
}

// ============================================================================
// Component
// ============================================================================

export function RenpyDefinitionsDialog({
  open,
  onOpenChange,
  projectId,
}: RenpyDefinitionsDialogProps) {
  const {
    renpyDefinitions,
    isLoadingRenpyDefinitions,
    renpyDefinitionsError,
    isCreatingRenpyDefinition,
    isUpdatingRenpyDefinition,
    isDeletingRenpyDefinition,
    createRenpyDefinition,
    updateRenpyDefinition: updateRenpyDefinitionApi,
    deleteRenpyDefinition,
  } = useRenpyDefinitions(projectId);
  const { error } = useToast();

  // Form state
  const [definitionsList, setDefinitionsList] = useState<
    RenpyDefinitionForm[]
  >([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<
    RenpyDefinitionCategory | "ALL"
  >("ALL");
  const hasInitialized = useRef(false);

  // Combined loading state for any mutation
  const isSaving =
    isCreatingRenpyDefinition ||
    isUpdatingRenpyDefinition ||
    isDeletingRenpyDefinition;

  /**
   * Initialize form state from Ren'Py definitions
   * Guard against re-initialization during save operations
   */
  useEffect(() => {
    // Skip if saving or already initialized for this dialog session
    if (isSaving || hasInitialized.current) {
      return;
    }

    if (open && renpyDefinitions.length > 0) {
      setDefinitionsList(
        renpyDefinitions.map((rd) => ({
          id: rd.id,
          category: rd.category,
          tag: rd.tag,
          displayName: rd.displayName,
          definitionCode: rd.definitionCode,
          referenceTag: rd.referenceTag ?? "",
          sortOrder: rd.sortOrder,
        }))
      );
      hasInitialized.current = true;
    } else if (open && renpyDefinitions.length === 0) {
      // Initialize with empty definitions
      setDefinitionsList([]);
      hasInitialized.current = true;
    }
  }, [open, renpyDefinitions, isSaving]);

  /**
   * Reset form state
   */
  const reset = useCallback(() => {
    setDefinitionsList([]);
    setEditingIndex(null);
    setSelectedCategory("ALL");
    hasInitialized.current = false;
  }, []);

  /**
   * Close dialog
   */
  const closeDialog = useCallback(() => {
    reset();
    onOpenChange(false);
  }, [reset, onOpenChange]);

  /**
   * Add new Ren'Py definition
   */
  const addDefinition = useCallback(() => {
    setDefinitionsList((prev) => {
      const newIndex = prev.length;
      const newItem = {
        category: selectedCategory === "ALL" ? "CHARACTER" : selectedCategory,
        tag: "",
        displayName: "",
        definitionCode: "",
        referenceTag: "",
        sortOrder: newIndex,
      };
      setEditingIndex(newIndex);
      return [...prev, newItem];
    });
  }, [selectedCategory]);

  /**
   * Update Ren'Py definition field
   */
  const updateDefinitionField = useCallback(
    (index: number, field: keyof RenpyDefinitionForm, value: string | number) => {
      setDefinitionsList((prev) => {
        const newDefinitions = [...prev];
        newDefinitions[index] = {
          ...newDefinitions[index],
          [field]: value,
        };
        return newDefinitions;
      });
    },
    []
  );

  /**
   * Remove Ren'Py definition
   */
  const removeDefinition = useCallback(
    async (index: number) => {
      const definition = definitionsList[index];
      if (definition.id) {
        // Delete existing definition
        try {
          await deleteRenpyDefinition(definition.id);
          setDefinitionsList((prev) =>
            prev.filter((_, i) => i !== index)
          );
        } catch {
          // Error is handled by the hook's toast
        }
      } else {
        // Remove new definition (not yet saved)
        setDefinitionsList((prev) => prev.filter((_, i) => i !== index));
        if (editingIndex === index) {
          setEditingIndex(null);
        }
      }
    },
    [definitionsList, deleteRenpyDefinition, editingIndex]
  );

  /**
   * Save individual Ren'Py definition (create or update)
   */
  const saveDefinition = useCallback(
    async (index: number) => {
      const definition = definitionsList[index];
      const validationError = validateRenpyDefinition(definition);
      if (validationError) {
        error(validationError);
        return;
      }

      try {
        if (definition.id) {
          // Update existing definition
          await updateRenpyDefinitionApi(definition.id, {
            category: definition.category,
            tag: definition.tag,
            displayName: definition.displayName,
            definitionCode: definition.definitionCode,
            referenceTag: definition.referenceTag || null,
            sortOrder: definition.sortOrder,
          });
        } else {
          // Create new definition
          const newDefinition = await createRenpyDefinition({
            category: definition.category,
            tag: definition.tag,
            displayName: definition.displayName,
            definitionCode: definition.definitionCode,
            referenceTag: definition.referenceTag || null,
            sortOrder: definition.sortOrder,
          });
          // Update the form with the new definition ID
          setDefinitionsList((prev) => {
            const newDefinitions = [...prev];
            newDefinitions[index] = {
              id: newDefinition.id,
              category: newDefinition.category,
              tag: newDefinition.tag,
              displayName: newDefinition.displayName,
              definitionCode: newDefinition.definitionCode,
              referenceTag: newDefinition.referenceTag ?? "",
              sortOrder: newDefinition.sortOrder,
            };
            return newDefinitions;
          });
        }
        setEditingIndex(null);
      } catch {
        // Error is handled by the hook's toast
      }
    },
    [definitionsList, createRenpyDefinition, updateRenpyDefinitionApi, error]
  );

  /**
   * Cancel editing
   */
  const cancelEdit = useCallback(
    (index: number) => {
      const definition = definitionsList[index];
      // If it's a new definition (no id), remove it
      if (!definition.id) {
        setDefinitionsList((prev) => prev.filter((_, i) => i !== index));
      }
      setEditingIndex(null);
    },
    [definitionsList]
  );

  /**
   * Check if a definition is valid
   */
  const isDefinitionValid = useMemo(() => {
    return (index: number) =>
      validateRenpyDefinition(definitionsList[index]) === null;
  }, [definitionsList]);

  // Filter definitions by selected category, preserving original indices
  const filteredDefinitionsWithIndices = useMemo(() => {
    if (selectedCategory === "ALL") {
      return definitionsList.map((definition, originalIndex) => ({
        definition,
        originalIndex,
      }));
    }
    return definitionsList
      .map((definition, originalIndex) => ({ definition, originalIndex }))
      .filter(({ definition }) => definition.category === selectedCategory);
  }, [definitionsList, selectedCategory]);

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-full max-h-[90vh] p-0 gap-0 flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-border/30 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-medium">Ren'Py Definitions Management</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Ren'Py definitions are static declarations exported to definitions.rpy.
              Manage characters, transforms, images, and init statements for your project.
            </p>
          </div>
          <button
            onClick={closeDialog}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Category Tabs */}
        <div className="px-6 pt-4 border-b border-border/30">
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedCategory("ALL")}
              className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
                selectedCategory === "ALL"
                  ? "bg-background text-foreground border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All
            </button>
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                onClick={() => setSelectedCategory(cat.value)}
                className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
                  selectedCategory === cat.value
                    ? "bg-background text-foreground border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {isLoadingRenpyDefinitions ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : renpyDefinitionsError ? (
            <InlineMessage variant="error">
              Failed to load Ren'Py definitions
            </InlineMessage>
          ) : (
            <>
              {filteredDefinitionsWithIndices.length === 0 ? (
                <div className="p-8 border border-dashed border-border/30 rounded-md text-center">
                  <Code className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-sm text-muted-foreground mb-4">
                    {selectedCategory === "ALL"
                      ? "No Ren'Py definitions configured yet. Add your first definition to get started."
                      : `No ${CATEGORIES.find((c) => c.value === selectedCategory)?.label.toLowerCase()} configured yet.`}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addDefinition}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Definition
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredDefinitionsWithIndices.map(({ definition, originalIndex }) => {
                    const isEditing = editingIndex === originalIndex;
                    const validationError =
                      validateRenpyDefinition(definition);

                    return (
                      <div
                        key={definition.id || originalIndex}
                        className="border border-border/30 rounded-md p-4 space-y-3"
                      >
                        {/* View Mode */}
                        {!isEditing ? (
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                  {definition.category}
                                </span>
                                <span className="font-medium font-mono text-sm">
                                  {definition.displayName}
                                </span>
                                {definition.tag && (
                                  <span className="text-xs text-muted-foreground font-mono">
                                    ({definition.tag})
                                  </span>
                                )}
                              </div>
                              <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                                <code>{definition.definitionCode}</code>
                              </pre>
                            </div>
                            <div className="flex items-center gap-2 ml-4">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditingIndex(originalIndex)}
                                disabled={isSaving}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeDefinition(originalIndex)}
                                disabled={isSaving}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          /* Edit Mode */
                          <div className="space-y-3">
                            <div className="grid grid-cols-4 gap-3">
                              <div className="space-y-1">
                                <Label
                                  htmlFor={`definition-category-${originalIndex}`}
                                  className="text-xs"
                                >
                                  Category *
                                </Label>
                                <select
                                  id={`definition-category-${originalIndex}`}
                                  value={definition.category}
                                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                                    updateDefinitionField(
                                      originalIndex,
                                      "category",
                                      e.target.value
                                    )
                                  }
                                  disabled={isSaving}
                                  className="w-full h-9 px-3 py-1 text-sm rounded-md border border-input bg-background"
                                >
                                  {CATEGORIES.map((cat) => (
                                    <option key={cat.value} value={cat.value}>
                                      {cat.label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="space-y-1">
                                <Label
                                  htmlFor={`definition-tag-${originalIndex}`}
                                  className="text-xs"
                                >
                                  Tag *
                                </Label>
                                <Input
                                  id={`definition-tag-${originalIndex}`}
                                  type="text"
                                  placeholder={
                                    definition.category === "IMAGE"
                                      ? "bg cafe"
                                      : "my_character"
                                  }
                                  value={definition.tag}
                                  onChange={(e) =>
                                    updateDefinitionField(
                                      originalIndex,
                                      "tag",
                                      e.target.value
                                    )
                                  }
                                  disabled={isSaving}
                                />
                                <p className="text-xs text-muted-foreground">
                                  {definition.category === "IMAGE"
                                    ? "Space-separated identifiers (e.g., bg cafe)"
                                    : "Unique identifier (no spaces)"}
                                </p>
                              </div>

                              <div className="space-y-1">
                                <Label
                                  htmlFor={`definition-name-${originalIndex}`}
                                  className="text-xs"
                                >
                                  Display Name *
                                </Label>
                                <Input
                                  id={`definition-name-${originalIndex}`}
                                  type="text"
                                  placeholder="My Character"
                                  value={definition.displayName}
                                  onChange={(e) =>
                                    updateDefinitionField(
                                      originalIndex,
                                      "displayName",
                                      e.target.value
                                    )
                                  }
                                  disabled={isSaving}
                                />
                              </div>

                              <div className="space-y-1">
                                <Label
                                  htmlFor={`definition-sort-${originalIndex}`}
                                  className="text-xs"
                                >
                                  Sort Order
                                </Label>
                                <Input
                                  id={`definition-sort-${originalIndex}`}
                                  type="number"
                                  min="0"
                                  value={definition.sortOrder}
                                  onChange={(e) =>
                                    updateDefinitionField(
                                      originalIndex,
                                      "sortOrder",
                                      parseInt(e.target.value) || 0
                                    )
                                  }
                                  disabled={isSaving}
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <Label
                                htmlFor={`definition-code-${originalIndex}`}
                                className="text-xs"
                              >
                                Definition Code *
                              </Label>
                              <Textarea
                                id={`definition-code-${originalIndex}`}
                                placeholder='define my_character = Character("My Name", color="#cfcfcf")'
                                value={definition.definitionCode}
                                onChange={(e) =>
                                  updateDefinitionField(
                                    originalIndex,
                                    "definitionCode",
                                    e.target.value
                                  )
                                }
                                disabled={isSaving}
                                rows={3}
                                className="font-mono text-sm"
                              />
                            </div>

                            <div className="space-y-1">
                              <Label
                                htmlFor={`definition-ref-${originalIndex}`}
                                className="text-xs"
                              >
                                Reference Tag
                              </Label>
                              <Input
                                id={`definition-ref-${originalIndex}`}
                                type="text"
                                placeholder="Optional reference tag"
                                value={definition.referenceTag}
                                onChange={(e) =>
                                  updateDefinitionField(
                                    originalIndex,
                                    "referenceTag",
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
                                onClick={() => cancelEdit(originalIndex)}
                                disabled={isSaving}
                              >
                                Cancel
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => saveDefinition(originalIndex)}
                                disabled={
                                  !isDefinitionValid(originalIndex) || isSaving
                                }
                              >
                                {isSaving && (
                                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
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
              )}

              {/* Add Definition Button */}
              {filteredDefinitionsWithIndices.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={addDefinition}
                  disabled={isSaving}
                  className="w-full"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Another Definition
                </Button>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border/30 flex justify-between">
          <p className="text-xs text-muted-foreground">
            Definitions will be exported to definitions.rpy during GitLab sync
          </p>
          <Button variant="outline" onClick={closeDialog} disabled={isSaving}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
