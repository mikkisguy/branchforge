import { useState } from "react";
import { FileArchive, Edit, Trash2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProjectEditDialog } from "@/components/ide-shared/ProjectEditDialog";
import { ProjectDeleteDialog } from "@/components/ProjectDeleteDialog";
import { useToast } from "@/contexts/ToastContext";
import { useGitLab } from "@/hooks/useGitLab";
import type { Project, UpdateProjectBody } from "@/lib/api/projects";

interface ProjectsSettingsContentProps {
  projects: Project[];
  onUpdateProject?: (
    projectId: string,
    body: UpdateProjectBody
  ) => Promise<Project>;
  onDeleteProject?: (projectId: string) => Promise<void>;
  onImportFromGitLab?: () => void;
  onImportZip?: () => void;
}

export function ProjectsSettingsContent({
  projects,
  onUpdateProject,
  onDeleteProject,
  onImportFromGitLab,
  onImportZip,
}: ProjectsSettingsContentProps) {
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const { success: toastSuccess, error: toastError } = useToast();
  const { hasIntegration, isLoadingIntegration } = useGitLab();

  const handleEditClick = (project: Project) => {
    setEditingProject(project);
    setIsEditOpen(true);
  };

  const handleDeleteClick = (project: Project) => {
    setDeletingProject(project);
    setIsDeleteOpen(true);
  };

  const handleUpdateProject = async (
    projectId: string,
    body: UpdateProjectBody
  ): Promise<Project> => {
    if (!onUpdateProject) {
      throw new Error("Update project handler not provided");
    }
    return onUpdateProject(projectId, body);
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!onDeleteProject) {
      throw new Error("Delete project handler not provided");
    }
    return onDeleteProject(projectId);
  };

  const isProjectOwner = (project: Project) => {
    return project.visibility === "OWNER";
  };

  // Empty state
  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <FileArchive className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">No projects yet</h3>
        <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
          Get started by importing a project from GitLab or uploading a ZIP file
          containing your Ren'Py scripts.
        </p>
        <div className="flex gap-3 flex-col items-center">
          <div className="flex gap-3">
            {onImportFromGitLab && (
              <Button
                onClick={onImportFromGitLab}
                disabled={!hasIntegration || isLoadingIntegration}
              >
                Import from GitLab
              </Button>
            )}
            {onImportZip && (
              <Button variant="outline" onClick={onImportZip}>
                <FileArchive className="w-4 h-4 mr-2" />
                Import ZIP
              </Button>
            )}
          </div>
          {!hasIntegration && !isLoadingIntegration && onImportFromGitLab && (
            <div className="flex items-start gap-2 max-w-md text-sm text-muted-foreground mt-2">
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p>
                GitLab import requires{" "}
                <span className="font-medium">GitLab integration</span> to be
                configured first. Go to Settings → Integrations to set it up.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with import actions */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Projects</h3>
          <p className="text-sm text-muted-foreground">
            Manage your visual novel projects
          </p>
        </div>
        <div className="flex gap-2 flex-col items-end">
          <div className="flex gap-2">
            {onImportFromGitLab && (
              <Button
                size="sm"
                onClick={onImportFromGitLab}
                disabled={!hasIntegration || isLoadingIntegration}
              >
                Import from GitLab
              </Button>
            )}
            {onImportZip && (
              <Button size="sm" variant="outline" onClick={onImportZip}>
                <FileArchive className="w-4 h-4 mr-2" />
                Import ZIP
              </Button>
            )}
          </div>
          {!hasIntegration && !isLoadingIntegration && onImportFromGitLab && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground mt-1 max-w-[300px]">
              <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <p>
                Configure GitLab integration in{" "}
                <span className="font-medium">Integrations</span> tab first
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Projects table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((project) => (
              <TableRow key={project.id}>
                <TableCell className="font-medium">{project.name}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      project.source === "GITLAB" ? "default" : "secondary"
                    }
                  >
                    {project.source === "GITLAB" ? (
                      "GitLab"
                    ) : (
                      <>
                        <FileArchive className="w-3 h-3 mr-1" />
                        ZIP
                      </>
                    )}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                  {project.description || "-"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(project.updatedAt)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {onUpdateProject && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditClick(project)}
                        aria-label={`Edit ${project.name}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    )}
                    {isProjectOwner(project) && onDeleteProject && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteClick(project)}
                        aria-label={`Delete ${project.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Edit dialog */}
      {editingProject && (
        <ProjectEditDialog
          open={isEditOpen}
          onOpenChange={setIsEditOpen}
          project={editingProject}
          onUpdate={handleUpdateProject}
          isProjectOwner={isProjectOwner(editingProject)}
          onSuccess={() => toastSuccess("Project updated successfully")}
          onError={(err) => toastError(err.message, "Update failed")}
        />
      )}

      {/* Delete dialog */}
      {deletingProject && onDeleteProject && (
        <ProjectDeleteDialog
          open={isDeleteOpen}
          onOpenChange={setIsDeleteOpen}
          project={deletingProject}
          onDelete={handleDeleteProject}
          onError={(err) => toastError(err.message)}
        />
      )}
    </div>
  );
}
