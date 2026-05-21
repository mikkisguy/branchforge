/**
 * Meters Content
 *
 * Reusable content component for meter management.
 * Supports inline create/edit/delete with validation.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Loader2, Plus, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineMessage } from "@/components/ui/inline-error";
import { useMeters } from "@/hooks/useMeters";
import { useToast } from "@/contexts/ToastContext";

interface MetersContentProps {
  projectId: string;
}

interface MeterForm {
  id?: string;
  key: string;
  name: string;
  minValue: number;
  maxValue: number;
  description: string;
}

// ============================================================================
// Helpers
// ============================================================================

function validateMeter(meter: MeterForm): string | null {
  if (!meter.key.trim()) {
    return "Meter key is required";
  }
  if (!/^[a-z][a-z0-9_]*$/.test(meter.key)) {
    return "Key must start with a letter and contain only lowercase letters, numbers, and underscores";
  }
  if (meter.key.length > 100) {
    return "Key is too long (max 100 characters)";
  }
  if (!meter.name.trim()) {
    return "Name is required";
  }
  if (meter.name.length > 200) {
    return "Name is too long (max 200 characters)";
  }
  if (meter.minValue > meter.maxValue) {
    return "Minimum value must be less than or equal to maximum value";
  }
  return null;
}

// ============================================================================
// Component
// ============================================================================

export function MetersContent({ projectId }: MetersContentProps) {
  const {
    meters,
    isLoadingMeters,
    metersError,
    isCreatingMeter,
    isUpdatingMeter,
    isDeletingMeter,
    createMeter,
    updateMeter,
    deleteMeter,
  } = useMeters(projectId);
  const { error } = useToast();

  const [metersList, setMetersList] = useState<MeterForm[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const hasInitialized = useRef(false);

  const isSaving = isCreatingMeter || isUpdatingMeter || isDeletingMeter;

  // Initialize form state from server data
  useEffect(() => {
    if (isSaving || hasInitialized.current) return;

    if (meters.length > 0) {
      setMetersList(
        meters.map((m) => ({
          id: m.id,
          key: m.key,
          name: m.name,
          minValue: m.minValue,
          maxValue: m.maxValue,
          description: m.description ?? "",
        }))
      );
      hasInitialized.current = true;
    } else if (meters.length === 0) {
      setMetersList([]);
      hasInitialized.current = true;
    }
  }, [meters, isSaving]);

  const addMeter = useCallback(() => {
    const newIndex = metersList.length;
    setMetersList((prev) => [
      ...prev,
      { key: "", name: "", minValue: 0, maxValue: 100, description: "" },
    ]);
    setEditingIndex(newIndex);
  }, [metersList.length]);

  const updateField = useCallback(
    (index: number, field: keyof MeterForm, value: string | number) => {
      setMetersList((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], [field]: value };
        return next;
      });
    },
    []
  );

  const removeMeter = useCallback(
    async (index: number) => {
      const meter = metersList[index];
      if (meter.id) {
        try {
          await deleteMeter(meter.id);
          setMetersList((prev) => prev.filter((_, i) => i !== index));
          if (editingIndex === index) setEditingIndex(null);
        } catch {
          // Error handled by hook toast
        }
      } else {
        setMetersList((prev) => prev.filter((_, i) => i !== index));
        if (editingIndex === index) setEditingIndex(null);
      }
    },
    [metersList, deleteMeter, editingIndex]
  );

  const saveMeter = useCallback(
    async (index: number) => {
      const meter = metersList[index];
      const validationError = validateMeter(meter);
      if (validationError) {
        error(validationError);
        return;
      }

      try {
        if (meter.id) {
          await updateMeter(meter.id, {
            name: meter.name,
            minValue: meter.minValue,
            maxValue: meter.maxValue,
            description: meter.description || undefined,
          });
        } else {
          await createMeter({
            key: meter.key,
            name: meter.name,
            minValue: meter.minValue,
            maxValue: meter.maxValue,
            description: meter.description || undefined,
          });
        }
        setEditingIndex(null);
      } catch {
        // Error handled by hook toast
      }
    },
    [metersList, createMeter, updateMeter, error]
  );

  const cancelEdit = useCallback(
    (index: number) => {
      const meter = metersList[index];
      if (!meter) return;

      if (!meter.id) {
        setMetersList((prev) => prev.filter((_, i) => i !== index));
      } else {
        const original = meters.find((m) => m.id === meter.id);
        if (!original) {
          setMetersList((prev) => prev.filter((_, i) => i !== index));
          setEditingIndex(null);
          return;
        }
        setMetersList((prev) => {
          const next = [...prev];
          next[index] = {
            id: original.id,
            key: original.key,
            name: original.name,
            minValue: original.minValue,
            maxValue: original.maxValue,
            description: original.description ?? "",
          };
          return next;
        });
      }
      setEditingIndex(null);
    },
    [metersList, meters]
  );

  const isMeterValid = useMemo(() => {
    return (index: number) => validateMeter(metersList[index]) === null;
  }, [metersList]);

  return (
    <div className="space-y-4">
      {isLoadingMeters ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : metersError ? (
        <InlineMessage variant="error">Failed to load meters</InlineMessage>
      ) : metersList.length === 0 ? (
        <div className="p-6 border border-dashed border-border/30 rounded-md text-center">
          <p className="text-sm text-muted-foreground mb-4">
            No meters defined yet. Add your first meter to start tracking
            relationship stats and character attributes.
          </p>
          <Button type="button" variant="outline" onClick={addMeter}>
            <Plus className="size-4 mr-2" />
            Add Meter
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {metersList.map((meter, index) => {
            const isEditing = editingIndex === index;
            const validationError = validateMeter(meter);

            return (
              <div
                key={meter.id || `new-${index}`}
                className="border border-border/30 rounded-md p-4 space-y-3"
              >
                {!isEditing ? (
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium font-mono text-sm truncate">
                          {meter.key || "(unnamed)"}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground shrink-0">
                          {meter.minValue}&ndash;{meter.maxValue}
                        </span>
                      </div>
                      <p className="text-sm truncate">{meter.name}</p>
                      {meter.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {meter.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 ml-2 shrink-0">
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
                        onClick={() => removeMeter(index)}
                        disabled={isSaving}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label
                          htmlFor={`meter-key-${index}`}
                          className="text-xs"
                        >
                          Key *
                        </Label>
                        <Input
                          id={`meter-key-${index}`}
                          type="text"
                          placeholder="affection_luna"
                          value={meter.key}
                          onChange={(e) =>
                            updateField(index, "key", e.target.value)
                          }
                          disabled={isSaving || !!meter.id}
                        />
                        <p className="text-xs text-muted-foreground">
                          {meter.id
                            ? "Key cannot be changed after creation"
                            : "Unique identifier (lowercase, underscores)"}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <Label
                          htmlFor={`meter-name-${index}`}
                          className="text-xs"
                        >
                          Name *
                        </Label>
                        <Input
                          id={`meter-name-${index}`}
                          type="text"
                          placeholder="Luna Affection"
                          value={meter.name}
                          onChange={(e) =>
                            updateField(index, "name", e.target.value)
                          }
                          disabled={isSaving}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label
                          htmlFor={`meter-min-${index}`}
                          className="text-xs"
                        >
                          Min Value
                        </Label>
                        <Input
                          id={`meter-min-${index}`}
                          type="number"
                          value={meter.minValue}
                          onChange={(e) =>
                            updateField(
                              index,
                              "minValue",
                              parseInt(e.target.value) || 0
                            )
                          }
                          disabled={isSaving}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label
                          htmlFor={`meter-max-${index}`}
                          className="text-xs"
                        >
                          Max Value
                        </Label>
                        <Input
                          id={`meter-max-${index}`}
                          type="number"
                          value={meter.maxValue}
                          onChange={(e) =>
                            updateField(
                              index,
                              "maxValue",
                              parseInt(e.target.value) || 0
                            )
                          }
                          disabled={isSaving}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label
                        htmlFor={`meter-desc-${index}`}
                        className="text-xs"
                      >
                        Description
                      </Label>
                      <Input
                        id={`meter-desc-${index}`}
                        type="text"
                        placeholder="Tracks how much Luna trusts the player"
                        value={meter.description}
                        onChange={(e) =>
                          updateField(index, "description", e.target.value)
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
                        onClick={() => saveMeter(index)}
                        disabled={!isMeterValid(index) || isSaving}
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

          <Button
            type="button"
            variant="outline"
            onClick={addMeter}
            disabled={isSaving}
            className="w-full"
          >
            <Plus className="size-4 mr-2" />
            Add Another Meter
          </Button>
        </div>
      )}
    </div>
  );
}
