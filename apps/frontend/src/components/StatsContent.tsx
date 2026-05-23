import { useState, useCallback, useEffect, useMemo } from "react";
import { Loader2, Plus, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineMessage } from "@/components/ui/inline-error";
import { useStats } from "@/hooks/useStats";
import { useToast } from "@/contexts/ToastContext";

interface StatsContentProps {
  projectId: string;
}

interface StatForm {
  id?: string;
  key: string;
  name: string;
  minValue: number;
  maxValue: number;
  description: string;
}

function validateStat(stat: StatForm): string | null {
  if (!stat.key.trim()) {
    return "Stat key is required";
  }
  if (!/^[a-z][a-z0-9_]*$/.test(stat.key)) {
    return "Key must start with a letter and contain only lowercase letters, numbers, and underscores";
  }
  if (stat.key.length > 100) {
    return "Key is too long (max 100 characters)";
  }
  if (!stat.name.trim()) {
    return "Name is required";
  }
  if (stat.name.length > 200) {
    return "Name is too long (max 200 characters)";
  }
  if (stat.minValue > stat.maxValue) {
    return "Minimum value must be less than or equal to maximum value";
  }
  return null;
}

export function StatsContent({ projectId }: StatsContentProps) {
  const {
    stats,
    isLoadingStats,
    statsError,
    isCreatingStat,
    isUpdatingStat,
    isDeletingStat,
    createStat,
    updateStat,
    deleteStat,
  } = useStats(projectId);
  const { error } = useToast();

  const [statsList, setStatsList] = useState<StatForm[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const isSaving = isCreatingStat || isUpdatingStat || isDeletingStat;

  useEffect(() => {
    if (isSaving) return;
    if (stats.length > 0) {
      setStatsList(
        stats.map((s) => ({
          id: s.id,
          key: s.key,
          name: s.name,
          minValue: s.minValue,
          maxValue: s.maxValue,
          description: s.description ?? "",
        }))
      );
    } else {
      setStatsList([]);
    }
  }, [stats, isSaving]);

  const addStat = useCallback(() => {
    const newIndex = statsList.length;
    setStatsList((prev) => [
      ...prev,
      { key: "", name: "", minValue: 0, maxValue: 100, description: "" },
    ]);
    setEditingIndex(newIndex);
  }, [statsList.length]);

  const updateField = useCallback(
    (index: number, field: keyof StatForm, value: string | number) => {
      setStatsList((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], [field]: value };
        return next;
      });
    },
    []
  );

  const removeStat = useCallback(
    async (index: number) => {
      const stat = statsList[index];
      if (stat.id) {
        try {
          await deleteStat(stat.id);
          setStatsList((prev) => prev.filter((_, i) => i !== index));
          if (editingIndex === index) setEditingIndex(null);
        } catch {
          // Error handled by hook toast
        }
      } else {
        setStatsList((prev) => prev.filter((_, i) => i !== index));
        if (editingIndex === index) setEditingIndex(null);
      }
    },
    [statsList, deleteStat, editingIndex]
  );

  const saveStat = useCallback(
    async (index: number) => {
      const stat = statsList[index];
      const validationError = validateStat(stat);
      if (validationError) {
        error(validationError);
        return;
      }

      try {
        if (stat.id) {
          await updateStat(stat.id, {
            name: stat.name,
            minValue: stat.minValue,
            maxValue: stat.maxValue,
            description: stat.description || undefined,
          });
        } else {
          await createStat({
            key: stat.key,
            name: stat.name,
            minValue: stat.minValue,
            maxValue: stat.maxValue,
            description: stat.description || undefined,
          });
        }
        setEditingIndex(null);
      } catch {
        // Error handled by hook toast
      }
    },
    [statsList, createStat, updateStat, error]
  );

  const cancelEdit = useCallback(
    (index: number) => {
      const stat = statsList[index];
      if (!stat) return;

      if (!stat.id) {
        setStatsList((prev) => prev.filter((_, i) => i !== index));
      } else {
        const original = stats.find((s) => s.id === stat.id);
        if (!original) {
          setStatsList((prev) => prev.filter((_, i) => i !== index));
          setEditingIndex(null);
          return;
        }
        setStatsList((prev) => {
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
    [statsList, stats]
  );

  const isStatValid = useMemo(() => {
    return (index: number) => validateStat(statsList[index]) === null;
  }, [statsList]);

  return (
    <div className="space-y-4">
      {isLoadingStats ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : statsError ? (
        <InlineMessage variant="error">Failed to load stats</InlineMessage>
      ) : statsList.length === 0 ? (
        <div className="p-6 border border-dashed border-border/30 rounded-md text-center">
          <p className="text-sm text-muted-foreground mb-4">
            No stats defined yet. Add your first stat to start tracking
            relationship stats and character attributes.
          </p>
          <Button type="button" variant="outline" onClick={addStat}>
            <Plus className="size-4 mr-2" />
            Add Stat
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {statsList.map((stat, index) => {
            const isEditing = editingIndex === index;
            const validationError = validateStat(stat);

            return (
              <div
                key={stat.id || `new-${index}`}
                className="border border-border/30 rounded-md p-4 space-y-3"
              >
                {!isEditing ? (
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium font-mono text-sm truncate">
                          {stat.key || "(unnamed)"}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground shrink-0">
                          {stat.minValue}&ndash;{stat.maxValue}
                        </span>
                      </div>
                      <p className="text-sm truncate">{stat.name}</p>
                      {stat.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {stat.description}
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
                        onClick={() => removeStat(index)}
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
                          htmlFor={`stat-key-${index}`}
                          className="text-xs"
                        >
                          Key *
                        </Label>
                        <Input
                          id={`stat-key-${index}`}
                          type="text"
                          placeholder="affection_luna"
                          value={stat.key}
                          onChange={(e) =>
                            updateField(index, "key", e.target.value)
                          }
                          disabled={isSaving || !!stat.id}
                        />
                        <p className="text-xs text-muted-foreground">
                          {stat.id
                            ? "Key cannot be changed after creation"
                            : "Unique identifier (lowercase, underscores)"}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <Label
                          htmlFor={`stat-name-${index}`}
                          className="text-xs"
                        >
                          Name *
                        </Label>
                        <Input
                          id={`stat-name-${index}`}
                          type="text"
                          placeholder="Luna Affection"
                          value={stat.name}
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
                          htmlFor={`stat-min-${index}`}
                          className="text-xs"
                        >
                          Min Value
                        </Label>
                        <Input
                          id={`stat-min-${index}`}
                          type="number"
                          value={stat.minValue}
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
                          htmlFor={`stat-max-${index}`}
                          className="text-xs"
                        >
                          Max Value
                        </Label>
                        <Input
                          id={`stat-max-${index}`}
                          type="number"
                          value={stat.maxValue}
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
                      <Label htmlFor={`stat-desc-${index}`} className="text-xs">
                        Description
                      </Label>
                      <Input
                        id={`stat-desc-${index}`}
                        type="text"
                        placeholder="Tracks how much Luna trusts the player"
                        value={stat.description}
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
                        onClick={() => saveStat(index)}
                        disabled={!isStatValid(index) || isSaving}
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
            onClick={addStat}
            disabled={isSaving}
            className="w-full"
          >
            <Plus className="size-4 mr-2" />
            Add Another Stat
          </Button>
        </div>
      )}
    </div>
  );
}
