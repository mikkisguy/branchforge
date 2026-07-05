/**
 * World Element Edit Dialog
 *
 * Modal for creating or editing a single world element.
 */

import { useState, useEffect } from "react";
import { Loader2, Plus, X } from "lucide-react";
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
import { Select, type SelectOption } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useWorldElements } from "@/hooks/useWorldElements";
import type { WorldElement, WorldElementType } from "@branchforge/shared";

interface WorldElementEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  elementId?: string;
}

interface ElementFormState {
  name: string;
  type: WorldElementType | "";
  description: string;
  tags: string[];
}

interface ElementFormErrors {
  name?: string;
  type?: string;
  description?: string;
}

const TYPE_OPTIONS: SelectOption<WorldElementType>[] = [
  { value: "LOCATION", label: "Location" },
  { value: "ITEM", label: "Item" },
  { value: "CONCEPT", label: "Concept" },
  { value: "EVENT", label: "Event" },
];

const INITIAL_FORM: ElementFormState = {
  name: "",
  type: "",
  description: "",
  tags: [],
};

function validateElement(form: ElementFormState): ElementFormErrors {
  const errors: ElementFormErrors = {};

  if (!form.name.trim()) {
    errors.name = "Name is required";
  } else if (form.name.length > 200) {
    errors.name = "Name is too long (max 200 characters)";
  }

  if (!form.type) {
    errors.type = "Type is required";
  }

  if (form.description && form.description.length > 2000) {
    errors.description = "Description is too long (max 2000 characters)";
  }

  return errors;
}

interface ElementFormContentProps {
  elementId: string | undefined;
  elements: WorldElement[];
  isSaving: boolean;
  onSave: (
    elementId: string | undefined,
    form: ElementFormState
  ) => Promise<void>;
  onClose: () => void;
}

function ElementFormContent({
  elementId,
  elements,
  isSaving,
  onSave,
  onClose,
}: ElementFormContentProps) {
  const [form, setForm] = useState<ElementFormState>(() => {
    if (!elementId) return INITIAL_FORM;
    const element = elements.find((e) => e.id === elementId);
    if (!element) return INITIAL_FORM;
    return {
      name: element.name,
      type: element.type,
      description: element.description ?? "",
      tags: element.tags ?? [],
    };
  });
  const [errors, setErrors] = useState<ElementFormErrors>({});
  const [newTag, setNewTag] = useState("");

  const isEditMode = !!elementId;

  // Close dialog if editing an element that no longer exists
  useEffect(() => {
    if (isEditMode && !elements.find((e) => e.id === elementId)) {
      onClose();
    }
  }, [isEditMode, elementId, elements, onClose]);

  const handleChange = (
    field: keyof ElementFormState,
    value: string | string[]
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors({});
  };

  const handleAddTag = () => {
    const trimmed = newTag.trim();
    if (trimmed && !form.tags.includes(trimmed) && form.tags.length < 20) {
      handleChange("tags", [...form.tags, trimmed]);
      setNewTag("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    handleChange(
      "tags",
      form.tags.filter((t) => t !== tag)
    );
  };

  const handleSave = async () => {
    const validationErrors = validateElement(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    try {
      await onSave(elementId, form);
      onClose();
    } catch {
      // Error handled by hook toast
    }
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="element-name" className="text-xs">
            Name *
          </Label>
          <Input
            id="element-name"
            type="text"
            placeholder="Castle Blackthorn"
            value={form.name}
            onChange={(event) => handleChange("name", event.target.value)}
            disabled={isSaving}
          />
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name}</p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="element-type" className="text-xs">
            Type *
          </Label>
          <Select<WorldElementType>
            id="element-type"
            options={TYPE_OPTIONS}
            value={form.type || undefined}
            onChange={(value) => handleChange("type", value)}
            placeholder="Select type"
            disabled={isSaving}
          />
          {errors.type && (
            <p className="text-xs text-destructive">{errors.type}</p>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="element-description" className="text-xs">
          Description
        </Label>
        <Textarea
          id="element-description"
          placeholder="Describe this world element..."
          value={form.description}
          onChange={(event) => handleChange("description", event.target.value)}
          disabled={isSaving}
          rows={3}
          className="resize-none"
        />
        {errors.description && (
          <p className="text-xs text-destructive">{errors.description}</p>
        )}
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Tags</Label>
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="Add a tag..."
            value={newTag}
            onChange={(event) => setNewTag(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleAddTag();
              }
            }}
            disabled={isSaving}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddTag}
            disabled={isSaving || !newTag.trim() || form.tags.length >= 20}
          >
            <Plus className="size-4" />
          </Button>
        </div>
        {form.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {form.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  disabled={isSaving}
                  className="hover:text-destructive transition-colors"
                  aria-label={`Remove tag ${tag}`}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {form.tags.length}/20 tags. Press Enter to add.
        </p>
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
        <Button type="button" onClick={handleSave} disabled={isSaving}>
          {isSaving && <Loader2 className="size-4 animate-spin mr-2" />}
          Save
        </Button>
      </div>
    </div>
  );
}

export function WorldElementEditDialog({
  open,
  onOpenChange,
  projectId,
  elementId,
}: WorldElementEditDialogProps) {
  const {
    elements,
    isLoadingElements,
    createElement,
    updateElement,
    isCreatingElement,
    isUpdatingElement,
  } = useWorldElements(projectId);

  const isSaving = isCreatingElement || isUpdatingElement;
  const isEditMode = !!elementId;

  const handleSave = async (id: string | undefined, form: ElementFormState) => {
    if (id) {
      await updateElement(id, {
        name: form.name.trim(),
        type: form.type as WorldElementType,
        description: form.description.trim() || undefined,
        tags: form.tags,
      });
    } else {
      await createElement({
        name: form.name.trim(),
        type: form.type as WorldElementType,
        description: form.description.trim() || undefined,
        tags: form.tags,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl w-full">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? "Edit World Element" : "Add World Element"}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Update world element details."
              : "Create a new entry for your world bible."}
          </DialogDescription>
        </DialogHeader>

        {isEditMode && isLoadingElements ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : (
          <ElementFormContent
            key={`${elementId ?? "new"}-${open}`}
            elementId={elementId}
            elements={elements}
            isSaving={isSaving}
            onSave={handleSave}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
