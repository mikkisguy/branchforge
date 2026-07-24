import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineMessage } from "@/components/ui/inline-error";
import { SettingsSection } from "@/components/ide-shared/SettingsLayout";
import type {
  SettingsState,
  SettingsAction,
} from "./GitLabSettingsContentReducer";

interface GitLabSettingsSetupFormProps {
  state: SettingsState;
  dispatch: React.Dispatch<SettingsAction>;
  onValidate: () => void;
  onStore: () => void;
  integrationError: Error | null;
}

export function GitLabSettingsSetupForm({
  state,
  dispatch,
  onValidate,
  onStore,
  integrationError,
}: GitLabSettingsSetupFormProps) {
  return (
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
              type="button"
              variant="outline"
              onClick={onValidate}
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
              type="button"
              onClick={onStore}
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
  );
}
