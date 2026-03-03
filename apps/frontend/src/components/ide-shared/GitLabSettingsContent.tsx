/**
 * GitLab Settings Content
 *
 * Content component for the GitLab tab in SettingsModal.
 * Handles PAT input, validation, and linked projects management.
 */

import { useState, useCallback, useEffect } from "react";
import { Eye, EyeOff, Trash2, Link as LinkIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineMessage } from "@/components/ui/inline-error";
import { useGitLab } from "@/contexts/GitLabContext";
import { useToast } from "@/contexts/ToastContext";
import { GitLabProjectDialog } from "@/components/ide-shared/GitLabProjectDialog";
import { gitlabApi } from "@/lib/api/gitlab";

// ============================================================================
// Types
// ============================================================================

interface LinkedProjectDisplay {
  id: string;
  name: string;
  gitlabRepository: string;
  defaultBranch: string;
}

// ============================================================================
// Component
// ============================================================================

export function GitLabSettingsContent() {
  const {
    hasIntegration,
    isLoadingIntegration,
    integrationError,
    linkedRepositories,
    refreshIntegration,
    validateToken,
    storeToken,
    removeIntegration,
  } = useGitLab();

  const { success, error } = useToast();

  // Form state
  const [token, setToken] = useState("");
  const [gitlabUrl, setGitlabUrl] = useState("https://gitlab.com");
  const [showToken, setShowToken] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isStoring, setIsStoring] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    username?: string;
  } | null>(null);

  // Linked projects display state
  const [linkedProjects, setLinkedProjects] = useState<LinkedProjectDisplay[]>(
    [],
  );

  // Dialog state
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [showRemoveConfirmDialog, setShowRemoveConfirmDialog] = useState(false);

  // Unlinking state - track which project ID is being unlinked
  const [unlinkingProjectId, setUnlinkingProjectId] = useState<string | null>(
    null,
  );

  /**
   * Validate token
   */
  const handleValidate = useCallback(async () => {
    if (!token.trim()) {
      error("Token is required");
      return;
    }

    setIsValidating(true);
    setValidationResult(null);

    try {
      const result = await validateToken(token, gitlabUrl);
      setValidationResult(result);
      if (result.valid) {
        success(
          `Token validated successfully for ${result.username || "user"}`,
        );
      } else {
        error("Invalid GitLab token");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Validation failed";
      error(message);
      setValidationResult({ valid: false });
    } finally {
      setIsValidating(false);
    }
  }, [token, gitlabUrl, validateToken, success, error]);

  /**
   * Store token
   */
  const handleStore = useCallback(async () => {
    if (!token.trim()) {
      error("Token is required");
      return;
    }

    if (validationResult?.valid !== true) {
      error("Please validate the token first");
      return;
    }

    setIsStoring(true);

    try {
      await storeToken(token, gitlabUrl);
      success("GitLab integration saved successfully");
      setToken("");
      setGitlabUrl("https://gitlab.com");
      setValidationResult(null);
      await refreshIntegration();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to store token";
      error(message);
    } finally {
      setIsStoring(false);
    }
  }, [
    token,
    gitlabUrl,
    validationResult,
    storeToken,
    refreshIntegration,
    success,
    error,
  ]);

  /**
   * Show remove confirmation dialog
   */
  const handleRemoveClick = useCallback(() => {
    setShowRemoveConfirmDialog(true);
  }, []);

  /**
   * Remove integration (called after user confirms)
   */
  const handleRemoveConfirmed = useCallback(async () => {
    setShowRemoveConfirmDialog(false);
    setIsRemoving(true);

    try {
      await removeIntegration();
      success("GitLab integration removed");
      await refreshIntegration();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to remove integration";
      error(message);
    } finally {
      setIsRemoving(false);
    }
  }, [removeIntegration, refreshIntegration, success, error]);

  /**
   * Cancel removal
   */
  const handleRemoveCancelled = useCallback(() => {
    setShowRemoveConfirmDialog(false);
  }, []);

  /**
   * Unlink a GitLab repository from a project
   */
  const handleUnlink = useCallback(
    async (projectId: string) => {
      setUnlinkingProjectId(projectId);

      try {
        await gitlabApi.unlinkRepository(projectId);
        success("GitLab repository unlinked successfully");
        await refreshIntegration();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to unlink repository";
        error(message);
      } finally {
        setUnlinkingProjectId(null);
      }
    },
    [refreshIntegration, success, error],
  );

  /**
   * Load linked projects
   */
  const loadLinkedProjects = useCallback(async () => {
    // TODO: This will be implemented once we have the backend API to fetch linked projects
    // For now, use the linkedRepositories from context
    const projects: LinkedProjectDisplay[] = Array.from(
      linkedRepositories.values(),
    ).map((repo) => ({
      id: repo.id,
      name: `Project ${repo.projectId.substring(0, 8)}`,
      gitlabRepository: repo.repositoryName,
      defaultBranch: repo.defaultBranch,
    }));
    setLinkedProjects(projects);
  }, [linkedRepositories]);

  useEffect(() => {
    loadLinkedProjects();
  }, [loadLinkedProjects]);

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">GitLab Integration</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Connect your GitLab account to enable repository linking and sync
          operations.
        </p>
      </div>

      {isLoadingIntegration ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : hasIntegration ? (
        // Has integration - show linked projects and remove option
        <div className="space-y-4">
          <div className="p-4 bg-muted/30 rounded-md border border-border/30">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">GitLab Connected</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Your GitLab account is linked and ready to use.
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleRemoveClick}
                disabled={isRemoving}
              >
                {isRemoving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span className="ml-2">Remove</span>
              </Button>
            </div>
          </div>

          {/* Linked Projects */}
          {linkedProjects.length > 0 ? (
            <div className="space-y-2">
              <Label>Linked Projects</Label>
              {linkedProjects.map((project) => (
                <div
                  key={project.id}
                  className="p-3 bg-muted/20 rounded-md border border-border/30 flex items-center justify-between"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium">{project.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {project.gitlabRepository} · {project.defaultBranch}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleUnlink(project.id)}
                    disabled={unlinkingProjectId === project.id}
                  >
                    {unlinkingProjectId === project.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">No linked projects yet</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setShowLinkDialog(true)}
              >
                <LinkIcon className="w-4 h-4 mr-2" />
                Link Project
              </Button>
            </div>
          )}

          <Button
            variant="outline"
            className="w-full"
            onClick={() => setShowLinkDialog(true)}
          >
            <LinkIcon className="w-4 h-4 mr-2" />
            Link New Project
          </Button>
        </div>
      ) : (
        // No integration - show token input form
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="gitlab-url">GitLab URL</Label>
            <Input
              id="gitlab-url"
              type="url"
              placeholder="https://gitlab.com"
              value={gitlabUrl}
              onChange={(e) => setGitlabUrl(e.target.value)}
              disabled={isStoring}
            />
            <p className="text-xs text-muted-foreground">
              Leave as default for gitlab.com, or enter your self-hosted
              instance URL.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="token">Personal Access Token</Label>
            <div className="relative">
              <Input
                id="token"
                type={showToken ? "text" : "password"}
                placeholder="glpat-xxxxxxxxxxxxxxxxxxxx"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                disabled={isStoring}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showToken ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Create a token in GitLab with{" "}
              <code className="bg-muted px-1 py-0.5 rounded">read_api</code>,{" "}
              <code className="bg-muted px-1 py-0.5 rounded">
                read_repository
              </code>
              , and{" "}
              <code className="bg-muted px-1 py-0.5 rounded">
                write_repository
              </code>{" "}
              scopes. Will be stored securely and only used to access your
              repositories.
            </p>
          </div>

          {validationResult && (
            <InlineMessage
              variant={validationResult.valid ? "success" : "error"}
            >
              {validationResult.valid
                ? `Validated for ${validationResult.username || "user"}`
                : "Invalid token"}
            </InlineMessage>
          )}

          {integrationError && (
            <InlineMessage variant="error">{integrationError}</InlineMessage>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleValidate}
              disabled={!token.trim() || isValidating || isStoring}
              className="flex-1"
            >
              {isValidating ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Validate
            </Button>
            <Button
              onClick={handleStore}
              disabled={
                !token.trim() ||
                validationResult?.valid !== true ||
                isStoring ||
                isValidating
              }
              className="flex-1"
            >
              {isStoring ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Save Integration
            </Button>
          </div>
        </div>
      )}

      {/* Link Project Dialog */}
      <GitLabProjectDialog
        open={showLinkDialog}
        onOpenChange={setShowLinkDialog}
        onLinkSuccess={loadLinkedProjects}
      />

      {/* Remove Confirmation Dialog */}
      {showRemoveConfirmDialog ? (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-lg shadow-lg max-w-md w-full">
            {/* Header */}
            <div className="p-6 border-b border-border/30">
              <h2 className="text-lg font-medium">Remove GitLab Integration</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Are you sure you want to remove your GitLab integration? This
                will unlink all repositories.
              </p>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-border/30 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={handleRemoveCancelled}
                disabled={isRemoving}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleRemoveConfirmed}
                disabled={isRemoving}
              >
                {isRemoving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Removing...
                  </>
                ) : (
                  "Remove Integration"
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

