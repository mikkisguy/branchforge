import { useMemo, useCallback, useRef, useEffect } from "react";
import type { LabelDetail } from "@branchforge/shared";
import type { DialogueEntry } from "../lib/prose-types";

interface UseTechnicalInfoResult {
  getTechnicalInfoForLine: (entryId: string) => DialogueEntry["technicalInfo"];
}

type CachedInfo = {
  value: DialogueEntry["technicalInfo"];
  /** JSON stability key derived from the source line fields */
  key: string;
};

/**
 * Compute a stability key from the line fields that affect technicalInfo.
 * When the key matches the cached key, the previously-built object is
 * returned so shallow-reference equality is preserved and memoized
 * children are not forced to re-render.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSourceKey(line: any): string {
  return JSON.stringify({
    menuOptions: line.menuOptions,
    contentType: line.contentType,
    content: line.content,
    conditions: line.conditions,
    visualStatements: line.visualStatements,
  });
}

/**
 * Hook to extract technical info from label lines and transform into badge data format.
 * This hook processes LabelLine objects and returns technicalInfo matching the DialogueEntry type.
 *
 * Results are cached per entryId and returned with stable reference identity
 * across renders as long as the underlying line data hasn't changed,
 * preventing unnecessary re-renders of memoized children.
 */
export function useTechnicalInfo(
  activeLabel: LabelDetail | undefined
): UseTechnicalInfoResult {
  // Map is stable across renders — useMemo ensures identity for the same lines array
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const labelById = useMemo(() => {
    if (!activeLabel?.lines) return new Map();

    return new Map(activeLabel.lines.map((line) => [line.id, line]));
  }, [activeLabel?.lines]);

  // Cache computed technicalInfo objects keyed by entryId.
  // Using useRef avoids triggering re-renders when the cache is updated.
  const cacheRef = useRef<Map<string, CachedInfo>>(new Map());

  // Clear cache when the active label changes to avoid unbounded growth.
  // ProseEditor stays mounted across label switches, so stale entries
  // would otherwise accumulate indefinitely.
  const labelId = activeLabel?.id;
  useEffect(() => {
    cacheRef.current = new Map();
  }, [labelId]);

  const getTechnicalInfoForLine = useCallback(
    (entryId: string): DialogueEntry["technicalInfo"] => {
      const line = labelById.get(entryId);
      if (!line) {
        // Clean stale cache entries for deleted lines
        cacheRef.current.delete(entryId);
        return undefined;
      }

      const sourceKey = buildSourceKey(line);
      const cached = cacheRef.current.get(entryId);

      // Return cached object reference when source data is semantically identical
      if (cached && cached.key === sourceKey) {
        return cached.value;
      }

      // Build fresh technical info
      const info: DialogueEntry["technicalInfo"] = {};

      // Parse menu choices
      if (line.menuOptions && line.menuOptions.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        info.choices = line.menuOptions.map((choice: any) => ({
          label: choice.label,
          targetLabelId: choice.targetLabelId,
          targetLabelName: choice.targetLabelId, // TODO: Resolve to actual label name
          effects: choice.effects,
        }));
      }

      // Parse jump target
      if (line.contentType === "JUMP" && line.content) {
        const jumpTargetMatch = line.content.match(/jump\s+(\w+)/);
        if (jumpTargetMatch) {
          info.jumpTarget = {
            labelId: "", // TODO: Resolve from target
            labelName: jumpTargetMatch[1],
          };
        }
      }

      // Parse conditions
      if (line.conditions) {
        info.conditions = line.conditions;
      }

      // Parse visuals
      if (line.visualStatements && line.visualStatements.length > 0) {
        info.visuals = line.visualStatements;
      }

      const result = Object.keys(info).length > 0 ? info : undefined;
      cacheRef.current.set(entryId, { value: result, key: sourceKey });
      return result;
    },
    [labelById]
  );

  return { getTechnicalInfoForLine };
}
