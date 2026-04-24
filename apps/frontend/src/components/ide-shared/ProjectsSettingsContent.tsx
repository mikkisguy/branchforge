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
import { Tooltip } from "@/components/ui/tooltip";
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-medium">Projects</h3>
          <p className="text-sm text-muted-foreground">
            Manage your visual novel projects
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <div className="flex flex-wrap gap-2 sm:justify-end">
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
            <div className="flex items-start gap-2 text-xs text-muted-foreground max-w-[300px]">
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
      <div className="overflow-hidden rounded-lg border border-border/60 bg-card">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="bg-muted/20 hover:bg-muted/20">
              <TableHead className="h-11">Project</TableHead>
              <TableHead className="h-11 w-[9rem] whitespace-nowrap">
                Updated
              </TableHead>
              <TableHead className="h-11 w-24 whitespace-nowrap text-right">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((project) => (
              <TableRow
                key={project.id}
                className="align-top hover:bg-muted/35"
              >
                <TableCell className="py-4">
                  <div className="space-y-3">
                    {project.description ? (
                      <Tooltip
                        side="top"
                        content={project.description}
                        className="max-w-md"
                        triggerClassName="block w-full group cursor-help"
                      >
                        <div className="inline-flex items-center gap-1.5 flex-wrap">
                          <span className="break-words font-medium text-base leading-snug">
                            {project.name}
                          </span>
                          <Info
                            className="w-3.5 h-3.5 text-muted-foreground/70 flex-shrink-0"
                            aria-hidden="true"
                          />
                          <span className="sr-only">{project.description}</span>
                        </div>
                      </Tooltip>
                    ) : (
                      <span className="block w-full break-words font-medium text-base leading-snug">
                        {project.name}
                      </span>
                    )}
                    <Badge
                      className="w-fit"
                      variant={
                        project.source === "GITLAB" ? "default" : "secondary"
                      }
                    >
                      {project.source === "GITLAB" ? "GitLab" : "ZIP"}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap py-4 text-sm text-muted-foreground">
                  {formatDate(project.updatedAt)}
                </TableCell>
                <TableCell className="w-24 py-4 text-right">
                  <div className="flex justify-end gap-1">
                    {onUpdateProject && isProjectOwner(project) && (
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
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
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
