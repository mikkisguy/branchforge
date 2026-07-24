/**
 * State, actions, reducer, and initial state for GitLabSettingsContent.
 */

export interface SettingsState {
  token: string;
  gitlabUrl: string;
  showToken: boolean;
  isValidating: boolean;
  isStoring: boolean;
  isRemoving: boolean;
  validationResult: { valid: boolean; username?: string } | null;
  showRemoveConfirmDialog: boolean;
}

export type SettingsAction =
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

export const initialSettingsState: SettingsState = {
  token: "",
  gitlabUrl: "https://gitlab.com",
  showToken: false,
  isValidating: false,
  isStoring: false,
  isRemoving: false,
  validationResult: null,
  showRemoveConfirmDialog: false,
};

export function settingsReducer(
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
