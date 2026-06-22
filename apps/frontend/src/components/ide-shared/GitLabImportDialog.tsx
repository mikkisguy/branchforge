/**
 * GitLab Import Dialog
 *
 * Dialog for importing new Ren'Py projects from GitLab repositories.
 * Checks integration status, allows repository selection, and creates projects.
 */

import { useEffect, useRef, useCallback, useReducer } from "react";
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
import { projectKeys, gitlabKeys, labelKeys } from "@/lib/query-keys";
import { useQueryClient } from "@tanstack/react-query";
import type { GitLabRepository } from "@/lib/api/gitlab";
import { CharacterImportWizard } from "@/components/CharacterImportWizard.lazy";
import type { DetectCharactersResponse } from "@branchforge/shared";
import { charactersApi } from "@/lib/api/characters";

// ============================================================================
// Types
// ============================================================================

export interface GitLabImportDialogProps {
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
// Reducer State & Actions
// ============================================================================

interface DialogState {
  projectName: string;
  projectDescription: string;
  selectedRepository: GitLabRepository | null;
  branch: string;
  searchQuery: string;
  importState: ImportState;
  repositories: GitLabRepository[];
  isLoadingRepos: boolean;
  showCharacterWizard: boolean;
  detectedCharacters: DetectCharactersResponse | null;
  importedProject: { id: string } | null;
}

type DialogAction =
  | { type: "SET_PROJECT_NAME"; payload: string }
  | { type: "SET_PROJECT_DESCRIPTION"; payload: string }
  | { type: "SET_SELECTED_REPOSITORY"; payload: GitLabRepository | null }
  | { type: "SET_BRANCH"; payload: string }
  | { type: "SET_SEARCH_QUERY"; payload: string }
  | { type: "SET_IMPORT_STATE"; payload: ImportState }
  | { type: "SET_REPOSITORIES"; payload: GitLabRepository[] }
  | { type: "SET_IS_LOADING_REPOS"; payload: boolean }
  | { type: "SET_SHOW_CHARACTER_WIZARD"; payload: boolean }
  | {
      type: "SET_DETECTED_CHARACTERS";
      payload: DetectCharactersResponse | null;
    }
  | { type: "SET_IMPORTED_PROJECT"; payload: { id: string } | null }
  | { type: "RESET" };

const initialDialogState: DialogState = {
  projectName: "",
  projectDescription: "",
  selectedRepository: null,
  branch: "main",
  searchQuery: "",
  importState: { status: "idle", message: "" },
  repositories: [],
  isLoadingRepos: false,
  showCharacterWizard: false,
  detectedCharacters: null,
  importedProject: null,
};

function dialogReducer(state: DialogState, action: DialogAction): DialogState {
  switch (action.type) {
    case "SET_PROJECT_NAME":
      return { ...state, projectName: action.payload };
    case "SET_PROJECT_DESCRIPTION":
      return { ...state, projectDescription: action.payload };
    case "SET_SELECTED_REPOSITORY":
      return { ...state, selectedRepository: action.payload };
    case "SET_BRANCH":
      return { ...state, branch: action.payload };
    case "SET_SEARCH_QUERY":
      return { ...state, searchQuery: action.payload };
    case "SET_IMPORT_STATE":
      return { ...state, importState: action.payload };
    case "SET_REPOSITORIES":
      return { ...state, repositories: action.payload };
    case "SET_IS_LOADING_REPOS":
      return { ...state, isLoadingRepos: action.payload };
    case "SET_SHOW_CHARACTER_WIZARD":
      return { ...state, showCharacterWizard: action.payload };
    case "SET_DETECTED_CHARACTERS":
      return { ...state, detectedCharacters: action.payload };
    case "SET_IMPORTED_PROJECT":
      return { ...state, importedProject: action.payload };
    case "RESET":
      return initialDialogState;
    default:
      return state;
  }
}

// ============================================================================
// Component
// ============================================================================

export function GitLabImportDialog({
  open,
  onOpenChange,
  onSuccess,
}: GitLabImportDialogProps) {
  // Combined dialog state managed by reducer
  const [state, dispatch] = useReducer(dialogReducer, initialDialogState);

  // Guard to prevent calling onSuccess/onOpenChange(false) twice
  const didCallOnSuccessRef = useRef(false);

  // Timeout cleanup and loading tracking
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedReposRef = useRef(false);
  const hasSetSelectingState = useRef(false);
  const loadReposRequestIdRef = useRef(0);
  const importIdRef = useRef(0);

  const { success, error } = useToast();
  const {
    hasIntegration,
    isLoadingIntegration: checkingIntegration,
    listRepositories,
  } = useGitLab();
  const queryClient = useQueryClient();

  // Reset state when dialog opens/closes
  useEffect(() => {
    // react-doctor-disable-next-line react-doctor/no-event-handler
    if (!open) {
      // Clear pending success timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      // Increment request IDs to ignore stale responses
      loadReposRequestIdRef.current += 1;
      importIdRef.current += 1;
      dispatch({ type: "RESET" });
      didCallOnSuccessRef.current = false;
      hasLoadedReposRef.current = false;
      hasSetSelectingState.current = false;
    }
  }, [open]);

  // Check integration status when dialog opens
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    // react-doctor-disable-next-line react-doctor/no-event-handler
    if (open && !checkingIntegration) {
      if (hasIntegration) {
        // Only set state if we haven't already
        if (!hasSetSelectingState.current) {
          dispatch({
            type: "SET_IMPORT_STATE",
            payload: { status: "selecting", message: "" },
          });
          hasSetSelectingState.current = true;
        }
        // Load repositories (only once per dialog session)
        if (!hasLoadedReposRef.current) {
          const requestId = ++loadReposRequestIdRef.current;
          dispatch({ type: "SET_IS_LOADING_REPOS", payload: true });
          listRepositories()
            .then((repos) => {
              // Only update if this is still the current request and dialog is open
              if (requestId === loadReposRequestIdRef.current && open) {
                dispatch({ type: "SET_REPOSITORIES", payload: repos });
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
                dispatch({ type: "SET_IS_LOADING_REPOS", payload: false });
              }
            });
        }
      } else {
        dispatch({
          type: "SET_IMPORT_STATE",
          payload: {
            status: "idle",
            message: "GitLab integration not configured",
          },
        });
      }
    }
    // react-doctor-disable-next-line react-doctor/exhaustive-deps
  }, [open, hasIntegration, checkingIntegration, listRepositories]);
  /* eslint-enable react-hooks/exhaustive-deps */

  // Cleanup timeout on unmount
  // react-doctor-disable-next-line react-doctor/exhaustive-deps
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleImport = async () => {
    if (!state.selectedRepository || !state.projectName.trim()) {
      error("Please select a repository and enter a project name");
      return;
    }

    dispatch({
      type: "SET_IMPORT_STATE",
      payload: { status: "importing", message: "Importing project..." },
    });

    try {
      const result = await gitlabApi.importProject({
        projectName: state.projectName.trim(),
        projectDescription: state.projectDescription.trim() || undefined,
        gitlabProjectId: state.selectedRepository.id,
        gitlabProjectName: state.selectedRepository.name,
        branch: state.branch.trim() || "main",
        conflictResolution: "branchforge_wins",
      });

      // Store imported project immediately so all success paths can access it
      dispatch({ type: "SET_IMPORTED_PROJECT", payload: result.project });

      // Invalidate projects, GitLab repos, and label caches in parallel
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: projectKeys.lists() }),
        queryClient.invalidateQueries({
          queryKey: gitlabKeys.repositories(),
        }),
        queryClient.invalidateQueries({
          queryKey: labelKeys.scoped(result.project.id),
        }),
      ]);

      const currentImportId = importIdRef.current;

      // Detect characters from imported RPY files
      try {
        // react-doctor-disable-next-line react-doctor/async-defer-await
        const detectionResult = await charactersApi.detectCharacters(
          result.project.id
        );

        // Stale check: import could have been superseded during the API call
        if (currentImportId !== importIdRef.current) return;

        // Show the wizard if any characters were detected, regardless
        // of whether they are already in the DB. Issue #244
        // (PR #245) promotes extracted characters into the
        // `characters` table during import, so on a fresh import
        // `existingTags` is no longer empty. Filtering to "new only"
        // would suppress the wizard entirely. The wizard's import
        // endpoint is idempotent (upsert), so re-confirming
        // already-stored characters is a safe no-op for unchanged
        // rows.
        if (detectionResult.characters.length > 0) {
          dispatch({
            type: "SET_DETECTED_CHARACTERS",
            payload: detectionResult,
          });
          dispatch({ type: "SET_SHOW_CHARACTER_WIZARD", payload: true });
          return;
        }
      } catch (err) {
        console.error("Failed to detect characters:", err);
        if (currentImportId !== importIdRef.current) return;
        // Non-blocking: notify user but don't fail the import
        error(
          "Project imported, but character detection failed. You can import characters manually later.",
          "Warning"
        );
      }

      // Dispatch success only after character detection completes
      dispatch({
        type: "SET_IMPORT_STATE",
        payload: {
          status: "success",
          message: `Successfully imported ${result.project.name}`,
        },
      });

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
      dispatch({
        type: "SET_IMPORT_STATE",
        payload: { status: "error", message },
      });
      error(message, "Import failed");
    }
  };

  const filteredRepositories = state.repositories.filter(
    (repo) =>
      repo.name.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
      repo.path_with_namespace
        .toLowerCase()
        .includes(state.searchQuery.toLowerCase())
  );

  // Guarded close handler that ensures onSuccess is called if import completed
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        // Check if import succeeded but timeout hasn't fired yet
        if (
          state.importState.status === "success" &&
          !didCallOnSuccessRef.current
        ) {
          didCallOnSuccessRef.current = true;
          onSuccess?.(state.importedProject ?? undefined);
        }
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange, state.importState.status, state.importedProject, onSuccess]
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
          {state.importState.status === "idle" && !hasIntegration && (
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
                    type="button"
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
          {state.importState.status === "selecting" && (
            <div className="space-y-4">
              {/* Project details */}
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="gitlab-project-name">Project name *</Label>
                  <Input
                    id="gitlab-project-name"
                    value={state.projectName}
                    onChange={(e) =>
                      dispatch({
                        type: "SET_PROJECT_NAME",
                        payload: e.target.value,
                      })
                    }
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
                    value={state.projectDescription}
                    onChange={(e) =>
                      dispatch({
                        type: "SET_PROJECT_DESCRIPTION",
                        payload: e.target.value,
                      })
                    }
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
                  value={state.searchQuery}
                  onChange={(e) =>
                    dispatch({
                      type: "SET_SEARCH_QUERY",
                      payload: e.target.value,
                    })
                  }
                />
              </div>

              {state.isLoadingRepos ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="size-5 animate-spin" />
                  <span className="ml-2 text-sm text-muted-foreground">
                    Loading repositories…
                  </span>
                </div>
              ) : filteredRepositories.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  {state.searchQuery
                    ? "No repositories match your search"
                    : "No repositories found"}
                </div>
              ) : (
                <div
                  // react-doctor-disable-next-line react-doctor/prefer-tag-over-role
                  role="listbox"
                  className="border rounded-lg max-h-[200px] overflow-y-auto"
                >
                  {filteredRepositories.map((repo) => (
                    <button
                      key={repo.id}
                      type="button"
                      role="option"
                      aria-selected={state.selectedRepository?.id === repo.id}
                      onClick={() =>
                        dispatch({
                          type: "SET_SELECTED_REPOSITORY",
                          payload: repo,
                        })
                      }
                      className={`
                        w-full text-left px-4 py-3 border-b last:border-b-0
                        hover:bg-muted/50 transition-colors
                        ${
                          state.selectedRepository?.id === repo.id
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
                  value={state.branch}
                  onChange={(e) =>
                    dispatch({ type: "SET_BRANCH", payload: e.target.value })
                  }
                  placeholder="main"
                />
                <p className="text-xs text-muted-foreground">
                  Default branch for this repository
                </p>
              </div>

              {/* Import button */}
              <Button
                type="button"
                onClick={handleImport}
                disabled={
                  !state.selectedRepository || !state.projectName.trim()
                }
                className="w-full"
              >
                <GitFork className="mr-2 size-4" />
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
          {state.importState.status === "importing" && (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="size-8 animate-spin mb-4" />
              <p className="text-sm text-muted-foreground">
                {state.importState.message}
              </p>
            </div>
          )}

          {/* Success state */}
          {state.importState.status === "success" && (
            <div className="flex flex-col items-center justify-center py-8">
              <CheckCircle2 className="size-12 text-green-500 mb-4" />
              <p className="text-sm text-foreground">
                {state.importState.message}
              </p>
            </div>
          )}

          {/* Error state */}
          {state.importState.status === "error" && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="size-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-medium text-destructive mb-1">
                    Import Failed
                  </h4>
                  <p className="text-sm text-destructive/90">
                    {state.importState.message}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      dispatch({
                        type: "SET_IMPORT_STATE",
                        payload: { status: "selecting", message: "" },
                      })
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
      {state.showCharacterWizard &&
        state.detectedCharacters &&
        state.importedProject && (
          <CharacterImportWizard
            open={state.showCharacterWizard}
            onOpenChange={(open) => {
              dispatch({ type: "SET_SHOW_CHARACTER_WIZARD", payload: open });
              if (!open) {
                // Set flag to prevent duplicate onSuccess calls
                didCallOnSuccessRef.current = true;
                // Close the import dialog after character wizard is closed
                handleOpenChange(false);
              }
            }}
            projectId={state.importedProject.id}
            detectedCharacters={state.detectedCharacters.characters}
            conflicts={state.detectedCharacters.conflicts}
            excludedTags={state.detectedCharacters.excludedTags}
            // Fresh project: PR #245 already promoted the
            // characters into the DB so existingTags is non-empty,
            // but the user hasn't reviewed them yet. Treat all as
            // "new" — the import endpoint's upsert is a no-op for
            // already-stored rows.
            existingTags={[]}
            onComplete={() => {
              dispatch({ type: "SET_SHOW_CHARACTER_WIZARD", payload: false });
              // Set flag to prevent duplicate onSuccess calls
              didCallOnSuccessRef.current = true;
              // Switch to the imported project after character import completes
              onSuccess?.(state.importedProject!);
            }}
          />
        )}
    </Dialog>
  );
}
