/**
 * GitLab Import Dialog Reducer
 *
 * State management for the multi-step GitLab import dialog.
 */

import type { GitLabRepository } from "@/lib/api/gitlab";
import type { DetectCharactersResponse } from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

export type ImportStateStatus =
  "idle" | "selecting" | "importing" | "success" | "error";

export interface ImportState {
  status: ImportStateStatus;
  message: string;
}

// ============================================================================
// Reducer State & Actions
// ============================================================================

export interface DialogState {
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

export type DialogAction =
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

export const initialDialogState: DialogState = {
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

export function dialogReducer(
  state: DialogState,
  action: DialogAction
): DialogState {
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
