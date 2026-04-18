import { useState, useMemo, useEffect, type FormEvent } from "react";
import { Loader2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useSettings } from "@/hooks/useSettings";
import { GitLabSettingsContent } from "@/components/ide-shared/GitLabSettingsContent";
import { ProjectDeleteDialog } from "@/components/ProjectDeleteDialog";
import {
  SettingsRow,
  SettingsSection,
} from "@/components/ide-shared/SettingsLayout";
import { WritingGoalSettings } from "@/components/write-mode/WritingGoalSettings";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/api/projects";
import { useToast } from "@/contexts/ToastContext";
import { APP_NAME, APP_VERSION } from "@/lib/version";

type Tab = "user" | "project" | "gitlab" | "system";

interface TabOption {
  id: Tab;
  label: string;
}

const tabs: TabOption[] = [
  { id: "user", label: "User" },
  { id: "project", label: "Project" },
  { id: "gitlab", label: "GitLab" },
  { id: "system", label: "System Admin" },
];

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  project: Project | null;
  onUpdateProject?: (
    projectId: string,
    body: { name?: string; description?: string }
  ) => Promise<Project>;
  onDeleteProject?: (projectId: string) => Promise<void>;
  onSelectProject?: (project: Project | null) => void;
}

export function SettingsModal({
  open,
  onOpenChange,
  projects,
  project,
  onUpdateProject,
  onDeleteProject,
  onSelectProject,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>("user");
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectError, setProjectError] = useState<string | null>(null);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [isProjectDeleteOpen, setIsProjectDeleteOpen] = useState(false);

  const { user } = useAuth();
  const { success, error } = useToast();
  const {
    signUpsEnabled,
    updateSignUpsSetting,
    isLoading: settingsLoading,
    isSaving,
  } = useSettings();

  // Compute visible tabs and ensure valid active tab
  // Only users with OWNER role can see the System Admin tab.
  const { visibleTabs, adjustedActiveTab } = useMemo(() => {
    const visibleTabs = tabs.filter(
      (tab) => tab.id !== "system" || user?.role === "OWNER"
    );

    // If current active tab is not visible, switch to first visible tab
    const adjustedActiveTab = visibleTabs.find((t) => t.id === activeTab)
      ? activeTab
      : visibleTabs[0]?.id || activeTab;

    return { visibleTabs, adjustedActiveTab };
  }, [activeTab, user?.role]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setProjectName(project?.name ?? "");
    setProjectDescription(project?.description ?? "");
    setProjectError(null);
  }, [open, project?.description, project?.id, project?.name]);

  const isProjectOwner = project?.visibility === "OWNER";

  const hasProjectChanges = useMemo(() => {
    if (!project) {
      return false;
    }

    const initialName = project.name.trim();
    const initialDescription = (project.description ?? "").trim();

    return (
      projectName.trim() !== initialName ||
      projectDescription.trim() !== initialDescription
    );
  }, [project, projectDescription, projectName]);

  const handleSaveProject = async (event: FormEvent) => {
    event.preventDefault();

    if (!project || !onUpdateProject) {
      return;
    }

    const trimmedName = projectName.trim();
    const trimmedDescription = projectDescription.trim();

    if (!trimmedName) {
      setProjectError("Project name is required");
      return;
    }

    setProjectError(null);
    setIsSavingProject(true);

    try {
      const updatedProject = await onUpdateProject(project.id, {
        name: trimmedName,
        description: trimmedDescription,
      });
      setProjectName(updatedProject.name);
      setProjectDescription(updatedProject.description ?? "");
      success("Project updated successfully");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update project";
      setProjectError(message);
      error(message, "Update failed");
    } finally {
      setIsSavingProject(false);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!onDeleteProject) {
      return;
    }

    try {
      await onDeleteProject(projectId);
      success("Project deleted successfully");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete project";
      error(message, "Delete failed");
      throw err;
    }
  };

  const handleProjectSelectionChange = (projectId: string) => {
    if (!onSelectProject) {
      return;
    }

    const selectedProject =
      projects.find((candidateProject) => candidateProject.id === projectId) ??
      null;
    onSelectProject(selectedProject);
  };

  // Sync derived state during render: adjustedActiveTab is computed from visibleTabs,
  // activeTab, and user?.role. If the active tab becomes invalid (e.g., user loses OWNER
  // role), we must sync immediately to avoid a flash/stale UI that useEffect would cause.
  // The condition (adjustedActiveTab !== activeTab) becomes false after setActiveTab
  // updates state, preventing render loops.
  if (adjustedActiveTab !== activeTab) {
    setActiveTab(adjustedActiveTab);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[700px] max-w-[95vw] p-0 gap-0">
        <DialogHeader className="p-6 pb-4 flex-row items-center justify-between border-b border-border/30">
          <DialogTitle>Settings</DialogTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            aria-label="Close settings"
          >
            <X className="w-5 h-5" />
          </Button>
        </DialogHeader>

        <div className="flex h-[650px]">
          {/* Vertical Tabs */}
          <div className="w-48 border-r border-border/30 p-2 flex flex-col">
            <div className="space-y-1">
              {visibleTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    activeTab === tab.id
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Version */}
            <div className="mt-auto pt-4 px-3">
              <p className="text-xs text-muted-foreground">
                {APP_NAME} v{APP_VERSION}
              </p>
            </div>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === "user" && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium">User Settings</h3>

                <SettingsSection title="Account">
                  <SettingsRow
                    label="Email address"
                    description="Used for sign in and account identification"
                  >
                    <p className="max-w-[22rem] break-all rounded-md border border-border/50 bg-background/80 px-3 py-2 text-xs font-mono">
                      {user?.email || "Not available"}
                    </p>
                  </SettingsRow>
                </SettingsSection>

                <SettingsSection title="Writing Goals">
                  <WritingGoalSettings />
                </SettingsSection>
              </div>
            )}

            {activeTab === "project" && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium">
                  Project Settings
                  {project ? ` for ${project.name}` : ""}
                </h3>

                <SettingsSection title="Context">
                  {projects.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No projects available yet.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="settings-active-project">
                        Active project
                      </Label>
                      <select
                        id="settings-active-project"
                        value={project?.id ?? ""}
                        onChange={(e) =>
                          handleProjectSelectionChange(e.target.value)
                        }
                        disabled={!onSelectProject}
                        className="flex h-9 w-full rounded-md border border-border/30 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:border-[var(--theme-color)]/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--theme-color)]/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="" disabled>
                          Select a project
                        </option>
                        {projects.map((availableProject) => (
                          <option
                            key={availableProject.id}
                            value={availableProject.id}
                          >
                            {availableProject.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-muted-foreground">
                        Changes below apply to the selected project.
                      </p>
                    </div>
                  )}
                </SettingsSection>

                {!project ? (
                  <div className="rounded-md border border-border/30 bg-muted/20 p-4 text-sm text-muted-foreground">
                    Select a project to manage its details and deletion
                    settings.
                  </div>
                ) : (
                  <>
                    <SettingsSection title="Details">
                      {!isProjectOwner && (
                        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">
                          This project is read-only. Only the project owner can
                          edit project details.
                        </div>
                      )}
                      <form onSubmit={handleSaveProject} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="settings-project-name">
                            Project name
                          </Label>
                          <Input
                            id="settings-project-name"
                            value={projectName}
                            onChange={(e) => setProjectName(e.target.value)}
                            disabled={
                              !onUpdateProject ||
                              isSavingProject ||
                              !isProjectOwner
                            }
                            maxLength={200}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="settings-project-description">
                            Description
                          </Label>
                          <Textarea
                            id="settings-project-description"
                            value={projectDescription}
                            onChange={(e) =>
                              setProjectDescription(e.target.value)
                            }
                            disabled={
                              !onUpdateProject ||
                              isSavingProject ||
                              !isProjectOwner
                            }
                            maxLength={2000}
                            rows={4}
                            className="resize-y"
                          />
                        </div>

                        {projectError ? (
                          <p className="text-sm text-destructive">
                            {projectError}
                          </p>
                        ) : null}

                        <div className="flex justify-end">
                          <Button
                            type="submit"
                            disabled={
                              !onUpdateProject ||
                              isSavingProject ||
                              !hasProjectChanges ||
                              !isProjectOwner
                            }
                          >
                            {isSavingProject ? (
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
                    </SettingsSection>

                    {isProjectOwner && (
                      <SettingsSection title="Danger Zone">
                        <SettingsRow
                          label="Delete project"
                          description="Permanently deletes this project and all related data."
                        >
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setIsProjectDeleteOpen(true)}
                            disabled={
                              !onDeleteProject ||
                              isSavingProject ||
                              !isProjectOwner
                            }
                          >
                            Delete Project
                          </Button>
                        </SettingsRow>
                      </SettingsSection>
                    )}
                  </>
                )}
              </div>
            )}

            {activeTab === "gitlab" && <GitLabSettingsContent />}

            {activeTab === "system" && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium">System Administration</h3>

                <SettingsSection title="User Registration">
                  <SettingsRow
                    label="Sign ups enabled"
                    description="Allow new users to register"
                  >
                    <Switch
                      checked={signUpsEnabled}
                      onCheckedChange={updateSignUpsSetting}
                      disabled={settingsLoading || isSaving}
                    />
                  </SettingsRow>
                </SettingsSection>
              </div>
            )}
          </div>
        </div>
      </DialogContent>

      {onDeleteProject ? (
        <ProjectDeleteDialog
          open={isProjectDeleteOpen}
          onOpenChange={setIsProjectDeleteOpen}
          project={project}
          onDelete={handleDeleteProject}
        />
      ) : null}
    </Dialog>
  );
}
