/**
 * GitLab Project Link Dialog
 *
 * Dialog for linking a BranchForge project to a GitLab repository.
 * Allows users to select an existing project or create a new one,
 * then link it to a GitLab repository.
 */

import { useState, useCallback, useEffect } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { InlineMessage } from "@/components/ui/inline-error";
import { gitlabApi, type GitLabRepository } from "@/lib/api/gitlab";
import { useGitLab } from "@/hooks/useGitLab";
import { useProject } from "@/hooks/useProject";
import { useToast } from "@/contexts/ToastContext";
import { GitLabSyncDialog } from "@/components/script-mode/GitLabSyncDialog";

interface GitLabRepositoryLinkingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinkSuccess?: () => void;
}

interface LinkRepositoryRequest {
  projectId: string;
  gitlabProjectId: number;
  branch?: string;
}

// ============================================================================
// Component
// ============================================================================

export function GitLabRepositoryLinkingDialog({
  open,
  onOpenChange,
  onLinkSuccess,
}: GitLabRepositoryLinkingDialogProps) {
  const { listRepositories, refreshIntegration } = useGitLab();
  const { projects, isLoadingProjects, createProject } = useProject();
  const { success, error } = useToast();

  // Mode toggle: select existing vs create new
  const [isCreatingNewProject, setIsCreatingNewProject] = useState(false);

  // Form state
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedGitlabProject, setSelectedGitlabProject] =
    useState<GitLabRepository | null>(null);
  const [branch, setBranch] = useState("main");

  // New project form state
  const [newProjectName, setNewProjectName] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  // GitLab repositories state
  const [gitlabRepositories, setGitlabRepositories] = useState<
    GitLabRepository[]
  >([]);
  const [isLoadingGitlab, setIsLoadingGitlab] = useState(false);
  const [gitlabLoadError, setGitlabLoadError] = useState<string | null>(null);
  const [projectSearch, setProjectSearch] = useState("");

  // Link state
  const [isLinking, setIsLinking] = useState(false);

  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [linkedProjectId, setLinkedProjectId] = useState<string | null>(null);
  const [linkedProjectName, setLinkedProjectName] = useState<string | null>(
    null
  );

  /**
   * Load GitLab repositories
   */
  const loadGitlabRepositories = useCallback(async () => {
    setIsLoadingGitlab(true);
    setGitlabLoadError(null);
    try {
      const repositories = await listRepositories();
      setGitlabRepositories(repositories);
      setGitlabLoadError(null);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to load GitLab repositories";
      setGitlabLoadError(message);
      error(message);
    } finally {
      setIsLoadingGitlab(false);
    }
  }, [listRepositories, error]);

  // Load projects when dialog opens
  useEffect(() => {
    if (open && gitlabRepositories.length === 0 && !gitlabLoadError) {
      loadGitlabRepositories();
    }
  }, [
    open,
    gitlabRepositories.length,
    gitlabLoadError,
    loadGitlabRepositories,
  ]);

  /**
   * Reset form state
   */
  const reset = useCallback(() => {
    setIsCreatingNewProject(false);
    setSelectedProjectId("");
    setSelectedGitlabProject(null);
    setBranch("main");
    setProjectSearch("");
    setGitlabLoadError(null);
    setNewProjectName("");
    setShowSyncDialog(false);
    setLinkedProjectId(null);
    setLinkedProjectName(null);
  }, []);

  /**
   * Close dialog
   */
  const closeDialog = useCallback(() => {
    reset();
    onOpenChange(false);
  }, [reset, onOpenChange]);

  /**
   * Handle link project
   */
  const handleLink = useCallback(async () => {
    let projectId = selectedProjectId;

    // If creating a new project, validate and create it first
    if (isCreatingNewProject) {
      if (!newProjectName.trim()) {
        error("Please enter a project name");
        return;
      }
      if (!selectedGitlabProject) {
        error("Please select a GitLab repository");
        return;
      }
      if (!branch.trim()) {
        error("Please enter a branch name");
        return;
      }

      setIsCreatingProject(true);
      try {
        const newProject = await createProject(newProjectName.trim());
        projectId = newProject.id;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create project";
        error(message);
        return;
      } finally {
        setIsCreatingProject(false);
      }
    } else {
      // Selecting existing project
      if (!projectId) {
        error("Please select a BranchForge project");
        return;
      }
      if (!selectedGitlabProject) {
        error("Please select a GitLab repository");
        return;
      }
      if (!branch.trim()) {
        error("Please enter a branch name");
        return;
      }
    }

    setIsLinking(true);

    try {
      const request: LinkRepositoryRequest = {
        projectId,
        gitlabProjectId: selectedGitlabProject.id,
        branch: branch.trim(),
      };

      await gitlabApi.linkRepository(
        request.projectId,
        request.gitlabProjectId,
        request.branch
      );

      success(
        `Successfully linked "${selectedGitlabProject.name}" to your project`
      );

      // Get project name for the sync dialog
      const project = projects.find((p) => p.id === projectId);
      const projectName = isCreatingNewProject ? newProjectName : project?.name;

      // Log if project not found in projects array (stale data condition)
      if (!isCreatingNewProject && !project) {
        console.warn(
          `[GitLabRepositoryLinkingDialog] Linked project not found in projects array. projectId: ${projectId}. This may indicate stale data.`
        );
      }

      // Store the linked project info and open sync dialog directly
      setLinkedProjectId(projectId);
      setLinkedProjectName(projectName ?? "Unknown project");
      setShowSyncDialog(true);

      // Close the main dialog but keep the sync dialog open
      onLinkSuccess?.();
      await refreshIntegration();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to link repository";
      error(message);
    } finally {
      setIsLinking(false);
    }
  }, [
    selectedProjectId,
    selectedGitlabProject,
    branch,
    isCreatingNewProject,
    newProjectName,
    projects,
    onLinkSuccess,
    refreshIntegration,
    createProject,
    success,
    error,
  ]);

  /**
   * Filter GitLab repositories based on search
   */
  const filteredGitlabRepositories = gitlabRepositories.filter(
    (project) =>
      project.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
      project.path_with_namespace
        .toLowerCase()
        .includes(projectSearch.toLowerCase())
  );

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md w-full max-h-[90vh] p-0 gap-0 flex flex-col">
          {/* Header */}
          <div className="p-6 border-b border-border/30 flex items-start justify-between">
            <div>
              <h2 className="text-lg font-medium">Link GitLab Repository</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Connect your BranchForge project to a GitLab repository for
                sync.
              </p>
            </div>
            <button
              onClick={closeDialog}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* BranchForge Project Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>BranchForge Project</Label>
                <button
                  type="button"
                  onClick={() => setIsCreatingNewProject(!isCreatingNewProject)}
                  disabled={isLinking || isCreatingProject}
                  className="text-xs text-primary hover:underline disabled:opacity-50 disabled:no-underline"
                >
                  {isCreatingNewProject ? "Select existing" : "Create new"}
                </button>
              </div>

              {isCreatingNewProject ? (
                // Create new project form
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="new-project-name">Project Name</Label>
                    <Input
                      id="new-project-name"
                      type="text"
                      placeholder="My Visual Novel"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      disabled={isCreatingProject || isLinking}
                    />
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Create a new BranchForge project to link with GitLab.
                  </p>
                </div>
              ) : (
                // Select existing project dropdown
                <div className="space-y-2">
                  {projects.length === 0 && !isLoadingProjects ? (
                    <div className="p-3 border border-dashed border-border/30 rounded-md text-center">
                      <p className="text-sm text-muted-foreground">
                        No projects found. Create a new project to get started.
                      </p>
                    </div>
                  ) : (
                    <>
                      <select
                        id="-project"
                        value={selectedProjectId}
                        onChange={(e) => setSelectedProjectId(e.target.value)}
                        disabled={isLoadingProjects || isLinking}
                        className="w-full px-3 py-2 rounded-md border border-border/30 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                      >
                        <option value="">Select a project...</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-muted-foreground">
                        Select an existing BranchForge project to sync with
                        GitLab.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* GitLab Project Selection */}
            <div className="space-y-2">
              <Label htmlFor="gitlab-search">GitLab Repository</Label>
              <div className="relative">
                <Input
                  id="gitlab-search"
                  type="text"
                  placeholder="Search repositories..."
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  disabled={isLoadingGitlab || isLinking}
                />
                {isLoadingGitlab && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                )}
              </div>

              {/* GitLab Projects List */}
              <div className="border border-border/30 rounded-md max-h-48 overflow-y-auto">
                {isLoadingGitlab ? (
                  <div className="p-4 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : gitlabLoadError ? (
                  <div className="p-4 flex flex-col items-center gap-3 text-center">
                    <InlineMessage variant="error">
                      {gitlabLoadError}
                    </InlineMessage>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => loadGitlabRepositories()}
                      disabled={isLoadingGitlab}
                    >
                      {isLoadingGitlab ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : null}
                      Retry
                    </Button>
                  </div>
                ) : filteredGitlabRepositories.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    {projectSearch
                      ? "No matching repositories found"
                      : "No repositories available"}
                  </div>
                ) : (
                  <div className="divide-y divide-border/30">
                    {filteredGitlabRepositories.map((project) => (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => setSelectedGitlabProject(project)}
                        className={`w-full p-3 text-left hover:bg-muted/50 transition-colors ${
                          selectedGitlabProject?.id === project.id
                            ? "bg-muted"
                            : ""
                        }`}
                      >
                        <p className="text-sm font-medium">{project.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {project.path_with_namespace}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Branch Selection */}
            <div className="space-y-2">
              <Label htmlFor="branch">Branch</Label>
              <Input
                id="branch"
                type="text"
                placeholder="main"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                disabled={isLinking}
              />
              <p className="text-xs text-muted-foreground">
                The branch to sync with. Default is{" "}
                <code className="bg-muted px-1 py-0.5 rounded">main</code>.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-border/30 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={closeDialog}
              disabled={isLinking || isCreatingProject}
            >
              Cancel
            </Button>
            <Button
              onClick={handleLink}
              disabled={
                isCreatingNewProject
                  ? !newProjectName.trim() ||
                    !selectedGitlabProject ||
                    !branch.trim() ||
                    isCreatingProject ||
                    isLinking
                  : !selectedProjectId ||
                    !selectedGitlabProject ||
                    !branch.trim() ||
                    isLinking
              }
            >
              {(isCreatingProject || isLinking) && (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              )}
              {isCreatingNewProject ? "Create & Link" : "Link Repository"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sync Dialog */}
      {linkedProjectId && showSyncDialog && (
        <GitLabSyncDialog
          open
          onOpenChange={(open: boolean) => {
            setShowSyncDialog(open);
            if (!open) {
              closeDialog();
            }
          }}
          operationType="import"
          projectId={linkedProjectId}
          projectName={linkedProjectName ?? undefined}
          defaultBranch={branch}
        />
      )}
    </>
  );
}
