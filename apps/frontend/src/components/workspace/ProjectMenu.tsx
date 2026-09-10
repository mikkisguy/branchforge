import { Check, ChevronDown } from "lucide-react";
import type { Project } from "@/lib/api/projects";
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { cn } from "@/lib/utils";

function projectInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed[0]!.toUpperCase() : "?";
}

interface ProjectMenuProps {
  projectId?: string;
  projects: Project[];
  isLoadingProjects?: boolean;
  setCurrentProject: (project: Project | null) => void;
  onOpenProjectSettings: () => void;
  onImportGitLab: () => void;
  onImportZip: () => void;
  onManageProjects: () => void;
  triggerClassName?: string;
}

export function ProjectMenu({
  projectId,
  projects,
  isLoadingProjects,
  setCurrentProject,
  onOpenProjectSettings,
  onImportGitLab,
  onImportZip,
  onManageProjects,
  triggerClassName,
}: ProjectMenuProps) {
  const currentProject = projects.find((project) => project.id === projectId);
  const label = currentProject?.name ?? "Select project";

  return (
    <Menu>
      <MenuTrigger
        aria-label="Project menu"
        disabled={isLoadingProjects}
        className={cn(
          "flex items-center gap-1 max-w-[min(12rem,40vw)] truncate font-medium text-sm",
          triggerClassName
        )}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="size-4 flex-shrink-0" aria-hidden="true" />
      </MenuTrigger>
      <MenuContent align="start" className="min-w-[220px]">
        {projects.length > 0 ? (
          <>
            <MenuGroup label="Projects" showLabel>
              {projects.map((project) => {
                const isCurrent = project.id === projectId;
                return (
                  <MenuItem
                    key={project.id}
                    aria-checked={isCurrent}
                    onSelect={() => setCurrentProject(project)}
                    className="justify-between gap-2"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium leading-none text-muted-foreground"
                        aria-hidden="true"
                      >
                        {projectInitial(project.name)}
                      </span>
                      <span className="truncate">{project.name}</span>
                    </span>
                    {isCurrent ? (
                      <Check
                        className="size-4 flex-shrink-0"
                        aria-hidden="true"
                      />
                    ) : null}
                  </MenuItem>
                );
              })}
            </MenuGroup>
            <MenuSeparator />
          </>
        ) : null}
        <div className="text-muted-foreground">
          <MenuItem disabled={!projectId} onSelect={onOpenProjectSettings}>
            Project settings
          </MenuItem>
          <MenuItem onSelect={onImportGitLab}>Import from GitLab</MenuItem>
          <MenuItem onSelect={onImportZip}>Import ZIP</MenuItem>
          <MenuItem onSelect={onManageProjects}>Manage projects</MenuItem>
        </div>
      </MenuContent>
    </Menu>
  );
}
