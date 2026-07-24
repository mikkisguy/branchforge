/**
 * GitLab Sync Dialog — Reducer
 *
 * State management for sync form fields:
 * branch, commit message, conflict resolution, character wizard.
 */

import type { ConflictResolution } from "@/lib/api/gitlab";
import type { DetectCharactersResponse } from "@/lib/api/characters";

// ============================================================================
// Types
// ============================================================================

export type SyncOperationType = "export" | "import";

export interface SyncFormState {
  userBranch: string | null;
  commitMessage: string;
  conflictResolution: ConflictResolution;
  showCharacterWizard: boolean;
  detectedCharacters: DetectCharactersResponse | null;
}

export type SyncFormAction =
  | { type: "SET_USER_BRANCH"; value: string | null }
  | { type: "SET_COMMIT_MESSAGE"; value: string }
  | { type: "SET_CONFLICT_RESOLUTION"; value: ConflictResolution }
  | {
      type: "SET_CHARACTER_WIZARD";
      show: boolean;
      characters: DetectCharactersResponse | null;
    };

export function createInitialSyncFormState(
  operationType: SyncOperationType
): SyncFormState {
  return {
    userBranch: null,
    commitMessage: `Sync ${operationType} from BranchForge`,
    conflictResolution: "branchforge_wins",
    showCharacterWizard: false,
    detectedCharacters: null,
  };
}

export function syncFormReducer(
  state: SyncFormState,
  action: SyncFormAction
): SyncFormState {
  switch (action.type) {
    case "SET_USER_BRANCH":
      return { ...state, userBranch: action.value };
    case "SET_COMMIT_MESSAGE":
      return { ...state, commitMessage: action.value };
    case "SET_CONFLICT_RESOLUTION":
      return { ...state, conflictResolution: action.value };
    case "SET_CHARACTER_WIZARD":
      return {
        ...state,
        showCharacterWizard: action.show,
        detectedCharacters: action.characters,
      };
    default:
      return state;
  }
}
