import { useEffect, useReducer, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Stat, Variable } from "@branchforge/shared";

interface LabelEditDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Called when dialog should close */
  onOpenChange: (open: boolean) => void;
  /** Current title of the label */
  currentTitle: string;
  /** Current label name (RPY identifier, null for UI-created labels) */
  currentLabelName: string | null;
  /** Current route key (null = shared/no route) */
  currentRoute: string | null;
  /** Current status */
  currentStatus: "DRAFT" | "REVIEW" | "FINAL" | null;
  /** Current visibility */
  currentVisibility: "EXCLUSIVE" | "SHARED" | "DUO_PAIR" | null;
  /** Current conditions from the active label */
  currentConditions: {
    stats?: Record<string, number>;
    variables?: string[];
  } | null;
  /** Available route configs from the project */
  routeConfigs: Array<{ id: string; routeKey: string; routeName: string }>;
  /** All project meters (for the stat dropdown) */
  meters: Stat[];
  /** All project variables (for the variable picker) */
  variables: Variable[];
  /** Called when save is clicked */
  onSave: (data: {
    title?: string;
    labelName?: string;
    route?: string | null;
    status?: "DRAFT" | "REVIEW" | "FINAL";
    visibility?: "EXCLUSIVE" | "SHARED" | "DUO_PAIR";
    conditions?: {
      stats?: Record<string, number>;
      variables?: string[];
    } | null;
  }) => Promise<void>;
  /** Whether save is in progress */
  isSaving: boolean;
  /** Callback to open the variables management modal */
  onOpenStateVariables: () => void;
  /** Callback to open the meters management modal */
  onOpenStats: () => void;
}

type FormState = {
  title: string;
  labelName: string;
  route: string;
  status: "DRAFT" | "REVIEW" | "FINAL";
  visibility: "EXCLUSIVE" | "SHARED" | "DUO_PAIR";
  titleError: string;
  labelNameError: string;
};

type FormAction =
  | {
      type: "RESET";
      title: string;
      labelName: string;
      route: string;
      status: "DRAFT" | "REVIEW" | "FINAL";
      visibility: "EXCLUSIVE" | "SHARED" | "DUO_PAIR";
    }
  | { type: "SET_TITLE"; value: string }
  | { type: "SET_LABEL_NAME"; value: string }
  | { type: "SET_ROUTE"; value: string }
  | { type: "SET_STATUS"; value: "DRAFT" | "REVIEW" | "FINAL" }
  | { type: "SET_VISIBILITY"; value: "EXCLUSIVE" | "SHARED" | "DUO_PAIR" }
  | { type: "SET_TITLE_ERROR"; value: string }
  | { type: "SET_LABEL_NAME_ERROR"; value: string };

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case "RESET":
      return {
        title: action.title,
        labelName: action.labelName,
        route: action.route,
        status: action.status,
        visibility: action.visibility,
        titleError: "",
        labelNameError: "",
      };
    case "SET_TITLE":
      return {
        ...state,
        title: action.value,
        titleError: action.value ? state.titleError : "",
      };
    case "SET_LABEL_NAME":
      return {
        ...state,
        labelName: action.value,
        labelNameError: action.value ? state.labelNameError : "",
      };
    case "SET_ROUTE":
      return { ...state, route: action.value };
    case "SET_STATUS":
      return { ...state, status: action.value };
    case "SET_VISIBILITY":
      return { ...state, visibility: action.value };
    case "SET_TITLE_ERROR":
      return { ...state, titleError: action.value };
    case "SET_LABEL_NAME_ERROR":
      return { ...state, labelNameError: action.value };
  }
}

