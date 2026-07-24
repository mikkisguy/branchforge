/**
 * Conflict Review Dialog — Reducer
 *
 * State management for the conflict review dialog:
 * navigation, resolution tracking, and fetch state.
 */

import type { ConflictInfo } from "@/lib/api/gitlab";

// ============================================================================
// Types
// ============================================================================

export interface ConflictState {
  currentIndex: number;
  resolutions: Map<string, "local" | "remote" | "skip">;
  isLoading: boolean;
  conflicts: ConflictInfo[];
  fetchError: string | null;
}

export type ConflictAction =
  | { type: "DECREMENT_INDEX" }
  | { type: "INCREMENT_INDEX" }
  | {
      type: "SET_RESOLUTION";
      label: string;
      choice: "local" | "remote" | "skip";
    }
  | { type: "SET_LOADING"; isLoading: boolean }
  | { type: "SET_CONFLICTS"; conflicts: ConflictInfo[] }
  | { type: "SET_FETCH_ERROR"; error: string | null }
  | { type: "RESET_FOR_NEW_FETCH" }
  | { type: "FETCH_SUCCESS"; conflicts: ConflictInfo[] }
  | { type: "FETCH_ERROR"; error: string }
  | { type: "LOAD_MOCK"; conflicts: ConflictInfo[] };

export const initialConflictState: ConflictState = {
  currentIndex: 0,
  resolutions: new Map(),
  isLoading: false,
  conflicts: [],
  fetchError: null,
};

export function conflictReducer(
  state: ConflictState,
  action: ConflictAction
): ConflictState {
  switch (action.type) {
    case "DECREMENT_INDEX":
      return { ...state, currentIndex: Math.max(0, state.currentIndex - 1) };
    case "INCREMENT_INDEX":
      return {
        ...state,
        currentIndex: Math.min(
          state.conflicts.length - 1,
          state.currentIndex + 1
        ),
      };
    case "SET_RESOLUTION": {
      const next = new Map(state.resolutions);
      next.set(action.label, action.choice);
      return { ...state, resolutions: next };
    }
    case "SET_LOADING":
      return { ...state, isLoading: action.isLoading };
    case "SET_CONFLICTS":
      return { ...state, conflicts: action.conflicts };
    case "SET_FETCH_ERROR":
      return { ...state, fetchError: action.error };
    case "RESET_FOR_NEW_FETCH":
      return { ...state, isLoading: true, fetchError: null };
    case "FETCH_SUCCESS":
      return {
        ...state,
        isLoading: false,
        conflicts: action.conflicts,
        currentIndex: 0,
        resolutions: new Map(),
      };
    case "FETCH_ERROR":
      return {
        ...state,
        isLoading: false,
        fetchError: action.error,
        conflicts: [],
      };
    case "LOAD_MOCK":
      return {
        ...state,
        conflicts: action.conflicts,
        currentIndex: 0,
        resolutions: new Map(),
        fetchError: null,
      };
    default:
      return state;
  }
}
