/**
 * Pair Group Edit Dialog
 *
 * Modal for creating or editing a single pair group.
 * Pattern matches RouteEditDialog — standalone dialog with form.
 */

import { useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { usePairGroups } from "@/hooks/usePairGroups";
import { useCharacters } from "@/hooks/useCharacters";
import type { PairGroupWithNames } from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

export interface PairGroupEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  pairGroupId?: string;
}

interface PairGroupFormState {
  characterAId: string;
  characterBId: string;
  duoEndingLabel: string;
}

interface PairGroupFormErrors {
  characterAId?: string;
  characterBId?: string;
  duoEndingLabel?: string;
}

function validateForm(form: PairGroupFormState): PairGroupFormErrors {
  const errors: PairGroupFormErrors = {};

  if (!form.characterAId) {
    errors.characterAId = "Character A is required";
  }
  if (!form.characterBId) {
    errors.characterBId = "Character B is required";
  }
  if (
    form.characterAId &&
    form.characterBId &&
    form.characterAId === form.characterBId
  ) {
    errors.characterBId = "Character B must be different from Character A";
  }
  if (!form.duoEndingLabel.trim()) {
    errors.duoEndingLabel = "Duo ending label is required";
  }

  return errors;
}

// ============================================================================
// Create Form
// ============================================================================

