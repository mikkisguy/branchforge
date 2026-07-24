/**
 * Zip Import Files Dialog Reducer
 *
 * State management for the zip file import dialog.
 */

import type { DetectCharactersResponse } from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

export interface ImportState {
  status: "idle" | "uploading" | "processing" | "success" | "error";
  progress: number; // 0-100
  message: string;
  result?: {
    filesImported: number;
    filesUpdated: number;
    filesSkipped: number;
    labelsCreated: number;
  };
  error?: string;
}

// ============================================================================
// Reducer
// ============================================================================

export interface ZipImportState {
  selectedFile: File | null;
  importState: ImportState;
  showCharacterWizard: boolean;
  detectedCharacters: DetectCharactersResponse | null;
}

export type ZipImportAction =
  | { type: "RESET" }
  | { type: "SET_SELECTED_FILE"; file: File | null }
  | { type: "SET_IMPORT_STATE"; importState: ImportState }
  | { type: "UPDATE_UPLOAD_PROGRESS"; progress: number; message: string }
  | { type: "SET_SHOW_CHARACTER_WIZARD"; show: boolean }
  | {
      type: "SET_DETECTED_CHARACTERS";
      characters: DetectCharactersResponse | null;
    }
  | { type: "CHARACTERS_DETECTED"; characters: DetectCharactersResponse }
  | { type: "RESET_FILE_AND_IMPORT" };

export const initialZipImportState: ZipImportState = {
  selectedFile: null,
  importState: { status: "idle", progress: 0, message: "" },
  showCharacterWizard: false,
  detectedCharacters: null,
};

export function zipImportReducer(
  state: ZipImportState,
  action: ZipImportAction
): ZipImportState {
  switch (action.type) {
    case "RESET":
      return initialZipImportState;
    case "SET_SELECTED_FILE":
      return { ...state, selectedFile: action.file };
    case "SET_IMPORT_STATE":
      return { ...state, importState: action.importState };
    case "UPDATE_UPLOAD_PROGRESS":
      return {
        ...state,
        importState: {
          ...state.importState,
          status: "uploading",
          progress: action.progress,
          message: action.message,
        },
      };
    case "SET_SHOW_CHARACTER_WIZARD":
      return { ...state, showCharacterWizard: action.show };
    case "SET_DETECTED_CHARACTERS":
      return { ...state, detectedCharacters: action.characters };
    case "CHARACTERS_DETECTED":
      return {
        ...state,
        detectedCharacters: action.characters,
        showCharacterWizard: true,
      };
    case "RESET_FILE_AND_IMPORT":
      return {
        ...state,
        selectedFile: null,
        importState: { status: "idle", progress: 0, message: "" },
      };
    default:
      return state;
  }
}
