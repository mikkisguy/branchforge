/**
 * GitLab Import Dialog - Repository Selection Step
 *
 * Step where the user configures project details and selects a GitLab repository.
 */

import { Loader2, GitFork, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { GitLabRepository } from "@/lib/api/gitlab";
import type { DialogAction } from "./GitLabImportDialogReducer";

interface GitLabImportDialogStepSelectProps {
  projectName: string;
  projectDescription: string;
  searchQuery: string;
  selectedRepository: GitLabRepository | null;
  isLoadingRepos: boolean;
  filteredRepositories: GitLabRepository[];
  branch: string;
  dispatch: React.Dispatch<DialogAction>;
  onImport: () => void;
}

export function GitLabImportDialogStepSelect({
  projectName,
  projectDescription,
  searchQuery,
  selectedRepository,
  isLoadingRepos,
  filteredRepositories,
  branch,
  dispatch,
  onImport,
}: GitLabImportDialogStepSelectProps) {
  return (
    <div className="space-y-4">
      {/* Project details */}
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="gitlab-project-name">Project name *</Label>
          <Input
            id="gitlab-project-name"
            value={projectName}
            onChange={(e) =>
              dispatch({
                type: "SET_PROJECT_NAME",
                payload: e.target.value,
              })
            }
            placeholder="My Visual Novel"
            maxLength={200}
            aria-required="true"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="gitlab-project-description">Description</Label>
          <Textarea
            id="gitlab-project-description"
            value={projectDescription}
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
        <Label htmlFor="gitlab-repo-search">Search repositories</Label>
        <Input
          id="gitlab-repo-search"
          placeholder="Search repositories..."
          value={searchQuery}
          onChange={(e) =>
            dispatch({
              type: "SET_SEARCH_QUERY",
              payload: e.target.value,
            })
          }
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
          // react-doctor-disable-next-line react-doctor/prefer-tag-over-role
          role="listbox"
          aria-label="GitLab repository"
          aria-required="true"
          className="border rounded-lg max-h-[200px] overflow-y-auto"
        >
          {filteredRepositories.map((repo) => (
            <button
              key={repo.id}
              type="button"
              role="option"
              aria-selected={selectedRepository?.id === repo.id}
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
        onClick={onImport}
        disabled={!selectedRepository || !projectName.trim()}
        className="w-full"
      >
        <GitFork className="mr-2 size-4" />
        Import Project
      </Button>

      {/* Info */}
      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="size-4 mt-0.5 flex-shrink-0" />
        <p>
          This will create a new project and import all .rpy files from the
          selected GitLab repository. Existing local changes will take
          precedence over remote changes.
        </p>
      </div>
    </div>
  );
}
