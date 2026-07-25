/**
 * Label Edit Dialog - Form State & Reducer
 *
 * State management for the label edit dialog form.
 */

// ============================================================================
// Types
// ============================================================================

export type FormState = {
  title: string;
  labelName: string;
  route: string;
  status: "DRAFT" | "REVIEW" | "FINAL";
  visibility: "EXCLUSIVE" | "SHARED" | "DUO_PAIR";
  duoPairId: string;
  titleError: string;
  labelNameError: string;
};

export type FormAction =
  | {
      type: "RESET";
      title: string;
      labelName: string;
      route: string;
      status: "DRAFT" | "REVIEW" | "FINAL";
      visibility: "EXCLUSIVE" | "SHARED" | "DUO_PAIR";
      duoPairId: string;
    }
  | { type: "SET_TITLE"; value: string }
  | { type: "SET_LABEL_NAME"; value: string }
  | { type: "SET_ROUTE"; value: string }
  | { type: "SET_STATUS"; value: "DRAFT" | "REVIEW" | "FINAL" }
  | { type: "SET_VISIBILITY"; value: "EXCLUSIVE" | "SHARED" | "DUO_PAIR" }
  | { type: "SET_DUO_PAIR_ID"; value: string }
  | { type: "SET_TITLE_ERROR"; value: string }
  | { type: "SET_LABEL_NAME_ERROR"; value: string };

// ============================================================================
// Constants
// ============================================================================

export const INITIAL_FORM_STATE: FormState = {
  title: "",
  labelName: "",
  route: "",
  status: "DRAFT",
  visibility: "EXCLUSIVE",
  duoPairId: "",
  titleError: "",
  labelNameError: "",
};

// ============================================================================
// Reducer
// ============================================================================

export function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case "RESET":
      return {
        title: action.title,
        labelName: action.labelName,
        route: action.route,
        status: action.status,
        visibility: action.visibility,
        duoPairId: action.duoPairId,
        titleError: "",
        labelNameError: "",
      };
    case "SET_TITLE":
      return {
        ...state,
        title: action.value,
        titleError: action.value ? state.titleError : "",
      };
    case "SET_LABEL_NAME":
      return {
        ...state,
        labelName: action.value,
        labelNameError: action.value ? state.labelNameError : "",
      };
    case "SET_ROUTE":
      return { ...state, route: action.value };
    case "SET_STATUS":
      return { ...state, status: action.value };
    case "SET_VISIBILITY":
      return { ...state, visibility: action.value };
    case "SET_DUO_PAIR_ID":
      return { ...state, duoPairId: action.value };
    case "SET_TITLE_ERROR":
      return { ...state, titleError: action.value };
    case "SET_LABEL_NAME_ERROR":
      return { ...state, labelNameError: action.value };
  }
}
