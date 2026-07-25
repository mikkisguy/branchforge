/**
 * Stat Edit Dialog
 *
 * Modal for creating or editing a single stat.
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
import { useStats } from "@/hooks/useStats";
import type { Stat } from "@branchforge/shared";
import { useDirtyForm } from "@/hooks/useDirtyForm";
import { useDirtyDialogWarning } from "@/hooks/useDirtyDialogWarning";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface StatEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  statId?: string;
}

interface StatFormState {
  key: string;
  name: string;
  minValue: number;
  maxValue: number;
  description: string;
}

interface StatFormErrors {
  key?: string;
  name?: string;
  range?: string;
}

const initialForm: StatFormState = {
  key: "",
  name: "",
  minValue: 0,
  maxValue: 100,
  description: "",
};

function validateStat(form: StatFormState): StatFormErrors {
  const errors: StatFormErrors = {};

  if (!form.key.trim()) {
    errors.key = "Key is required";
  } else if (!/^[a-z][a-z0-9_]*$/.test(form.key)) {
    errors.key =
      "Key must start with a letter and contain only lowercase letters, numbers, and underscores";
  } else if (form.key.length > 100) {
    errors.key = "Key is too long (max 100 characters)";
  }

  if (!form.name.trim()) {
    errors.name = "Name is required";
  } else if (form.name.length > 200) {
    errors.name = "Name is too long (max 200 characters)";
  }

  if (form.minValue > form.maxValue) {
    errors.range = "Minimum value must be less than or equal to maximum value";
  }

  return errors;
}

// --- Inner form component (keyed to avoid syncing state with props) ---

interface StatFormContentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  statId: string | undefined;
  stats: Stat[];
  isSaving: boolean;
  onSave: (statId: string | undefined, form: StatFormState) => Promise<void>;
}

function StatFormContent({
  open,
  onOpenChange,
  statId,
  stats,
  isSaving,
  onSave,
}: StatFormContentProps) {
  const [form, setForm] = useState<StatFormState>(() => {
    if (!statId) return initialForm;
    const stat = stats.find((item: Stat) => item.id === statId);
    if (!stat) return initialForm;
    return {
      key: stat.key,
      name: stat.name,
      minValue: stat.minValue,
      maxValue: stat.maxValue,
      description: stat.description ?? "",
    };
  });
  const [errors, setErrors] = useState<StatFormErrors>({});

  const initialSnapshot = useMemo(() => {
    if (!statId) return initialForm;
    const stat = stats.find((item: Stat) => item.id === statId);
    if (!stat) return initialForm;
    return {
      key: stat.key,
      name: stat.name,
      minValue: stat.minValue,
      maxValue: stat.maxValue,
      description: stat.description ?? "",
    };
  }, [statId, stats]);

  const { isDirty } = useDirtyForm(initialSnapshot, form);
  const {
    handleOpenChange,
    confirmDiscard,
    discardDialogOpen,
    setDiscardDialogOpen,
  } = useDirtyDialogWarning(isDirty, onOpenChange);

  // react-doctor-disable-next-line react-doctor/no-event-handler
  const isEditMode = !!statId;

  // Close dialog if editing a stat that no longer exists (unguarded —
  // discard prompt would be wrong for a deleted entity).
  useEffect(() => {
    // react-doctor-disable-next-line react-doctor/no-event-handler
    if (isEditMode && !stats.find((item) => item.id === statId)) {
      // react-doctor-disable-next-line react-doctor/no-prop-callback-in-effect
      onOpenChange(false);
    }
  }, [isEditMode, statId, stats, onOpenChange]);

  const handleChange = (field: keyof StatFormState, value: string) => {
    setForm((prev) => {
      if (field === "minValue" || field === "maxValue") {
        const parsedValue = Number(value);
        return {
          ...prev,
          [field]: Number.isNaN(parsedValue) ? prev[field] : parsedValue,
        };
      }

      return {
        ...prev,
        [field]: value,
      };
    });
    setErrors({});
  };

  const handleSave = async () => {
    if (Number.isNaN(form.minValue) || Number.isNaN(form.maxValue)) {
      setErrors({
        range: "Min and max values must be valid numbers",
      });
      return;
    }

    const validationErrors = validateStat(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    try {
      await onSave(statId, form);
      onOpenChange(false);
    } catch {
      // Error handled by hook toast
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-xl w-full">
          <DialogHeader>
            <DialogTitle>{isEditMode ? "Edit Stat" : "Add Stat"}</DialogTitle>
            <DialogDescription>
              {isEditMode
                ? "Update the stat settings."
                : "Create a new stat for your project."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-3">
              <div className="space-y-1">
                <Label htmlFor="stat-key" className="text-xs">
                  Key *
                </Label>
                <Input
                  id="stat-key"
                  type="text"
                  placeholder="affection_luna"
                  value={form.key}
                  onChange={(event) => handleChange("key", event.target.value)}
                  disabled={isSaving || isEditMode}
                  aria-required="true"
                  aria-invalid={!!errors.key}
                  aria-describedby={errors.key ? "stat-key-error" : undefined}
                />
                <p className="text-xs text-muted-foreground">
                  {isEditMode
                    ? "Key cannot be changed after creation"
                    : "Unique identifier (lowercase, underscores)"}
                </p>
                <FormErrorMessage id="stat-key-error" message={errors.key} />
              </div>

              <div className="space-y-1">
                <Label htmlFor="stat-name" className="text-xs">
                  Name *
                </Label>
                <Input
                  id="stat-name"
                  type="text"
                  placeholder="Luna Affection"
                  value={form.name}
                  onChange={(event) => handleChange("name", event.target.value)}
                  disabled={isSaving}
                  aria-required="true"
                  aria-invalid={!!errors.name}
                  aria-describedby={errors.name ? "stat-name-error" : undefined}
                />
                <FormErrorMessage id="stat-name-error" message={errors.name} />
              </div>
            </div>

            <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-3">
              <div className="space-y-1">
                <Label htmlFor="stat-min" className="text-xs">
                  Min Value
                </Label>
                <Input
                  id="stat-min"
                  type="number"
                  value={form.minValue}
                  onChange={(event) =>
                    handleChange("minValue", event.target.value)
                  }
                  disabled={isSaving}
                  aria-invalid={!!errors.range}
                  aria-describedby={
                    errors.range ? "stat-range-error" : undefined
                  }
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="stat-max" className="text-xs">
                  Max Value
                </Label>
                <Input
                  id="stat-max"
                  type="number"
                  value={form.maxValue}
                  onChange={(event) =>
                    handleChange("maxValue", event.target.value)
                  }
                  disabled={isSaving}
                  aria-invalid={!!errors.range}
                  aria-describedby={
                    errors.range ? "stat-range-error" : undefined
                  }
                />
              </div>
            </div>

            <FormErrorMessage id="stat-range-error" message={errors.range} />

            <div className="space-y-1">
              <Label htmlFor="stat-description" className="text-xs">
                Description
              </Label>
              <Input
                id="stat-description"
                type="text"
                placeholder="Tracks how much Luna trusts the player"
                value={form.description}
                onChange={(event) =>
                  handleChange("description", event.target.value)
                }
                disabled={isSaving}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
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

// --- Outer dialog component ---

export function StatEditDialog({
  open,
  onOpenChange,
  projectId,
  statId,
}: StatEditDialogProps) {
  const {
    stats,
    isLoadingStats,
    createStat,
    updateStat,
    isCreatingStat,
    isUpdatingStat,
  } = useStats(projectId);

  const isSaving = isCreatingStat || isUpdatingStat;
  const isEditMode = !!statId;

  const handleSave = async (id: string | undefined, form: StatFormState) => {
    if (id) {
      await updateStat(id, {
        name: form.name.trim(),
        minValue: form.minValue,
        maxValue: form.maxValue,
        description: form.description.trim() || undefined,
      });
    } else {
      await createStat({
        key: form.key.trim(),
        name: form.name.trim(),
        minValue: form.minValue,
        maxValue: form.maxValue,
        description: form.description.trim() || undefined,
      });
    }
  };

  return (
    <>
      {isEditMode && isLoadingStats ? (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="max-w-xl w-full">
            <DialogHeader>
              <DialogTitle>Edit Stat</DialogTitle>
              <DialogDescription>Update the stat settings.</DialogDescription>
            </DialogHeader>
            <div className="flex justify-center py-8">
              <Loader2 className="size-6 animate-spin" />
            </div>
          </DialogContent>
        </Dialog>
      ) : (
        <StatFormContent
          key={`${statId ?? "new"}-${open}`}
          open={open}
          onOpenChange={onOpenChange}
          statId={statId}
          stats={stats}
          isSaving={isSaving}
          onSave={handleSave}
        />
      )}
    </>
  );
}
