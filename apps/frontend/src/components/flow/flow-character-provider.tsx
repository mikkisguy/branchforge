/**
 * FlowCharacterProvider
 *
 * Provides a character-id → display-info lookup so that LabelNode can resolve
 * character appearances **lazily** — only when its tooltip is hovered — rather
 * than eagerly resolving every node's characters on each data refresh.
 *
 * For large projects (100+ labels) eager resolution meant building a
 * `Map<nodeId, CharacterAppearance[]>` for the entire graph every time nodes
 * or characters changed, and storing the resolved array on every node's data
 * object (which also slowed the node-diff effect). With this context the
 * expensive work happens once for the one hovered node, not for all of them.
 */

import { useMemo, type ReactNode } from "react";
import type { Character } from "@branchforge/shared";
import type { CharacterAppearance } from "./LabelNode";
import {
  FlowCharacterContext,
  type FlowCharacterLookup,
} from "./flow-character-context";

export function FlowCharacterProvider({
  characters,
  children,
}: {
  characters: Character[];
  children: ReactNode;
}) {
  const value = useMemo<FlowCharacterLookup>(() => {
    const map = new Map<string, Character>();
    for (const c of characters) map.set(c.id, c);
    return {
      resolve(characterIds: readonly string[]): CharacterAppearance[] {
        const resolved: CharacterAppearance[] = [];
        for (const id of characterIds) {
          const c = map.get(id);
          if (c) {
            resolved.push({
              id: c.id,
              name: c.displayName || c.name,
              color: c.color,
              avatarUrl: c.avatarUrl,
            });
          }
        }
        return resolved;
      },
    };
  }, [characters]);

  return (
    <FlowCharacterContext.Provider value={value}>
      {children}
    </FlowCharacterContext.Provider>
  );
}