export function LabelEditDialog({
  open,
  onOpenChange,
  currentTitle,
  currentLabelName,
  currentRoute,
  currentStatus,
  currentVisibility,
  currentConditions,
  routeConfigs,
  meters,
  variables,
  onSave,
  isSaving,
  onOpenStateVariables,
  onOpenStats,
}: LabelEditDialogProps) {
  const [form, dispatch] = useReducer(formReducer, {
    title: "",
    labelName: "",
    route: "",
    status: "DRAFT" as const,
    visibility: "EXCLUSIVE" as const,
    titleError: "",
    labelNameError: "",
  });

  // Conditions local state
  const [selectedVariables, setSelectedVariables] = useState<string[]>([]);
  const [statConditions, setStatConditions] = useState<Record<string, number>>(
    {}
  );
  const [showVariablePicker, setShowVariablePicker] = useState(false);
  const [showStatPicker, setShowStatPicker] = useState(false);

  // Reset form when dialog opens with new values
  useEffect(() => {
    if (open) {
      dispatch({
        type: "RESET",
        title: currentTitle,
        labelName: currentLabelName ?? "",
        route: currentRoute ?? "",
        status: currentStatus ?? "DRAFT",
        visibility: currentVisibility ?? "EXCLUSIVE",
      });
      setSelectedVariables(currentConditions?.variables ?? []);
      setStatConditions(currentConditions?.stats ?? {});
      setShowVariablePicker(false);
      setShowStatPicker(false);
    }
  }, [
    open,
    currentTitle,
    currentLabelName,
    currentRoute,
    currentStatus,
    currentVisibility,
    currentConditions,
  ]);

  // Derive available variables (not yet assigned)
  const availableVariables = variables.filter(
    (v) => !selectedVariables.includes(v.key)
  );

  // Derive available stats (not yet used as a condition)
  const availableStats = meters.filter((m) => !(m.key in statConditions));

  // Handlers for variables
  const handleAddVariable = (key: string) => {
    setSelectedVariables((prev) => [...prev, key]);
    setShowVariablePicker(false);
  };

  const handleRemoveVariable = (key: string) => {
    setSelectedVariables((prev) => prev.filter((k) => k !== key));
  };

  // Handlers for stat conditions
  const handleAddStat = (key: string) => {
    setStatConditions((prev) => ({ ...prev, [key]: 0 }));
    setShowStatPicker(false);
  };

  const handleRemoveStat = (key: string) => {
    setStatConditions((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleStatThresholdChange = (key: string, value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      setStatConditions((prev) => ({ ...prev, [key]: num }));
    }
  };

  const handleSave = async () => {
    // Validate title
    if (!form.title.trim()) {
      dispatch({ type: "SET_TITLE_ERROR", value: "Title is required" });
      return;
    }

    if (form.title.length > 255) {
      dispatch({
        type: "SET_TITLE_ERROR",
        value: "Title must be at most 255 characters",
      });
      return;
    }

    dispatch({ type: "SET_TITLE_ERROR", value: "" });

    const trimmedLabelName = form.labelName.trim();

    // Require a non-empty label name when the label is file-backed
    if (!trimmedLabelName && currentLabelName !== null) {
      dispatch({
        type: "SET_LABEL_NAME_ERROR",
        value: "Label name cannot be empty",
      });
      return;
    }

    // Validate label name if provided
    if (
      trimmedLabelName &&
      !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmedLabelName)
    ) {
      dispatch({
        type: "SET_LABEL_NAME_ERROR",
        value:
          "Label name must start with a letter or underscore and contain only letters, numbers, and underscores",
      });
      return;
    }

    dispatch({ type: "SET_LABEL_NAME_ERROR", value: "" });

    // Only include changed fields
    const changes: {
      title?: string;
      labelName?: string;
      route?: string | null;
      status?: "DRAFT" | "REVIEW" | "FINAL";
      visibility?: "EXCLUSIVE" | "SHARED" | "DUO_PAIR";
      conditions?: {
        stats?: Record<string, number>;
        variables?: string[];
      } | null;
    } = {};

    if (form.title.trim() !== currentTitle) {
      changes.title = form.title.trim();
    }

    if (trimmedLabelName && trimmedLabelName !== (currentLabelName ?? "")) {
      changes.labelName = trimmedLabelName;
    }

    const normalizedRoute = form.route || null;
    if (normalizedRoute !== currentRoute) {
      changes.route = normalizedRoute;
    }

    // Normalize null props to defaults for change detection, so filling
    // in a runtime default doesn't count as a user change.
    if (form.status !== (currentStatus ?? "DRAFT")) {
      changes.status = form.status;
    }

    if (form.visibility !== (currentVisibility ?? "EXCLUSIVE")) {
      changes.visibility = form.visibility;
    }

    // Check conditions changes
    const initialVars = currentConditions?.variables ?? [];
    const initialStats = currentConditions?.stats ?? {};
    const varsChanged =
      selectedVariables.length !== initialVars.length ||
      selectedVariables.some((key, i) => key !== initialVars[i]);
    const statsChanged =
      Object.keys(statConditions).length !== Object.keys(initialStats).length ||
      Object.entries(statConditions).some(
        ([key, val]) => initialStats[key] !== val
      );

    if (varsChanged || statsChanged) {
      changes.conditions = {
        variables: selectedVariables.length > 0 ? selectedVariables : undefined,
        stats:
          Object.keys(statConditions).length > 0 ? statConditions : undefined,
      };
      // If both are empty, send null to clear conditions
      if (
        selectedVariables.length === 0 &&
        Object.keys(statConditions).length === 0
      ) {
        changes.conditions = null;
      }
    }

    // Skip saving when no fields actually changed.
    if (Object.keys(changes).length === 0) {
      onOpenChange(false);
      return;
    }

    await onSave(changes);
  };

  // Resolve a stat key to its display name
  const getStatName = (key: string): string => {
    const stat = meters.find((m) => m.key === key);
    return stat?.name ?? key;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[560px] max-w-[95vw] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Label</DialogTitle>
          <DialogDescription>
            Update the label metadata and routing configuration.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Title Field */}
          <div className="space-y-1.5">
            <label
              htmlFor="label-title"
              className="text-sm font-medium text-foreground"
            >
              Title
            </label>
            <input
              id="label-title"
              type="text"
              value={form.title}
              onChange={(e) => {
                dispatch({ type: "SET_TITLE", value: e.target.value });
                if (form.titleError)
                  dispatch({ type: "SET_TITLE_ERROR", value: "" });
              }}
              disabled={isSaving}
              placeholder="Enter label title"
              maxLength={255}
              className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]/30 focus:border-[var(--theme-color)] disabled:opacity-50"
            />
            {form.titleError && (
              <p className="text-xs text-destructive mt-1">{form.titleError}</p>
            )}
          </div>

          {/* Label Name Field (only shown for file-backed labels) */}
          {currentLabelName !== null && (
            <div className="space-y-1.5">
              <label
                htmlFor="label-name"
                className="text-sm font-medium text-foreground"
              >
                Label Name
              </label>
              <input
                id="label-name"
                type="text"
                value={form.labelName}
                onChange={(e) => {
                  dispatch({ type: "SET_LABEL_NAME", value: e.target.value });
                  if (form.labelNameError)
                    dispatch({ type: "SET_LABEL_NAME_ERROR", value: "" });
                }}
                disabled={isSaving}
                placeholder={currentLabelName}
                className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background font-mono focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]/30 focus:border-[var(--theme-color)] disabled:opacity-50"
              />
              {form.labelNameError && (
                <p className="text-xs text-destructive mt-1">
                  {form.labelNameError}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Ren'Py label identifier. Changing this updates the label
                definition in the .rpy file.
              </p>
            </div>
          )}

          {/* Route, Status, Visibility Grid */}
          <div className="grid grid-cols-3 gap-3">
            {/* Route Field */}
            <div className="space-y-1.5">
              <label
                htmlFor="label-route"
                className="text-sm font-medium text-foreground"
              >
                Route
              </label>
              <select
                id="label-route"
                value={form.route}
                onChange={(e) =>
                  dispatch({ type: "SET_ROUTE", value: e.target.value })
                }
                disabled={isSaving}
                className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]/30 focus:border-[var(--theme-color)] disabled:opacity-50"
              >
                <option value="">No route (shared)</option>
                {routeConfigs.map((config) => (
                  <option key={config.id} value={config.routeKey}>
                    {config.routeName}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Field */}
            <div className="space-y-1.5">
              <label
                htmlFor="label-status"
                className="text-sm font-medium text-foreground"
              >
                Status
              </label>
              <select
                id="label-status"
                value={form.status}
                onChange={(e) =>
                  dispatch({
                    type: "SET_STATUS",
                    value: e.target.value as "DRAFT" | "REVIEW" | "FINAL",
                  })
                }
                disabled={isSaving}
                className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]/30 focus:border-[var(--theme-color)] disabled:opacity-50"
              >
                <option value="DRAFT">DRAFT</option>
                <option value="REVIEW">REVIEW</option>
                <option value="FINAL">FINAL</option>
              </select>
            </div>

            {/* Visibility Field */}
            <div className="space-y-1.5">
              <label
                htmlFor="label-visibility"
                className="text-sm font-medium text-foreground"
              >
                Visibility
              </label>
              <select
                id="label-visibility"
                value={form.visibility}
                onChange={(e) =>
                  dispatch({
                    type: "SET_VISIBILITY",
                    value: e.target.value as
                      | "EXCLUSIVE"
                      | "SHARED"
                      | "DUO_PAIR",
                  })
                }
                disabled={isSaving}
                className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]/30 focus:border-[var(--theme-color)] disabled:opacity-50"
              >
                <option value="EXCLUSIVE">EXCLUSIVE</option>
                <option value="SHARED">SHARED</option>
                <option value="DUO_PAIR">DUO_PAIR</option>
              </select>
            </div>
          </div>

          {/* ─── Conditions Section ─── */}
          <div className="space-y-3">
            {/* Section heading */}
            <h3 className="text-sm font-medium text-foreground">Conditions</h3>

            {/* Variables Sub-section — SettingsSection card pattern */}
            <section className="bg-card/40 overflow-hidden rounded-lg">
              <div className="flex items-center justify-between border-b border-border/30 px-4 py-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Variables
                </h4>
                <button
                  type="button"
                  onClick={onOpenStateVariables}
                  className="text-xs text-[var(--theme-color)] hover:underline"
                >
                  Manage
                </button>
              </div>
              <div className="p-4 space-y-3">
                {/* Assigned variable tags */}
                {selectedVariables.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedVariables.map((key) => (
                      <span
                        key={key}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-muted/80 border border-border/50 text-xs font-mono text-foreground"
                      >
                        {key}
                        <button
                          type="button"
                          onClick={() => handleRemoveVariable(key)}
                          disabled={isSaving}
                          className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                          aria-label={`Remove ${key}`}
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No variables assigned.
                  </p>
                )}

                {/* Add Variable picker */}
                {showVariablePicker ? (
                  <select
                    autoFocus
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAddVariable(e.target.value);
                      }
                    }}
                    onBlur={() => setShowVariablePicker(false)}
                    disabled={isSaving}
                    className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]/30 focus:border-[var(--theme-color)] disabled:opacity-50"
                  >
                    <option value="" disabled>
                      Select a variable…
                    </option>
                    {availableVariables.map((v) => (
                      <option key={v.id} value={v.key}>
                        {v.key}
                        {v.description ? ` — ${v.description}` : ""}
                      </option>
                    ))}
                  </select>
                ) : availableVariables.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowVariablePicker(true)}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 text-xs text-[var(--theme-color)] hover:underline disabled:opacity-50"
                  >
                    <Plus className="size-3" />
                    Add Variable
                  </button>
                ) : null}
              </div>
            </section>

            {/* Stats Sub-section — SettingsSection card pattern */}
            <section className="bg-card/40 overflow-hidden rounded-lg">
              <div className="flex items-center justify-between border-b border-border/30 px-4 py-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Stats
                </h4>
                <button
                  type="button"
                  onClick={onOpenStats}
                  className="text-xs text-[var(--theme-color)] hover:underline"
                >
                  Manage
                </button>
              </div>
              <div className="p-4 space-y-3">
                {/* Stat condition rows */}
                {Object.keys(statConditions).length > 0 ? (
                  <div className="space-y-2">
                    {Object.entries(statConditions).map(([key, threshold]) => (
                      <div key={key} className="flex items-center gap-2">
                        <span className="flex-1 px-3 py-2 rounded-md bg-muted/80 border border-border/50 text-xs font-mono text-foreground truncate">
                          {getStatName(key)}
                        </span>
                        <span className="text-xs text-muted-foreground font-medium select-none">
                          ≥
                        </span>
                        <input
                          type="number"
                          value={threshold}
                          onChange={(e) =>
                            handleStatThresholdChange(key, e.target.value)
                          }
                          disabled={isSaving}
                          className="w-24 px-2 py-2 border border-border rounded-md text-sm bg-background text-right focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]/30 focus:border-[var(--theme-color)] disabled:opacity-50"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveStat(key)}
                          disabled={isSaving}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
                          aria-label={`Remove ${getStatName(key)} condition`}
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No stat conditions assigned.
                  </p>
                )}

                {/* Add Stat picker */}
                {showStatPicker ? (
                  <select
                    autoFocus
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAddStat(e.target.value);
                      }
                    }}
                    onBlur={() => setShowStatPicker(false)}
                    disabled={isSaving}
                    className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]/30 focus:border-[var(--theme-color)] disabled:opacity-50"
                  >
                    <option value="" disabled>
                      Select a stat…
                    </option>
                    {availableStats.map((s) => (
                      <option key={s.id} value={s.key}>
                        {s.name} ({s.key})
                      </option>
                    ))}
                  </select>
                ) : availableStats.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowStatPicker(true)}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 text-xs text-[var(--theme-color)] hover:underline disabled:opacity-50"
                  >
                    <Plus className="size-3" />
                    Add Stat
                  </button>
                ) : null}
              </div>
            </section>
          </div>

          {/* Footer Buttons */}
          <div className="flex justify-end gap-2 mt-6">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button variant="default" onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
