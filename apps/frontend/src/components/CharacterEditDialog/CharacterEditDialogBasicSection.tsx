/**
 * Character Edit Dialog — Basic Info Section
 *
 * Name, Display Name, Ren'Py Tag, and Color picker.
 */

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormErrorMessage } from "@/components/ui/form-error-message";
import type { CharacterFormState } from "./CharacterEditDialog.utils";

export interface CharacterEditDialogBasicSectionProps {
  form: CharacterFormState;
  handleFieldChange: (field: string, value: string | boolean) => void;
  isSaving: boolean;
  isEditMode: boolean;
}

export function CharacterEditDialogBasicSection({
  form,
  handleFieldChange,
  isSaving,
  isEditMode,
}: CharacterEditDialogBasicSectionProps) {
  return (
    <>
      {/* Name + Display Name */}
      <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-3">
        <div className="space-y-1">
          <Label htmlFor="edit-char-name" className="text-xs">
            Name *
          </Label>
          <Input
            id="edit-char-name"
            type="text"
            placeholder="Eileen"
            value={form.name}
            onChange={(e) => handleFieldChange("name", e.target.value)}
            disabled={isSaving}
            aria-required="true"
            aria-invalid={!!form.nameError}
            aria-describedby={
              form.nameError ? "edit-char-name-error" : undefined
            }
          />
          <FormErrorMessage
            id="edit-char-name-error"
            message={form.nameError}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="edit-char-display-name" className="text-xs">
            Display Name *
          </Label>
          <Input
            id="edit-char-display-name"
            type="text"
            placeholder="Eileen"
            value={form.displayName}
            onChange={(e) => handleFieldChange("displayName", e.target.value)}
            disabled={isSaving}
            aria-required="true"
            aria-invalid={!!form.displayNameError}
            aria-describedby={
              form.displayNameError ? "edit-char-display-name-error" : undefined
            }
          />
          <FormErrorMessage
            id="edit-char-display-name-error"
            message={form.displayNameError}
          />
        </div>
      </div>

      {/* Ren'Py Tag + Color */}
      <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-3">
        <div className="space-y-1">
          <Label htmlFor="edit-char-tag" className="text-xs">
            Ren'Py Tag *
          </Label>
          <Input
            id="edit-char-tag"
            type="text"
            placeholder="a"
            value={form.renpyTag}
            onChange={(e) => handleFieldChange("renpyTag", e.target.value)}
            disabled={isSaving || isEditMode}
            aria-required="true"
            aria-invalid={!!form.renpyTagError}
            aria-describedby={
              form.renpyTagError ? "edit-char-tag-error" : undefined
            }
          />
          <p className="text-xs text-muted-foreground">
            Unique identifier (e.g., &quot;a&quot;, &quot;lucas&quot;)
          </p>
          <FormErrorMessage
            id="edit-char-tag-error"
            message={form.renpyTagError}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="edit-char-color" className="text-xs">
            Color *
          </Label>
          <div className="flex gap-2">
            <Input
              id="edit-char-color"
              type="text"
              placeholder="#FF6B6B"
              value={form.color}
              onChange={(e) => handleFieldChange("color", e.target.value)}
              disabled={isSaving}
              aria-required="true"
              aria-invalid={!!form.colorError}
              aria-describedby={
                form.colorError ? "edit-char-color-error" : undefined
              }
            />
            <Input
              type="color"
              aria-label="Color picker"
              value={form.color}
              onChange={(e) => handleFieldChange("color", e.target.value)}
              disabled={isSaving}
              aria-required="true"
              aria-invalid={!!form.colorError}
              aria-describedby={
                form.colorError ? "edit-char-color-error" : undefined
              }
              className="w-12 h-9 p-0.5"
            />
          </div>
          <FormErrorMessage
            id="edit-char-color-error"
            message={form.colorError}
          />
        </div>
      </div>
    </>
  );
}
