/**
 * GitLab Settings Content
 *
 * Content component for the Integrations tab in SettingsModal.
 * Handles PAT input, validation, and integration management.
 * Repository linking is now handled in the import flow, not here.
 */

import { useState, useCallback } from "react";
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

  // Dialog state
  const [showRemoveConfirmDialog, setShowRemoveConfirmDialog] = useState(false);

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
          `Token validated successfully for ${result.username || "user"}`
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

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="space-y-4">
      {isLoadingIntegration ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
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
                value={gitlabUrl}
                onChange={(e) => setGitlabUrl(e.target.value)}
                disabled={isStoring}
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
                    type={showToken ? "text" : "password"}
                    placeholder="glpat-example-token-replace-with-real-one"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    disabled={isStoring}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showToken ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Required scopes:{" "}
                  <code className="bg-muted px-1 py-0.5 rounded">read_api</code>
                  ,{" "}
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
          </SettingsSection>
        </div>
      )}

      {/* Remove Confirmation Dialog */}
      <Dialog
        open={showRemoveConfirmDialog}
        onOpenChange={setShowRemoveConfirmDialog}
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
