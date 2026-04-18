import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { Project } from "@/lib/api/projects";

interface ProjectDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
  onDelete: (projectId: string) => Promise<void>;
}

export function ProjectDeleteDialog({
  open,
  onOpenChange,
  project,
  onDelete,
}: ProjectDeleteDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    if (!project) return;

    setIsDeleting(true);
    try {
      await onDelete(project.id);
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to delete project:", err);
      throw err;
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
