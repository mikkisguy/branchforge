import { useReducer, useState } from "react";
import {
  FileArchive,
  Edit,
  Trash2,
  Info,
  Download,
  History,
} from "lucide-react";
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

function isProjectOwner(project: Project): boolean {
  return project.visibility === "OWNER";
}

interface ProjectsSettingsContentProps {
  projects: Project[];
  onUpdateProject?: (
    projectId: string,
    body: UpdateProjectBody
  ) => Promise<Project>;
  onDeleteProject?: (projectId: string) => Promise<void>;
  onImportFromGitLab?: () => void;
  onImportZip?: () => void;
  onExportProject?: (projectId: string) => Promise<void>;
  onViewExportHistory?: (projectId: string, projectName: string) => void;
}

// One reducer per project being edited/deleted so a single "open edit
// for X" or "open delete for X" commit lands all related state at once
// (selected project + open flag). The per-row "currently exporting"
// spinner is unrelated and stays on its own useState.
type DialogState =
  | { kind: "idle" }
  | { kind: "edit"; project: Project }
  | { kind: "delete"; project: Project };

type DialogAction =
  | { type: "openEdit"; project: Project }
  | { type: "openDelete"; project: Project }
  | { type: "close" };

const dialogReducer = (
  _state: DialogState,
  action: DialogAction
): DialogState => {
  switch (action.type) {
    case "openEdit":
      return { kind: "edit", project: action.project };
    case "openDelete":
      return { kind: "delete", project: action.project };
    case "close":
      return { kind: "idle" };
  }
};

export function ProjectsSettingsContent({
  projects,
  onUpdateProject,
  onDeleteProject,
  onImportFromGitLab,
  onImportZip,
  onExportProject,
  onViewExportHistory,
}: ProjectsSettingsContentProps) {
  const [dialog, dispatchDialog] = useReducer(dialogReducer, { kind: "idle" });
  const [exportingProjectId, setExportingProjectId] = useState<string | null>(
    null
  );

  const { success: toastSuccess, error: toastError } = useToast();
  const { hasIntegration, isLoadingIntegration } = useGitLab();

  const handleEditClick = (project: Project) => {
    dispatchDialog({ type: "openEdit", project });
  };

  const handleDeleteClick = (project: Project) => {
    dispatchDialog({ type: "openDelete", project });
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

  const handleExportClick = async (project: Project) => {
    if (!onExportProject) return;
    setExportingProjectId(project.id);
    try {
      await onExportProject(project.id);
      toastSuccess(`Export started for "${project.name}"`);
    } catch (err) {
      toastError(
        err instanceof Error ? err.message : "Export failed",
        "Export Error"
      );
    } finally {
      setExportingProjectId(null);
    }
  };

  const handleViewHistory = (project: Project) => {
    onViewExportHistory?.(project.id, project.name);
  };

  // Empty state
  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="size-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <FileArchive className="size-8 text-muted-foreground" />
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
                type="button"
                onClick={onImportFromGitLab}
                disabled={!hasIntegration || isLoadingIntegration}
              >
                Import from GitLab
              </Button>
            )}
            {onImportZip && (
              <Button type="button" variant="outline" onClick={onImportZip}>
                <FileArchive className="size-4 mr-2" />
                Import ZIP
              </Button>
            )}
          </div>
          {!hasIntegration && !isLoadingIntegration && onImportFromGitLab && (
            <div className="flex items-start gap-2 max-w-md text-sm text-muted-foreground mt-2">
              <Info className="size-4 mt-0.5 flex-shrink-0" />
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
                type="button"
                size="sm"
                onClick={onImportFromGitLab}
                disabled={!hasIntegration || isLoadingIntegration}
              >
                Import from GitLab
              </Button>
            )}
            {onImportZip && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onImportZip}
              >
                <FileArchive className="size-4 mr-2" />
                Import ZIP
              </Button>
            )}
          </div>
          {!hasIntegration && !isLoadingIntegration && onImportFromGitLab && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground max-w-[300px]">
              <Info className="size-3 mt-0.5 flex-shrink-0" />
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
              <TableHead className="h-11 w-[11rem] whitespace-nowrap text-right">
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
                            className="size-3.5 text-muted-foreground/70 flex-shrink-0"
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
                <TableCell className="w-36 py-4 text-right">
                  <div className="flex justify-end gap-1">
                    {onExportProject && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={exportingProjectId === project.id}
                        onClick={() => handleExportClick(project)}
                        aria-label={`Export ${project.name}`}
                      >
                        <Download className="size-4" />
                      </Button>
                    )}
                    {onViewExportHistory && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewHistory(project)}
                        aria-label={`Export history for ${project.name}`}
                      >
                        <History className="size-4" />
                      </Button>
                    )}
                    {onUpdateProject && isProjectOwner(project) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditClick(project)}
                        aria-label={`Edit ${project.name}`}
                      >
                        <Edit className="size-4" />
                      </Button>
                    )}
                    {isProjectOwner(project) && onDeleteProject && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleDeleteClick(project)}
                        aria-label={`Delete ${project.name}`}
                      >
                        <Trash2 className="size-4" />
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
      {dialog.kind === "edit" && (
        <ProjectEditDialog
          open
          onOpenChange={(open) => {
            if (!open) dispatchDialog({ type: "close" });
          }}
          project={dialog.project}
          onUpdate={handleUpdateProject}
          isProjectOwner={isProjectOwner(dialog.project)}
          onSuccess={() => toastSuccess("Project updated successfully")}
          onError={(err) => toastError(err.message, "Update failed")}
        />
      )}

      {/* Delete dialog */}
      {dialog.kind === "delete" && onDeleteProject && (
        <ProjectDeleteDialog
          open
          onOpenChange={(open) => {
            if (!open) dispatchDialog({ type: "close" });
          }}
          project={dialog.project}
          onDelete={handleDeleteProject}
          onError={(err) => toastError(err.message)}
        />
      )}
    </div>
  );
}
