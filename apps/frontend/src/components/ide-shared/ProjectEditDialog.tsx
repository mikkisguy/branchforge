import { useState, useEffect, useRef, type FormEvent } from "react";
import { Loader2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Project, UpdateProjectBody } from "@/lib/api/projects";

interface ProjectEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
  onUpdate: (projectId: string, body: UpdateProjectBody) => Promise<Project>;
  isProjectOwner: boolean;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export function ProjectEditDialog({
  open,
  onOpenChange,
  project,
  onUpdate,
  isProjectOwner,
  onSuccess,
  onError,
}: ProjectEditDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const previousOpenRef = useRef(false);

  useEffect(() => {
    // Detect when dialog opens (transition from false to true)
    if (open && !previousOpenRef.current && project) {
      setName(project.name);
      setDescription(project.description ?? "");
      setError(null);
      previousOpenRef.current = true;
    }
    // Reset open ref when dialog closes
    if (!open) {
      previousOpenRef.current = false;
    }
  }, [open, project]);

  const hasChanges =
    project &&
    (name.trim() !== project.name.trim() ||
      description.trim() !== (project.description ?? "").trim());

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!project || !isProjectOwner) {
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Project name is required");
      return;
    }

    setError(null);
    setIsSaving(true);

    // Attempt to update project via API call
    try {
      const updatedProject = await onUpdate(project.id, {
        name: trimmedName,
        description: description.trim() || "",
      });

      // Update local state with the server-returned values
      setName(updatedProject.name);
      setDescription(updatedProject.description ?? "");
      // Trigger success callback (e.g., to refresh project list)
      onSuccess?.();
      // Close dialog on successful update
      onOpenChange(false);
    } catch (err) {
      // Extract user-friendly error message for display in the UI
      const message =
        err instanceof Error ? err.message : "Failed to update project";
      setError(message);
      // Ensure we always pass an Error object to the error callback
      const errorToReport =
        err instanceof Error ? err : new Error("Failed to update project");
      if (onError) {
        onError(errorToReport);
      }
    } finally {
      // Always clear loading state, whether update succeeded or failed
      setIsSaving(false);
    }
  };

  if (!project) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[500px] max-w-[95vw]">
        <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <DialogTitle>Edit Project</DialogTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </Button>
        </DialogHeader>

        {!isProjectOwner ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">
            This project is read-only. Only the project owner can edit project
            details.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-project-name">Project name</Label>
              <Input
                id="edit-project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isSaving}
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-project-description">Description</Label>
              <Textarea
                id="edit-project-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isSaving}
                maxLength={2000}
                rows={4}
                className="resize-y"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving || !hasChanges}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
