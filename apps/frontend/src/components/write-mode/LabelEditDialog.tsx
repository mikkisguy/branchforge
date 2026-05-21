import { useEffect, useReducer } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
  /** Available route configs from the project */
  routeConfigs: Array<{ id: string; routeKey: string; routeName: string }>;
  /** Called when save is clicked */
  onSave: (data: {
    title?: string;
    labelName?: string;
    route?: string | null;
    status?: "DRAFT" | "REVIEW" | "FINAL";
    visibility?: "EXCLUSIVE" | "SHARED" | "DUO_PAIR";
  }) => Promise<void>;
  /** Whether save is in progress */
  isSaving: boolean;
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
  routeConfigs,
  onSave,
  isSaving,
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
    }
  }, [
    open,
    currentTitle,
    currentLabelName,
    currentRoute,
    currentStatus,
    currentVisibility,
  ]);

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

    // Validate label name if provided
    const trimmedLabelName = form.labelName.trim();
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

    // Skip saving when no fields actually changed.
    if (Object.keys(changes).length === 0) {
      onOpenChange(false);
      return;
    }

    await onSave(changes);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[500px] max-w-[95vw]">
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