function CreateForm({
  characters,
  isSaving,
  onSave,
  onCancel,
}: {
  characters: Array<{ id: string; name: string; displayName: string }>;
  isSaving: boolean;
  onSave: (form: PairGroupFormState) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<PairGroupFormState>({
    characterAId: "",
    characterBId: "",
    duoEndingLabel: "",
  });
  const [errors, setErrors] = useState<PairGroupFormErrors>({});

  const handleChange = (field: keyof PairGroupFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors({});
  };

  const handleSave = async () => {
    const validationErrors = validateForm(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    await onSave(form);
  };

  const charOptions = characters.map((c) => ({
    value: c.id,
    label: c.displayName,
  }));
  const availableB = charOptions.filter(
    (opt) => opt.value !== form.characterAId
  );

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="pair-char-a" className="text-xs">
          Character A *
        </Label>
        <Select
          id="pair-char-a"
          options={charOptions}
          value={form.characterAId || undefined}
          onChange={(value: string) => handleChange("characterAId", value)}
          placeholder="Select character A..."
          disabled={isSaving || characters.length === 0}
          aria-required="true"
          aria-invalid={!!errors.characterAId}
          aria-describedby={
            errors.characterAId ? "pair-char-a-error" : undefined
          }
        />
        <FormErrorMessage
          id="pair-char-a-error"
          message={errors.characterAId}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="pair-char-b" className="text-xs">
          Character B *
        </Label>
        <Select
          id="pair-char-b"
          options={availableB}
          value={form.characterBId || undefined}
          onChange={(value: string) => handleChange("characterBId", value)}
          placeholder="Select character B..."
          disabled={isSaving || !form.characterAId}
          aria-required="true"
          aria-invalid={!!errors.characterBId}
          aria-describedby={
            errors.characterBId ? "pair-char-b-error" : undefined
          }
        />
        <FormErrorMessage
          id="pair-char-b-error"
          message={errors.characterBId}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="pair-duo-label" className="text-xs">
          Duo Ending Label *
        </Label>
        <Input
          id="pair-duo-label"
          type="text"
          placeholder="e.g., best_friends_ending"
          value={form.duoEndingLabel}
          onChange={(event) =>
            handleChange("duoEndingLabel", event.target.value)
          }
          disabled={isSaving}
          aria-required="true"
          aria-invalid={!!errors.duoEndingLabel}
          aria-describedby={
            errors.duoEndingLabel ? "pair-duo-label-error" : undefined
          }
        />
        <FormErrorMessage
          id="pair-duo-label-error"
          message={errors.duoEndingLabel}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel
        </Button>
        <Button type="button" onClick={handleSave} disabled={isSaving}>
          {isSaving && <Loader2 className="size-4 animate-spin mr-2" />}
          Create Pair Group
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Edit Form
// ============================================================================

function EditForm({
  pairGroup,
  isSaving,
  onSave,
  onCancel,
}: {
  pairGroup: PairGroupWithNames;
  isSaving: boolean;
  onSave: (data: { duoEndingLabel?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    duoEndingLabel: pairGroup.duoEndingLabel,
  });
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!form.duoEndingLabel.trim()) {
      setError("Duo ending label is required");
      return;
    }
    setError(null);

    await onSave({
      duoEndingLabel: form.duoEndingLabel.trim(),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 py-2">
        <Badge variant="outline">{pairGroup.characterAName}</Badge>
        <span className="text-muted-foreground text-sm">&amp;</span>
        <Badge variant="outline">{pairGroup.characterBName}</Badge>
      </div>

      <div className="space-y-1">
        <Label htmlFor="edit-pair-duo-label" className="text-xs">
          Duo Ending Label *
        </Label>
        <Input
          id="edit-pair-duo-label"
          type="text"
          value={form.duoEndingLabel}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              duoEndingLabel: event.target.value,
            }))
          }
          disabled={isSaving}
          aria-required="true"
          aria-invalid={!!error}
          aria-describedby={error ? "edit-pair-duo-label-error" : undefined}
        />
        <FormErrorMessage
          id="edit-pair-duo-label-error"
          message={error ?? undefined}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
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

// ============================================================================
// Dialog Component
// ============================================================================

export function PairGroupEditDialog({
  open,
  onOpenChange,
  projectId,
  pairGroupId,
}: PairGroupEditDialogProps) {
  const {
    pairGroups,
    isLoading: isLoadingPairGroups,
    isCreating,
    isUpdating,
    createPairGroup,
    updatePairGroup,
  } = usePairGroups(projectId, { enabled: open });

  const { characters } = useCharacters(projectId, { enabled: open });

  const isEditMode = !!pairGroupId;
  const isSaving = isCreating || isUpdating;

  const sortedCharacters = characters
    .toSorted((a, b) => a.displayName.localeCompare(b.displayName))
    .map((c) => ({
      id: c.id,
      name: c.name,
      displayName: c.displayName,
    }));

  const existingPairGroup = isEditMode
    ? (pairGroups.find((pg) => pg.id === pairGroupId) ?? null)
    : null;

  // Derive whether the dialog should be open: close if editing a
  // pair group that no longer exists (deleted externally after mount).
  const pairGroupStillExists =
    !isEditMode || isLoadingPairGroups || !!existingPairGroup;
  const effectiveOpen = open && pairGroupStillExists;

  const handleCreate = async (form: PairGroupFormState) => {
    await createPairGroup({
      characterAId: form.characterAId,
      characterBId: form.characterBId,
      duoEndingLabel: form.duoEndingLabel,
    });
    onOpenChange(false);
  };

  const handleUpdate = async (data: { duoEndingLabel?: string }) => {
    if (!pairGroupId) return;
    await updatePairGroup(pairGroupId, data);
    onOpenChange(false);
  };

  if (isEditMode && isLoadingPairGroups) {
    return (
      <Dialog open={effectiveOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md w-full">
          <DialogHeader>
            <DialogTitle>Edit Pair Group</DialogTitle>
            <DialogDescription>Loading...</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={effectiveOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-full">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? "Edit Pair Group" : "Add Pair Group"}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Update the duo ending settings."
              : "Create a new pair group for duo ending tracking."}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          {isEditMode && existingPairGroup ? (
            <EditForm
              pairGroup={existingPairGroup}
              isSaving={isSaving}
              onSave={handleUpdate}
              onCancel={() => onOpenChange(false)}
            />
          ) : (
            <CreateForm
              characters={sortedCharacters}
              isSaving={isSaving}
              onSave={handleCreate}
              onCancel={() => onOpenChange(false)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
