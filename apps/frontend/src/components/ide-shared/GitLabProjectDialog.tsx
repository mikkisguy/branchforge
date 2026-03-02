/**
 * GitLab Project Link Dialog
 *
 * Dialog for linking a BranchForge project to a GitLab repository.
 * Allows users to select a local project and a GitLab repository to link.
 */

import { useState, useCallback, useEffect } from 'react';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { gitlabApi, type GitLabProject } from '@/lib/api/gitlab';
import { useGitLab } from '@/contexts/GitLabContext';
import { useToast } from '@/contexts/ToastContext';

// ============================================================================
// Types
// ============================================================================

interface BranchForgeProject {
  id: string;
  name: string;
}

interface GitLabProjectDialogProps {
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
// Mock Data (TODO: Replace with real API)
// ============================================================================

const MOCK_BRANCHFORGE_PROJECTS: BranchForgeProject[] = [
  { id: 'my-project', name: 'My Visual Novel' },
  { id: 'prequel', name: 'Prequel Project' },
  { id: 'sequel', name: 'Sequel Project' },
];

// ============================================================================
// Component
// ============================================================================

export function GitLabProjectDialog({ open, onOpenChange, onLinkSuccess }: GitLabProjectDialogProps) {
  const { listProjects, refreshIntegration } = useGitLab();
  const { success, error } = useToast();

  // Form state
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedGitlabProject, setSelectedGitlabProject] = useState<GitLabProject | null>(null);
  const [branch, setBranch] = useState('main');

  // GitLab projects state
  const [gitlabProjects, setGitlabProjects] = useState<GitLabProject[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [gitlabLoadError, setGitlabLoadError] = useState<string | null>(null);
  const [projectSearch, setProjectSearch] = useState('');

  // Link state
  const [isLinking, setIsLinking] = useState(false);

  /**
   * Load GitLab projects
   */
  const loadGitlabProjects = useCallback(async () => {
    setIsLoadingProjects(true);
    setGitlabLoadError(null);
    try {
      const projects = await listProjects();
      setGitlabProjects(projects);
      setGitlabLoadError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load GitLab projects';
      setGitlabLoadError(message);
      error(message);
    } finally {
      setIsLoadingProjects(false);
    }
  }, [listProjects, error]);

  // Load projects when dialog opens
  useEffect(() => {
    if (open && gitlabProjects.length === 0) {
      loadGitlabProjects();
    }
  }, [open, gitlabProjects.length, loadGitlabProjects]);

  /**
   * Reset form state
   */
  const reset = useCallback(() => {
    setSelectedProjectId('');
    setSelectedGitlabProject(null);
    setBranch('main');
    setProjectSearch('');
    setGitlabLoadError(null);
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
    if (!selectedProjectId) {
      error('Please select a BranchForge project');
      return;
    }

    if (!selectedGitlabProject) {
      error('Please select a GitLab repository');
      return;
    }

    if (!branch.trim()) {
      error('Please enter a branch name');
      return;
    }

    setIsLinking(true);

    try {
      const request: LinkRepositoryRequest = {
        projectId: selectedProjectId,
        gitlabProjectId: selectedGitlabProject.id,
        branch: branch.trim() || 'main',
      };

      await gitlabApi.linkRepository(
        request.projectId,
        request.gitlabProjectId,
        request.branch
      );

      success(`Successfully linked "${selectedGitlabProject.name}" to your project`);
      closeDialog();
      onLinkSuccess?.();
      await refreshIntegration();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to link repository';
      error(message);
    } finally {
      setIsLinking(false);
    }
  }, [selectedProjectId, selectedGitlabProject, branch, closeDialog, onLinkSuccess, refreshIntegration, success, error]);

  /**
   * Filter GitLab projects based on search
   */
  const filteredGitlabProjects = gitlabProjects.filter(project =>
    project.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
    project.path_with_namespace.toLowerCase().includes(projectSearch.toLowerCase())
  );

  // ============================================================================
  // Render
  // ============================================================================

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg shadow-lg max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-border/30 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-medium">Link GitLab Repository</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Connect your BranchForge project to a GitLab repository for sync.
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
          {/* BranchForge Project Selection */}
          <div className="space-y-2">
            <Label htmlFor="-project">BranchForge Project</Label>
            <select
              id="-project"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-border/30 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select a project...</option>
              {MOCK_BRANCHFORGE_PROJECTS.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              The BranchForge project you want to sync with GitLab.
            </p>
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
                disabled={isLoadingProjects || isLinking}
              />
              {isLoadingProjects && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
              )}
            </div>

            {/* GitLab Projects List */}
            <div className="border border-border/30 rounded-md max-h-48 overflow-y-auto">
              {isLoadingProjects ? (
                <div className="p-4 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : gitlabLoadError ? (
                <div className="p-4 flex flex-col items-center gap-3 text-center">
                  <p className="text-sm text-destructive">{gitlabLoadError}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => loadGitlabProjects()}
                    disabled={isLoadingProjects}
                  >
                    {isLoadingProjects ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : null}
                    Retry
                  </Button>
                </div>
              ) : filteredGitlabProjects.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  {projectSearch ? 'No matching repositories found' : 'No repositories available'}
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  {filteredGitlabProjects.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => setSelectedGitlabProject(project)}
                      className={`w-full p-3 text-left hover:bg-muted/50 transition-colors ${
                        selectedGitlabProject?.id === project.id ? 'bg-muted' : ''
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
              The branch to sync with. Default is <code className="bg-muted px-1 py-0.5 rounded">main</code>.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border/30 flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={closeDialog}
            disabled={isLinking}
          >
            Cancel
          </Button>
          <Button
            onClick={handleLink}
            disabled={!selectedProjectId || !selectedGitlabProject || isLinking}
          >
            {isLinking ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : null}
            Link Repository
          </Button>
        </div>
      </div>
    </div>
  );
}
