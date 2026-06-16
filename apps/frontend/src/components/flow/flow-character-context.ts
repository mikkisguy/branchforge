/**
 * FlowCharacterContext
 *
 * The React context object is declared in its own file so the provider
 * component (which contains JSX) can live in a `.tsx` file that only exports
 * components. This keeps `react-refresh/only-export-components` happy.
 *
 * Consumers should import `useFlowCharacters` from `./use-flow-characters`
 * rather than reading the context directly.
 */

import { createContext } from "react";
import type { CharacterAppearance } from "./LabelNode";

export interface FlowCharacterLookup {
  /**
   * Resolve an array of character IDs into display-ready appearances.
   * Unknown IDs are silently skipped. Returns a stable empty array when no
   * IDs resolve (so callers can use it without null-checks).
   */
  resolve: (characterIds: readonly string[]) => readonly CharacterAppearance[];
}

const noopLookup: FlowCharacterLookup = {
  resolve: () => [],
};

export const FlowCharacterContext =
  createContext<FlowCharacterLookup>(noopLookup);
