/**
 * Zip Import Project Dialog Reducer
 *
 * State management for the ZIP project import dialog.
 */

import type { DetectCharactersResponse } from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

export type ImportStateStatus = "idle" | "uploading" | "success" | "error";

export interface ImportState {
  status: ImportStateStatus;
  message: string;
  result?: {
    filesImported: number;
    labelsCreated: number;
  };
  error?: string;
}

export interface ZipImportState {
  projectName: string;
  projectDescription: string;
  selectedFile: File | null;
  importState: ImportState;
  showCharacterWizard: boolean;
  detectedCharacters: DetectCharactersResponse | null;
  createdProject: { id: string } | null;
}

export type ZipImportAction =
  | { type: "SET_PROJECT_NAME"; value: string }
  | { type: "SET_PROJECT_DESCRIPTION"; value: string }
  | { type: "SET_SELECTED_FILE"; file: File | null }
  | { type: "SET_IMPORT_STATE"; importState: ImportState }
  | {
      type: "SET_CHARACTER_WIZARD";
      show: boolean;
      characters: DetectCharactersResponse | null;
      project: { id: string } | null;
    }
  | { type: "RESET" };

export const initialZipImportState: ZipImportState = {
  projectName: "",
  projectDescription: "",
  selectedFile: null,
  importState: { status: "idle", message: "" },
  showCharacterWizard: false,
  detectedCharacters: null,
  createdProject: null,
};

export function zipImportReducer(
  state: ZipImportState,
  action: ZipImportAction
): ZipImportState {
  switch (action.type) {
    case "SET_PROJECT_NAME":
      return { ...state, projectName: action.value };
    case "SET_PROJECT_DESCRIPTION":
      return { ...state, projectDescription: action.value };
    case "SET_SELECTED_FILE":
      return { ...state, selectedFile: action.file };
    case "SET_IMPORT_STATE":
      return { ...state, importState: action.importState };
    case "SET_CHARACTER_WIZARD":
      return {
        ...state,
        showCharacterWizard: action.show,
        detectedCharacters: action.characters,
        createdProject: action.project,
      };
    case "RESET":
      return initialZipImportState;
    default:
      return state;
  }
}
