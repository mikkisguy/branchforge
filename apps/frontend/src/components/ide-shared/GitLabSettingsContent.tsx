/**
 * GitLab Settings Content
 *
 * Content component for the Integrations tab in SettingsModal.
 * Handles PAT input, validation, and integration management.
 * Repository linking is now handled in the import flow, not here.
 */

import { useReducer, useCallback } from "react";
import { Eye, EyeOff, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineMessage } from "@/components/ui/inline-error";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { SettingsSection } from "@/components/ide-shared/SettingsLayout";
import { useGitLab } from "@/hooks/useGitLab";
import { useToast } from "@/contexts/ToastContext";

// ============================================================================
// Types and Reducer
// ============================================================================

interface SettingsState {
  token: string;
  gitlabUrl: string;
  showToken: boolean;
  isValidating: boolean;
  isStoring: boolean;
  isRemoving: boolean;
  validationResult: { valid: boolean; username?: string } | null;
  showRemoveConfirmDialog: boolean;
}

type SettingsAction =
  | { type: "SET_TOKEN"; value: string }
  | { type: "SET_GITLAB_URL"; value: string }
  | { type: "TOGGLE_SHOW_TOKEN" }
  | { type: "SET_VALIDATING"; value: boolean }
  | { type: "SET_STORING"; value: boolean }
  | { type: "SET_REMOVING"; value: boolean }
  | {
      type: "SET_VALIDATION_RESULT";
      result: { valid: boolean; username?: string } | null;
    }
  | { type: "SET_REMOVE_CONFIRM_DIALOG"; value: boolean }
  | { type: "RESET_FORM" };

const initialSettingsState: SettingsState = {
  token: "",
  gitlabUrl: "https://gitlab.com",
  showToken: false,
  isValidating: false,
  isStoring: false,
  isRemoving: false,
  validationResult: null,
  showRemoveConfirmDialog: false,
};

function settingsReducer(
  state: SettingsState,
  action: SettingsAction
): SettingsState {
  switch (action.type) {
    case "SET_TOKEN":
      return { ...state, token: action.value, validationResult: null };
    case "SET_GITLAB_URL":
      return { ...state, gitlabUrl: action.value, validationResult: null };
    case "TOGGLE_SHOW_TOKEN":
      return { ...state, showToken: !state.showToken };
    case "SET_VALIDATING":
      return { ...state, isValidating: action.value };
    case "SET_STORING":
      return { ...state, isStoring: action.value };
    case "SET_REMOVING":
      return { ...state, isRemoving: action.value };
    case "SET_VALIDATION_RESULT":
      return { ...state, validationResult: action.result };
    case "SET_REMOVE_CONFIRM_DIALOG":
      return { ...state, showRemoveConfirmDialog: action.value };
    case "RESET_FORM":
      return {
        ...state,
        token: "",
        gitlabUrl: "https://gitlab.com",
        validationResult: null,
      };
    default:
      return state;
  }
}

