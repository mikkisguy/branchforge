/**
 * Character Edit Dialog — Details Section
 *
 * Route Affiliation, Conditional Prefix, Notes, Love Interest, and Narrator.
 */

import { Heart, BookOpen } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { FormErrorMessage } from "@/components/ui/form-error-message";
import type { CharacterFormState } from "./CharacterEditDialog.utils";

export interface CharacterEditDialogDetailsSectionProps {
  form: CharacterFormState;
  handleFieldChange: (field: string, value: string | boolean) => void;
  isSaving: boolean;
}

export function CharacterEditDialogDetailsSection({
  form,
  handleFieldChange,
  isSaving,
}: CharacterEditDialogDetailsSectionProps) {
  return (
    <>
      {/* Route + Conditional Prefix */}
      <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-3">
        <div className="space-y-1">
          <Label htmlFor="edit-char-route" className="text-xs">
            Route Affiliation
          </Label>
          <Input
            id="edit-char-route"
            type="text"
            placeholder="EILEEN"
            value={form.routeAffiliation}
            onChange={(e) =>
              handleFieldChange("routeAffiliation", e.target.value)
            }
            disabled={isSaving}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="edit-char-prefix" className="text-xs">
            Conditional Prefix
          </Label>
          <Input
            id="edit-char-prefix"
            type="text"
            placeholder="lucas_"
            value={form.conditionalPrefix}
            onChange={(e) =>
              handleFieldChange("conditionalPrefix", e.target.value)
            }
            disabled={isSaving}
          />
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1">
        <Label htmlFor="edit-char-notes" className="text-xs">
          Notes
        </Label>
        <textarea
          id="edit-char-notes"
          rows={4}
          className="flex min-h-[250px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="Backstory, personality notes, voice references..."
          value={form.notes}
          onChange={(e) => handleFieldChange("notes", e.target.value)}
          disabled={isSaving}
          maxLength={10000}
          aria-invalid={!!form.notesError}
          aria-describedby={
            form.notesError ? "edit-char-notes-error" : undefined
          }
        />
        <FormErrorMessage
          id="edit-char-notes-error"
          message={form.notesError}
        />
      </div>

      {/* Love Interest + Narrator */}
      <fieldset className="grid grid-cols-2 max-sm:grid-cols-1 gap-3">
        <legend className="col-span-2 text-xs font-medium mb-2">
          Character Types
        </legend>
        <div className="flex items-center gap-2 pt-5">
          <input
            type="checkbox"
            id="edit-char-love"
            checked={form.isLoveInterest}
            onChange={(e) =>
              handleFieldChange("isLoveInterest", e.target.checked)
            }
            disabled={isSaving}
            className="size-4"
            aria-label="Love Interest"
          />
          <Label
            htmlFor="edit-char-love"
            className="text-xs cursor-pointer flex items-center gap-1"
          >
            <Heart className="size-3" />
            Love Interest
          </Label>
        </div>

        <div className="flex items-center gap-2 pt-5">
          <input
            type="checkbox"
            id="edit-char-narrator"
            checked={form.isNarrator}
            onChange={(e) => handleFieldChange("isNarrator", e.target.checked)}
            disabled={isSaving}
            className="size-4 accent-purple-500"
            aria-label="Narrator"
          />
          <Label
            htmlFor="edit-char-narrator"
            className="text-xs cursor-pointer flex items-center gap-1"
          >
            <BookOpen className="size-3" />
            Narrator
          </Label>
        </div>
      </fieldset>
    </>
  );
}
