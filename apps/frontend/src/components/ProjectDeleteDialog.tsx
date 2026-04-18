import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { Project } from "@/lib/api/projects";

interface ProjectDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
  onDelete: (projectId: string) => Promise<void>;
  onError?: (error: Error) => void;
}

export function ProjectDeleteDialog({
  open,
  onOpenChange,
  project,
  onDelete,
  onError,
}: ProjectDeleteDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    if (!project) return;

    setIsDeleting(true);
    try {
      await onDelete(project.id);
      onOpenChange(false);
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error("Failed to delete project");
      if (onError) {
        onError(error);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (isDeleting && !newOpen) {
      return;
    }
    onOpenChange(newOpen);
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      onConfirm={handleConfirm}
      title="Delete Project"
      description={`Are you sure you want to delete ${project?.name ?? "this project"}? This action cannot be undone. All project data including labels, routes, characters, and visual systems will be permanently deleted.`}
      cancelLabel="Cancel"
      confirmLabel="Delete Project"
      isLoading={isDeleting}
      loadingLabel="Deleting..."
    />
  );
}
