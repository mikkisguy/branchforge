/**
 * Character Edit Dialog — shared types, reducer, and validation.
 */

import type { Character } from "@branchforge/shared";

export interface CharacterFormState {
  name: string;
  displayName: string;
  renpyTag: string;
  color: string;
  routeAffiliation: string;
  notes: string;
  conditionalPrefix: string;
  isLoveInterest: boolean;
  isNarrator: boolean;
  avatarUrl?: string;
  avatarFile?: File;
  avatarPreview?: string;
  removedAvatar?: boolean;
  nameError?: string;
  displayNameError?: string;
  renpyTagError?: string;
  colorError?: string;
  notesError?: string;
}

export type FormAction =
  | { type: "RESET_EXISTING"; char: Character }
  | { type: "RESET_NEW" }
  | { type: "SET_FIELD"; field: string; value: string | boolean }
  | { type: "SET_AVATAR_FILE"; file: File }
  | { type: "SET_AVATAR_PREVIEW"; preview: string }
  | { type: "REMOVE_AVATAR" }
  | { type: "SET_NAME_ERROR"; value: string }
  | { type: "SET_DISPLAY_NAME_ERROR"; value: string }
  | { type: "SET_RENPY_TAG_ERROR"; value: string }
  | { type: "SET_NOTES_ERROR"; value: string }
  | { type: "SET_COLOR_ERROR"; value: string };

export const INITIAL_EMPTY: CharacterFormState = {
  name: "",
  displayName: "",
  renpyTag: "",
  color: "#FF6B6B",
  routeAffiliation: "",
  notes: "",
  conditionalPrefix: "",
  isLoveInterest: false,
  isNarrator: false,
  avatarUrl: undefined,
  avatarFile: undefined,
  avatarPreview: undefined,
  removedAvatar: undefined,
  nameError: "",
  displayNameError: "",
  renpyTagError: "",
  colorError: "",
  notesError: "",
};

export function formReducer(
  state: CharacterFormState,
  action: FormAction
): CharacterFormState {
  switch (action.type) {
    case "RESET_EXISTING": {
      const char = action.char;
      return {
        ...INITIAL_EMPTY,
        name: char.name,
        displayName: char.displayName,
        renpyTag: char.renpyTag,
        color: char.color,
        routeAffiliation: char.routeAffiliation ?? "",
        notes: char.notes ?? "",
        conditionalPrefix: char.conditionalPrefix ?? "",
        isLoveInterest: char.isLoveInterest,
        isNarrator: char.isNarrator,
        avatarUrl: char.avatarUrl ?? undefined,
      };
    }
    case "RESET_NEW":
      return { ...INITIAL_EMPTY };
    case "SET_FIELD":
      return { ...state, [action.field]: action.value };
    case "SET_AVATAR_FILE":
      return {
        ...state,
        avatarFile: action.file,
        removedAvatar: undefined,
      };
    case "SET_AVATAR_PREVIEW":
      return { ...state, avatarPreview: action.preview };
    case "REMOVE_AVATAR":
      return {
        ...state,
        avatarUrl: undefined,
        avatarFile: undefined,
        avatarPreview: undefined,
        removedAvatar: true,
      };
    case "SET_NAME_ERROR":
      return { ...state, nameError: action.value };
    case "SET_DISPLAY_NAME_ERROR":
      return { ...state, displayNameError: action.value };
    case "SET_RENPY_TAG_ERROR":
      return { ...state, renpyTagError: action.value };
    case "SET_COLOR_ERROR":
      return { ...state, colorError: action.value };
    case "SET_NOTES_ERROR":
      return { ...state, notesError: action.value };
  }
}

export function validateForm(state: CharacterFormState): {
  valid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};

  if (!state.name.trim()) {
    errors.name = "Name is required";
  }
  if (!state.displayName.trim()) {
    errors.displayName = "Display name is required";
  }
  if (!state.renpyTag.trim()) {
    errors.renpyTag = "Tag is required";
  } else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(state.renpyTag)) {
    errors.renpyTag =
      "Tag must start with letter/underscore and contain only letters, numbers, and underscores";
  }
  if (!/^#[0-9A-Fa-f]{6}$/.test(state.color)) {
    errors.color = "Color must be valid hex (#RRGGBB)";
  }
  if (state.notes.length > 10000) {
    errors.notes = "Notes must be 10000 characters or fewer";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
