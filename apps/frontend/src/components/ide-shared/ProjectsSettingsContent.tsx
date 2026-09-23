import { useReducer, useState } from "react";
import {
  FileArchive,
  Edit,
  Trash2,
  Info,
  Download,
  History,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate } from "@/lib/utils";
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

function ProjectTitle({ project }: { project: Project }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-start gap-1.5">
        <p className="line-clamp-2 min-w-0 break-words font-medium text-base leading-snug">
          {project.name}
        </p>
        {project.description ? (
          <Tooltip
            side="top"
            content={project.description}
            className="max-w-md"
          >
            <button
              type="button"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-sm text-muted-foreground/70 focus-ring md:size-6"
              aria-label={`About ${project.name}`}
            >
              <Info className="size-3.5" aria-hidden="true" />
            </button>
          </Tooltip>
        ) : null}
      </div>
      {project.description ? (
        <span className="sr-only">{project.description}</span>
      ) : null}
    </div>
  );
}

function gitlabPathFromUrl(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\/+/, ""));
  } catch {
    return url;
  }
}

function GitlabProjectLink({
  url,
  className,
}: {
  url: string;
  className?: string;
}) {
  const path = gitlabPathFromUrl(url);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${path} on GitLab`}
      className={cn(
        "flex min-w-0 max-w-full items-center gap-1.5 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-ring",
        className
      )}
    >
      <span className="truncate">{path}</span>
      <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
    </a>
  );
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
        <div className="flex w-full flex-col items-center gap-3">
          <div className="flex w-full max-w-md flex-col gap-3 min-[540px]:w-auto min-[540px]:max-w-none min-[540px]:flex-row">
            {onImportFromGitLab && (
              <Button
                type="button"
                className="w-full min-[540px]:w-auto"
                onClick={onImportFromGitLab}
                disabled={!hasIntegration || isLoadingIntegration}
              >
                Import from GitLab
              </Button>
            )}
            {onImportZip && (
              <Button
                type="button"
                variant="outline"
                className="w-full min-[540px]:w-auto"
                onClick={onImportZip}
              >
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

      {/* Projects table. Below 540px the same rows stack as cards. */}
      <div className="overflow-hidden rounded-lg border border-border/60 bg-card">
        <Table className="max-[539px]:block min-[540px]:table-fixed">
          <TableHeader className="max-[539px]:hidden">
            <TableRow className="bg-muted/20 hover:bg-muted/20">
              <TableHead className="h-11 min-w-0">Project</TableHead>
              <TableHead className="h-11 w-[8.5rem] whitespace-nowrap">
                Updated
              </TableHead>
              <TableHead className="h-11 w-[12.5rem] whitespace-nowrap text-right">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="max-[539px]:block">
            {projects.map((project) => (
              <TableRow
                key={project.id}
                className="align-top hover:bg-muted/35 max-[539px]:block"
              >
                <TableCell className="min-w-0 py-4 align-top max-[539px]:block max-[539px]:px-4 max-[539px]:pb-2 max-[539px]:pt-4">
                  <div className="flex min-w-0 flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <ProjectTitle project={project} />
                      <Badge
                        className="w-fit shrink-0 min-[540px]:hidden"
                        variant={
                          project.source === "GITLAB" ? "default" : "secondary"
                        }
                      >
                        {project.source === "GITLAB" ? "GitLab" : "ZIP"}
                      </Badge>
                    </div>
                    <Badge
                      className="hidden w-fit min-[540px]:inline-flex"
                      variant={
                        project.source === "GITLAB" ? "default" : "secondary"
                      }
                    >
                      {project.source === "GITLAB" ? "GitLab" : "ZIP"}
                    </Badge>
                    {project.gitlabWebUrl ? (
                      <GitlabProjectLink
                        url={project.gitlabWebUrl}
                        className="w-full"
                      />
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="py-4 align-top text-sm text-muted-foreground max-[539px]:block max-[539px]:px-4 max-[539px]:py-0 min-[540px]:w-[8.5rem] min-[540px]:whitespace-nowrap">
                  <span className="min-[540px]:sr-only">Updated</span>{" "}
                  {formatDate(project.updatedAt)}
                </TableCell>
                <TableCell className="py-4 align-top max-[539px]:block max-[539px]:px-4 max-[539px]:pb-4 max-[539px]:pt-3 min-[540px]:w-[12.5rem] min-[540px]:whitespace-nowrap min-[540px]:text-right">
                  <div className="flex flex-nowrap gap-1 min-[540px]:justify-end">
                    {onExportProject && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={exportingProjectId === project.id}
                        onClick={() => handleExportClick(project)}
                        aria-label={`Export ${project.name}`}
                      >
                        <Download />
                      </Button>
                    )}
                    {onViewExportHistory && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleViewHistory(project)}
                        aria-label={`Export history for ${project.name}`}
                      >
                        <History />
                      </Button>
                    )}
                    {onUpdateProject && isProjectOwner(project) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditClick(project)}
                        aria-label={`Edit ${project.name}`}
                      >
                        <Edit />
                      </Button>
                    )}
                    {isProjectOwner(project) && onDeleteProject && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleDeleteClick(project)}
                        aria-label={`Delete ${project.name}`}
                      >
                        <Trash2 />
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
