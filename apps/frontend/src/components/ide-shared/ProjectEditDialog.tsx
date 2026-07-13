import { useState, useEffect, useRef, useReducer, type FormEvent } from "react";
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
import { FormErrorMessage } from "@/components/ui/form-error-message";
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

interface FormState {
  name: string;
  description: string;
  error: string | null;
}

type FormAction =
  | { type: "SET_NAME"; payload: string }
  | { type: "SET_DESCRIPTION"; payload: string }
  | { type: "SET_ERROR"; payload: string | null }
  | {
      type: "SET_ALL";
      payload: {
        name: string;
        description: string;
        error: string | null;
      };
    };

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case "SET_NAME":
      return { ...state, name: action.payload };
    case "SET_DESCRIPTION":
      return { ...state, description: action.payload };
    case "SET_ERROR":
      return { ...state, error: action.payload };
    case "SET_ALL":
      return { ...state, ...action.payload };
    default:
      return state;
  }
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
  const [formState, dispatch] = useReducer(formReducer, {
    name: "",
    description: "",
    error: null,
  });
  const [isSaving, setIsSaving] = useState(false);
  const previousOpenRef = useRef(false);
  const previousProjectIdRef = useRef<string | null>(null);

  const nameErrorId = "edit-project-name-error";

  useEffect(() => {
    // Detect when dialog opens (transition from false to true) or project changes
    // react-doctor-disable-next-line react-doctor/no-event-handler
    const projectId = project?.id ?? null;
    const isOpenOrProjectChanged =
      // react-doctor-disable-next-line react-doctor/no-event-handler
      (open && !previousOpenRef.current) ||
      (open && previousProjectIdRef.current !== projectId);

    if (isOpenOrProjectChanged && project) {
      dispatch({
        type: "SET_ALL",
        payload: {
          name: project.name,
          description: project.description ?? "",
          error: null,
        },
      });
      previousOpenRef.current = true;
      previousProjectIdRef.current = projectId;
    }
    // Reset open ref when dialog closes
    if (!open) {
      previousOpenRef.current = false;
      previousProjectIdRef.current = null;
    }
  }, [open, project]);

  const hasChanges =
    project &&
    (formState.name.trim() !== project.name ||
      formState.description.trim() !== (project.description ?? "").trim());

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!project || !isProjectOwner) {
      return;
    }

    const trimmedName = formState.name.trim();
    if (!trimmedName) {
      dispatch({ type: "SET_ERROR", payload: "Project name is required" });
      return;
    }

    dispatch({ type: "SET_ERROR", payload: null });
    setIsSaving(true);

    // Attempt to update project via API call
    try {
      const updatedProject = await onUpdate(project.id, {
        name: trimmedName,
        description: formState.description.trim() || "",
      });

      // Update local state with the server-returned values
      dispatch({
        type: "SET_ALL",
        payload: {
          name: updatedProject.name,
          description: updatedProject.description ?? "",
          error: null,
        },
      });
      // Trigger success callback (e.g., to refresh project list)
      onSuccess?.();
      // Close dialog on successful update
      onOpenChange(false);
    } catch (err) {
      // Extract user-friendly error message for display in the UI
      const message =
        err instanceof Error ? err.message : "Failed to update project";
      dispatch({ type: "SET_ERROR", payload: message });
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
        <DialogHeader className="flex flex-row items-center justify-between gap-y-0 pb-4">
          <DialogTitle>Edit Project</DialogTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          >
            <X className="size-5" />
          </Button>
        </DialogHeader>

        {!isProjectOwner ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">
            This project is read-only. Only the project owner can edit project
            details.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="edit-project-name">Project name *</Label>
              <Input
                id="edit-project-name"
                value={formState.name}
                onChange={(e) =>
                  dispatch({ type: "SET_NAME", payload: e.target.value })
                }
                disabled={isSaving}
                maxLength={200}
                aria-required="true"
                aria-invalid={formState.error ? true : undefined}
                aria-describedby={formState.error ? nameErrorId : undefined}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-project-description">Description</Label>
              <Textarea
                id="edit-project-description"
                value={formState.description}
                onChange={(e) =>
                  dispatch({ type: "SET_DESCRIPTION", payload: e.target.value })
                }
                disabled={isSaving}
                maxLength={2000}
                rows={4}
                className="resize-y"
              />
            </div>

            <FormErrorMessage
              id={nameErrorId}
              message={formState.error ?? undefined}
            />

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
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Saving…
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
