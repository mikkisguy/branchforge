import { useState, useEffect } from "react";
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
  const [title, setTitle] = useState("");
  const [labelName, setLabelName] = useState("");
  const [route, setRoute] = useState<string>("");
  const [status, setStatus] = useState<"DRAFT" | "REVIEW" | "FINAL">("DRAFT");
  const [visibility, setVisibility] = useState<
    "EXCLUSIVE" | "SHARED" | "DUO_PAIR"
  >("EXCLUSIVE");
  const [titleError, setTitleError] = useState("");
  const [labelNameError, setLabelNameError] = useState("");

  // Reset form when dialog opens with new values
  useEffect(() => {
    if (open) {
      setTitle(currentTitle);
      setLabelName(currentLabelName ?? "");
      setRoute(currentRoute ?? "");
      setStatus(currentStatus ?? "DRAFT");
      setVisibility(currentVisibility ?? "EXCLUSIVE");
      setTitleError("");
      setLabelNameError("");
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
    if (!title.trim()) {
      setTitleError("Title is required");
      return;
    }

    if (title.length > 255) {
      setTitleError("Title must be at most 255 characters");
      return;
    }

    setTitleError("");

    // Validate label name if provided
    const trimmedLabelName = labelName.trim();
    if (
      trimmedLabelName &&
      !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmedLabelName)
    ) {
      setLabelNameError(
        "Label name must start with a letter or underscore and contain only letters, numbers, and underscores"
      );
      return;
    }

    setLabelNameError("");

    // Only include changed fields
    const changes: {
      title?: string;
      labelName?: string;
      route?: string | null;
      status?: "DRAFT" | "REVIEW" | "FINAL";
      visibility?: "EXCLUSIVE" | "SHARED" | "DUO_PAIR";
    } = {};

    if (title.trim() !== currentTitle) {
      changes.title = title.trim();
    }

    if (trimmedLabelName && trimmedLabelName !== (currentLabelName ?? "")) {
      changes.labelName = trimmedLabelName;
    }

    const normalizedRoute = route || null;
    if (normalizedRoute !== currentRoute) {
      changes.route = normalizedRoute;
    }

    // Normalize null props to defaults for change detection, so filling
    // in a runtime default doesn't count as a user change.
    if (status !== (currentStatus ?? "DRAFT")) {
      changes.status = status;
    }

    if (visibility !== (currentVisibility ?? "EXCLUSIVE")) {
      changes.visibility = visibility;
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
            <label className="text-sm font-medium text-foreground">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (titleError) setTitleError("");
              }}
              disabled={isSaving}
              placeholder="Enter label title"
              maxLength={255}
              className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]/30 focus:border-[var(--theme-color)] disabled:opacity-50"
            />
            {titleError && (
              <p className="text-xs text-destructive mt-1">{titleError}</p>
            )}
          </div>

          {/* Label Name Field (only shown for file-backed labels) */}
          {currentLabelName !== null && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Label Name
              </label>
              <input
                type="text"
                value={labelName}
                onChange={(e) => {
                  setLabelName(e.target.value);
                  if (labelNameError) setLabelNameError("");
                }}
                disabled={isSaving}
                placeholder={currentLabelName}
                className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background font-mono focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]/30 focus:border-[var(--theme-color)] disabled:opacity-50"
              />
              {labelNameError && (
                <p className="text-xs text-destructive mt-1">
                  {labelNameError}
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
              <label className="text-sm font-medium text-foreground">
                Route
              </label>
              <select
                value={route}
                onChange={(e) => setRoute(e.target.value)}
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
              <label className="text-sm font-medium text-foreground">
                Status
              </label>
              <select
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as "DRAFT" | "REVIEW" | "FINAL")
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
              <label className="text-sm font-medium text-foreground">
                Visibility
              </label>
              <select
                value={visibility}
                onChange={(e) =>
                  setVisibility(
                    e.target.value as "EXCLUSIVE" | "SHARED" | "DUO_PAIR"
                  )
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
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
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
