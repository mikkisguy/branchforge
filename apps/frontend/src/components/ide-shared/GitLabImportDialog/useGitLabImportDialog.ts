/**
 * GitLab Import Dialog - Logic Hook
 *
 * Contains all state management, effects, and handler functions
 * extracted from GitLabImportDialog for line-count management.
 */

import { useEffect, useRef, useCallback, useReducer } from "react";
import { useToast } from "@/contexts/ToastContext";
import { useGitLab } from "@/hooks/useGitLab";
import { gitlabApi } from "@/lib/api/gitlab";
import { projectKeys, gitlabKeys, labelKeys } from "@/lib/query-keys";
import { useQueryClient } from "@tanstack/react-query";
import { charactersApi } from "@/lib/api/characters";
import { dialogReducer, initialDialogState } from "./GitLabImportDialogReducer";

export function useGitLabImportDialog(
  open: boolean,
  onOpenChange: (open: boolean) => void,
  onSuccess?: (importedProject?: { id: string }) => void
) {
  const [state, dispatch] = useReducer(dialogReducer, initialDialogState);

  const didCallOnSuccessRef = useRef(false);
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
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
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
        if (!hasSetSelectingState.current) {
          dispatch({
            type: "SET_IMPORT_STATE",
            payload: { status: "selecting", message: "" },
          });
          hasSetSelectingState.current = true;
        }
        if (!hasLoadedReposRef.current) {
          const requestId = ++loadReposRequestIdRef.current;
          dispatch({ type: "SET_IS_LOADING_REPOS", payload: true });
          listRepositories()
            .then((repos) => {
              if (requestId === loadReposRequestIdRef.current && open) {
                dispatch({ type: "SET_REPOSITORIES", payload: repos });
                hasLoadedReposRef.current = true;
              }
            })
            .catch((err) => {
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

      dispatch({ type: "SET_IMPORTED_PROJECT", payload: result.project });

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

      try {
        // react-doctor-disable-next-line react-doctor/async-defer-await
        const detectionResult = await charactersApi.detectCharacters(
          result.project.id
        );

        if (currentImportId !== importIdRef.current) return;

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
        error(
          "Project imported, but character detection failed. You can import characters manually later.",
          "Warning"
        );
      }

      dispatch({
        type: "SET_IMPORT_STATE",
        payload: {
          status: "success",
          message: `Successfully imported ${result.project.name}`,
        },
      });

      success("Project imported successfully");
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        if (!didCallOnSuccessRef.current) {
          didCallOnSuccessRef.current = true;
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

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
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

  const handleConfigureClick = useCallback(() => {
    handleOpenChange(false);
    window.dispatchEvent(
      new CustomEvent("open-settings", {
        detail: { tab: "integrations" },
      })
    );
  }, [handleOpenChange]);

  const handleRetry = useCallback(() => {
    dispatch({
      type: "SET_IMPORT_STATE",
      payload: { status: "selecting", message: "" },
    });
  }, []);

  return {
    state,
    dispatch,
    checkingIntegration,
    hasIntegration,
    filteredRepositories,
    importIdRef,
    didCallOnSuccessRef,
    timeoutRef,
    handleImport,
    handleOpenChange,
    handleConfigureClick,
    handleRetry,
  };
}