// ============================================================================
// Component
// ============================================================================

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

  // Form state
  const [state, dispatch] = useReducer(settingsReducer, initialSettingsState);

  /**
   * Validate token
   */
  const handleValidate = useCallback(async () => {
    if (!state.token.trim()) {
      error("Token is required");
      return;
    }

    dispatch({ type: "SET_VALIDATING", value: true });
    dispatch({ type: "SET_VALIDATION_RESULT", result: null });

    try {
      const result = await validateToken(state.token, state.gitlabUrl);
      dispatch({ type: "SET_VALIDATION_RESULT", result: result });
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

  /**
   * Store token
   */
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

  /**
   * Show remove confirmation dialog
   */
  const handleRemoveClick = useCallback(() => {
    dispatch({ type: "SET_REMOVE_CONFIRM_DIALOG", value: true });
  }, []);

  /**
   * Remove integration (called after user confirms)
   */
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

  /**
   * Cancel removal
   */
  const handleRemoveCancelled = useCallback(() => {
    dispatch({ type: "SET_REMOVE_CONFIRM_DIALOG", value: false });
  }, []);

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="space-y-4">
      {isLoadingIntegration ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : hasIntegration ? (
        // Has integration - show status and remove option
        <div className="space-y-3">
          <SettingsSection title="Connection Status">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">GitLab connected</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Your integration is active and ready to import projects.
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleRemoveClick}
                disabled={state.isRemoving}
              >
                {state.isRemoving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                <span className="ml-2">Remove</span>
              </Button>
            </div>
          </SettingsSection>
        </div>
      ) : (
        // No integration - show token input form
        <div className="space-y-3">
          <SettingsSection title="GitLab Configuration">
            <div className="space-y-2">
              <Label htmlFor="gitlab-url">GitLab URL</Label>
              <Input
                id="gitlab-url"
                type="url"
                placeholder="https://gitlab.com"
                value={state.gitlabUrl}
                onChange={(e) =>
                  dispatch({ type: "SET_GITLAB_URL", value: e.target.value })
                }
                disabled={state.isStoring}
              />
              <p className="text-xs text-muted-foreground">
                Leave default for gitlab.com or provide your self-hosted URL.
              </p>
            </div>
          </SettingsSection>

          <SettingsSection title="Personal Access Token">
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="token">Access Token</Label>
                <div className="relative">
                  <Input
                    id="token"
                    type={state.showToken ? "text" : "password"}
                    placeholder="paste-your-token-here"
                    value={state.token}
                    onChange={(e) =>
                      dispatch({ type: "SET_TOKEN", value: e.target.value })
                    }
                    disabled={state.isStoring}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => dispatch({ type: "TOGGLE_SHOW_TOKEN" })}
                    className="absolute right-1 top-1/2 size-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {state.showToken ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Required scopes:{" "}
                  <code className="bg-muted px-1 py-0.5 rounded">api</code>,{" "}
                  <code className="bg-muted px-1 py-0.5 rounded">
                    read_repository
                  </code>
                  , and{" "}
                  <code className="bg-muted px-1 py-0.5 rounded">
                    write_repository
                  </code>
                  .
                </p>
              </div>

              {state.validationResult && (
                <InlineMessage
                  variant={state.validationResult.valid ? "success" : "error"}
                >
                  {state.validationResult.valid
                    ? `Validated for ${state.validationResult.username || "user"}`
                    : "Invalid token"}
                </InlineMessage>
              )}

              {integrationError && (
                <InlineMessage variant="error">
                  {integrationError instanceof Error
                    ? integrationError.message
                    : String(integrationError)}
                </InlineMessage>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleValidate}
                  disabled={
                    !state.token.trim() || state.isValidating || state.isStoring
                  }
                  className="flex-1"
                >
                  {state.isValidating ? (
                    <Loader2 className="size-4 animate-spin mr-2" />
                  ) : null}
                  Validate
                </Button>
                <Button
                  onClick={handleStore}
                  disabled={
                    !state.token.trim() ||
                    state.validationResult?.valid !== true ||
                    state.isStoring ||
                    state.isValidating
                  }
                  className="flex-1"
                >
                  {state.isStoring ? (
                    <Loader2 className="size-4 animate-spin mr-2" />
                  ) : null}
                  Save Integration
                </Button>
              </div>
            </div>
          </SettingsSection>
        </div>
      )}

      {/* Remove Confirmation Dialog */}
      <Dialog
        open={state.showRemoveConfirmDialog}
        onOpenChange={(open) =>
          dispatch({ type: "SET_REMOVE_CONFIRM_DIALOG", value: open })
        }
      >
        <DialogContent className="max-w-md w-full p-0 gap-0">
          {/* Header */}
          <div className="p-6">
            <DialogTitle className="text-lg font-medium">
              Remove GitLab Integration
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground mt-1">
              Are you sure you want to remove your GitLab integration? This will
              remove your credentials but will not affect existing imported
              projects.
            </DialogDescription>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-border/30 flex justify-end gap-2">
            <Button variant="outline" onClick={handleRemoveCancelled}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemoveConfirmed}>
              Remove Integration
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
