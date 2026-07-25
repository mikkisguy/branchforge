/**
 * useFlowCharacters Hook
 *
 * Access the character lookup provided by the nearest `FlowCharacterProvider`.
 * Falls back to a no-op resolver when used outside a provider (defensive —
 * the tooltip simply shows "None" for characters).
 */

import { use } from "react";
import {
  FlowCharacterContext,
  type FlowCharacterLookup,
} from "./flow-character-context";

export function useFlowCharacters(): FlowCharacterLookup {
  return use(FlowCharacterContext);
}
