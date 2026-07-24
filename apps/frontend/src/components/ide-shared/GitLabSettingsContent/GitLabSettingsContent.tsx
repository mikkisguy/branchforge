/**
 * GitLab Settings Content
 *
 * Content component for the Integrations tab in SettingsModal.
 * Handles PAT input, validation, and integration management.
 * Repository linking is now handled in the import flow, not here.
 */

import { useReducer, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { useGitLab } from "@/hooks/useGitLab";
import { useToast } from "@/contexts/ToastContext";
import {
  settingsReducer,
  initialSettingsState,
} from "./GitLabSettingsContentReducer";
import { GitLabSettingsConnectedView } from "./GitLabSettingsConnectedView";
import { GitLabSettingsSetupForm } from "./GitLabSettingsSetupForm";
import { GitLabSettingsRemoveDialog } from "./GitLabSettingsRemoveDialog";

export function GitLabSettingsContent() {
  const {
    hasIntegration,
    isLoadingIntegration,
    integrationError,
    refreshIntegration,
    validateToken,
    storeToken,
    removeIntegration,
  } = useGitLab();

  const { success, error } = useToast();

  const [state, dispatch] = useReducer(settingsReducer, initialSettingsState);

  const handleValidate = useCallback(async () => {
    if (!state.token.trim()) {
      error("Token is required");
      return;
    }

    dispatch({ type: "SET_VALIDATING", value: true });
    dispatch({ type: "SET_VALIDATION_RESULT", result: null });

    try {
      const result = await validateToken(state.token, state.gitlabUrl);
      dispatch({ type: "SET_VALIDATION_RESULT", result });
      if (result.valid) {
        success(
          `Token validated successfully for ${result.username || "user"}`
        );
      } else {
        error("Invalid GitLab token");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Validation failed";
      error(message);
      dispatch({ type: "SET_VALIDATION_RESULT", result: { valid: false } });
    } finally {
      dispatch({ type: "SET_VALIDATING", value: false });
    }
  }, [state.token, state.gitlabUrl, validateToken, success, error]);

  const handleStore = useCallback(async () => {
    if (!state.token.trim()) {
      error("Token is required");
      return;
    }

    if (state.validationResult?.valid !== true) {
      error("Please validate the token first");
      return;
    }

    dispatch({ type: "SET_STORING", value: true });

    try {
      await storeToken(state.token, state.gitlabUrl);
      success("GitLab integration saved successfully");
      dispatch({ type: "RESET_FORM" });
      await refreshIntegration();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to store token";
      error(message);
    } finally {
      dispatch({ type: "SET_STORING", value: false });
    }
  }, [
    state.token,
    state.gitlabUrl,
    state.validationResult,
    storeToken,
    refreshIntegration,
    success,
    error,
  ]);

  const handleRemoveClick = useCallback(() => {
    dispatch({ type: "SET_REMOVE_CONFIRM_DIALOG", value: true });
  }, []);

  const handleRemoveConfirmed = useCallback(async () => {
    dispatch({ type: "SET_REMOVE_CONFIRM_DIALOG", value: false });
    dispatch({ type: "SET_REMOVING", value: true });

    try {
      await removeIntegration();
      success("GitLab integration removed");
      await refreshIntegration();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to remove integration";
      error(message);
    } finally {
      dispatch({ type: "SET_REMOVING", value: false });
    }
  }, [removeIntegration, refreshIntegration, success, error]);

  const handleRemoveCancelled = useCallback(() => {
    dispatch({ type: "SET_REMOVE_CONFIRM_DIALOG", value: false });
  }, []);

  return (
    <div className="space-y-4">
      {isLoadingIntegration ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : hasIntegration ? (
        <GitLabSettingsConnectedView
          isRemoving={state.isRemoving}
          onRemove={handleRemoveClick}
        />
      ) : (
        <GitLabSettingsSetupForm
          state={state}
          dispatch={dispatch}
          onValidate={handleValidate}
          onStore={handleStore}
          integrationError={integrationError}
        />
      )}

      <GitLabSettingsRemoveDialog
        open={state.showRemoveConfirmDialog}
        onOpenChange={(open) =>
          dispatch({ type: "SET_REMOVE_CONFIRM_DIALOG", value: open })
        }
        onConfirm={handleRemoveConfirmed}
        onCancel={handleRemoveCancelled}
      />
    </div>
  );
}
