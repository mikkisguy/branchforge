/**
 * GitLab Import Dialog
 *
 * Dialog for importing new Ren'Py projects from GitLab repositories.
 * Checks integration status, allows repository selection, and creates projects.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Loader2,
  GitFork,
  AlertCircle,
  CheckCircle2,
  Info,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/contexts/ToastContext";
import { useGitLab } from "@/hooks/useGitLab";
import { gitlabApi } from "@/lib/api/gitlab";
import { projectKeys, gitlabKeys } from "@/lib/query-keys";
import { useQueryClient } from "@tanstack/react-query";
import type { GitLabRepository } from "@/lib/api/gitlab";
import { CharacterImportWizard } from "@/components/CharacterImportWizard";
import type { DetectCharactersResponse } from "@branchforge/shared";
import { charactersApi } from "@/lib/api/characters";

// ============================================================================
// Types
// ============================================================================

interface GitLabImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (importedProject?: { id: string }) => void;
}

type ImportStateStatus =
  | "idle"
  | "selecting"
  | "importing"
  | "success"
  | "error";

interface ImportState {
  status: ImportStateStatus;
  message: string;
}

// ============================================================================
// Component
// ============================================================================

export function GitLabImportDialog({
  open,
  onOpenChange,
  onSuccess,
}: GitLabImportDialogProps) {
  // Form state
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [selectedRepository, setSelectedRepository] =
    useState<GitLabRepository | null>(null);
  const [branch, setBranch] = useState("main");
  const [searchQuery, setSearchQuery] = useState("");
  const [importState, setImportState] = useState<ImportState>({
    status: "idle",
    message: "",
  });

  // Character wizard state
  const [showCharacterWizard, setShowCharacterWizard] = useState(false);
  const [detectedCharacters, setDetectedCharacters] =
    useState<DetectCharactersResponse | null>(null);
  const [importedProject, setImportedProject] = useState<{ id: string } | null>(
    null
  );
  // Guard to prevent calling onSuccess/onOpenChange(false) twice
  const didCallOnSuccessRef = useRef(false);

  // Repositories state
  const [repositories, setRepositories] = useState<GitLabRepository[]>([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);

  // Timeout cleanup and loading tracking
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedReposRef = useRef(false);
  const hasSetSelectingState = useRef(false);
  const loadReposRequestIdRef = useRef(0);

  const { success, error } = useToast();
  const {
    hasIntegration,
    isLoadingIntegration: checkingIntegration,
    listRepositories,
  } = useGitLab();
  const queryClient = useQueryClient();

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      // Clear pending success timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      // Increment request ID to ignore stale listRepositories responses
      loadReposRequestIdRef.current += 1;
      setProjectName("");
      setProjectDescription("");
      setSelectedRepository(null);
      setBranch("main");
      setSearchQuery("");
      setImportState({ status: "idle", message: "" });
      setRepositories([]);
      setShowCharacterWizard(false);
      setDetectedCharacters(null);
      setImportedProject(null);
      didCallOnSuccessRef.current = false;
      hasLoadedReposRef.current = false;
      hasSetSelectingState.current = false;
    }
  }, [open]);

  // Check integration status when dialog opens
  useEffect(() => {
    if (open && !checkingIntegration) {
      if (hasIntegration) {
        // Only set state if we haven't already
        if (!hasSetSelectingState.current) {
          setImportState({ status: "selecting", message: "" });
          hasSetSelectingState.current = true;
        }
        // Load repositories (only once per dialog session)
        if (!hasLoadedReposRef.current) {
          const requestId = ++loadReposRequestIdRef.current;
          setIsLoadingRepos(true);
          listRepositories()
            .then((repos) => {
              // Only update if this is still the current request and dialog is open
              if (requestId === loadReposRequestIdRef.current && open) {
                setRepositories(repos);
                hasLoadedReposRef.current = true;
              }
            })
            .catch((err) => {
              // Only show error if this is still the current request and dialog is open
              if (requestId === loadReposRequestIdRef.current && open) {
                const message =
                  err instanceof Error
                    ? err.message
                    : "Failed to load repositories";
                // Note: error is intentionally excluded from deps. The error function
                // is only called in catch blocks, and including it would cause the effect
                // to re-run on every render since useToast returns a new error reference.
                error(message, "Load failed");
              }
            })
            .finally(() => {
              // Only clear loading if this is still the current request
              if (requestId === loadReposRequestIdRef.current) {
                setIsLoadingRepos(false);
              }
            });
        }
      } else {
        setImportState({
          status: "idle",
          message: "GitLab integration not configured",
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hasIntegration, checkingIntegration, listRepositories]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleImport = async () => {
    if (!selectedRepository || !projectName.trim()) {
      error("Please select a repository and enter a project name");
      return;
    }

    setImportState({ status: "importing", message: "Importing project..." });

    try {
      const result = await gitlabApi.importProject({
        projectName: projectName.trim(),
        projectDescription: projectDescription.trim() || undefined,
        gitlabProjectId: selectedRepository.id,
        gitlabProjectName: selectedRepository.name,
        branch: branch.trim() || "main",
        conflictResolution: "branchforge_wins",
      });

      setImportState({
        status: "success",
        message: `Successfully imported ${result.project.name}`,
      });

      // Invalidate projects and GitLab linked repos cache
      await queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
      await queryClient.invalidateQueries({
        queryKey: gitlabKeys.repositories(),
      });

      // Detect characters from imported RPY files
      try {
        const detectionResult = await charactersApi.detectCharacters(
          result.project.id
        );

        // Filter out characters that already exist in the database
        // For a newly created project, existingTags will be empty
        const existingTagsSet = new Set(detectionResult.existingTags);
        const newCharacters = detectionResult.characters.filter(
          (char) => !existingTagsSet.has(char.tag)
        );

        if (newCharacters.length > 0) {
          setImportedProject(result.project);
          setDetectedCharacters({
            ...detectionResult,
            characters: newCharacters,
          });
          setShowCharacterWizard(true);
          return;
        }
      } catch (err) {
        console.error("Failed to detect characters:", err);
        // Non-blocking: notify user but don't fail the import
        error(
          "Project imported, but character detection failed. You can import characters manually later.",
          "Warning"
        );
      }

      // Only show success and close if no characters detected
      success("Project imported successfully");
      // Clear any existing timeout before scheduling a new one
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        if (!didCallOnSuccessRef.current) {
          didCallOnSuccessRef.current = true;
          // Pass the imported project to switch to it
          onSuccess?.(result.project);
        }
        onOpenChange(false);
      }, 1500);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to import project";
      setImportState({ status: "error", message });
      error(message, "Import failed");
    }
  };

  const filteredRepositories = repositories.filter(
    (repo) =>
      repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      repo.path_with_namespace.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Guarded close handler that ensures onSuccess is called if import completed
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        // Check if import succeeded but timeout hasn't fired yet
        if (importState.status === "success" && !didCallOnSuccessRef.current) {
          didCallOnSuccessRef.current = true;
          onSuccess?.();
        }
      }
      onOpenChange(nextOpen);
    },
    [importState.status, onSuccess, onOpenChange]
  );

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[700px] max-w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitFork className="size-5" />
            Import from GitLab
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Integration not configured */}
          {importState.status === "idle" && !hasIntegration && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="size-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-medium text-amber-600 dark:text-amber-400 mb-1">
                    GitLab Integration Not Configured
                  </h4>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">
                    To import from GitLab, you need to configure your GitLab
                    access token first.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      // Close this dialog and open Settings to Integrations tab
                      handleOpenChange(false);
                      // Parent should handle opening Settings with Integrations tab
                      window.dispatchEvent(
                        new CustomEvent("open-settings", {
                          detail: { tab: "integrations" },
                        })
                      );
                    }}
                  >
                    Configure GitLab Integration
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Loading integration status */}
          {checkingIntegration && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-6 animate-spin" />
              <span className="ml-2 text-sm text-muted-foreground">
                Checking GitLab integration…
              </span>
            </div>
          )}

          {/* Repository selection */}
          {importState.status === "selecting" && (
            <div className="space-y-4">
              {/* Project details */}
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="gitlab-project-name">Project name *</Label>
                  <Input
                    id="gitlab-project-name"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="My Visual Novel"
                    maxLength={200}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="gitlab-project-description">
                    Description
                  </Label>
                  <Textarea
                    id="gitlab-project-description"
                    value={projectDescription}
                    onChange={(e) => setProjectDescription(e.target.value)}
                    placeholder="Optional description"
                    maxLength={2000}
                    rows={2}
                    className="resize-y"
                  />
                </div>
              </div>

              {/* Repository selection */}
              <div className="space-y-2">
                <Label>GitLab repository *</Label>
                <Input
                  placeholder="Search repositories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {isLoadingRepos ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="size-5 animate-spin" />
                  <span className="ml-2 text-sm text-muted-foreground">
                    Loading repositories…
                  </span>
                </div>
              ) : filteredRepositories.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  {searchQuery
                    ? "No repositories match your search"
                    : "No repositories found"}
                </div>
              ) : (
                <div
                  role="listbox"
                  className="border rounded-lg max-h-[200px] overflow-y-auto"
                >
                  {filteredRepositories.map((repo) => (
                    <button
                      key={repo.id}
                      type="button"
                      role="option"
                      aria-selected={selectedRepository?.id === repo.id}
                      onClick={() => setSelectedRepository(repo)}
                      className={`
                        w-full text-left px-4 py-3 border-b last:border-b-0
                        hover:bg-muted/50 transition-colors
                        ${
                          selectedRepository?.id === repo.id
                            ? "bg-accent text-accent-foreground"
                            : ""
                        }
                      `}
                    >
                      <div className="font-medium">{repo.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {repo.path_with_namespace}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Branch */}
              <div className="space-y-2">
                <Label htmlFor="gitlab-branch">Branch</Label>
                <Input
                  id="gitlab-branch"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="main"
                />
                <p className="text-xs text-muted-foreground">
                  Default branch for this repository
                </p>
              </div>

              {/* Import button */}
              <Button
                onClick={handleImport}
                disabled={!selectedRepository || !projectName.trim()}
                className="w-full"
              >
                <GitFork className="mr-2 h-4 w-4" />
                Import Project
              </Button>

              {/* Info */}
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <Info className="size-4 mt-0.5 flex-shrink-0" />
                <p>
                  This will create a new project and import all .rpy files from
                  the selected GitLab repository. Existing local changes will
                  take precedence over remote changes.
                </p>
              </div>
            </div>
          )}

          {/* Importing state */}
          {importState.status === "importing" && (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="size-8 animate-spin mb-4" />
              <p className="text-sm text-muted-foreground">
                {importState.message}
              </p>
            </div>
          )}

          {/* Success state */}
          {importState.status === "success" && (
            <div className="flex flex-col items-center justify-center py-8">
              <CheckCircle2 className="size-12 text-green-500 mb-4" />
              <p className="text-sm text-foreground">{importState.message}</p>
            </div>
          )}

          {/* Error state */}
          {importState.status === "error" && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="size-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-medium text-destructive mb-1">
                    Import Failed
                  </h4>
                  <p className="text-sm text-destructive/90">
                    {importState.message}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setImportState({ status: "selecting", message: "" })
                    }
                    className="mt-3"
                  >
                    Try Again
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>

      {/* Character Import Wizard */}
      {showCharacterWizard && detectedCharacters && importedProject && (
        <CharacterImportWizard
          open={showCharacterWizard}
          onOpenChange={(open) => {
            setShowCharacterWizard(open);
            if (!open) {
              // Set flag to prevent duplicate onSuccess calls
              didCallOnSuccessRef.current = true;
              // Close the import dialog after character wizard is closed
              handleOpenChange(false);
            }
          }}
          projectId={importedProject.id}
          detectedCharacters={detectedCharacters.characters}
          conflicts={detectedCharacters.conflicts}
          excludedTags={detectedCharacters.excludedTags}
          onComplete={() => {
            setShowCharacterWizard(false);
            // Set flag to prevent duplicate onSuccess calls
            didCallOnSuccessRef.current = true;
            // Switch to the imported project after character import completes
            onSuccess?.(importedProject);
          }}
        />
      )}
    </Dialog>
  );
}
