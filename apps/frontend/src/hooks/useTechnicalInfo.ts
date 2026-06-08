import { useMemo, useCallback, useRef, useEffect } from "react";
import type { LabelDetail, LabelLine } from "@branchforge/shared";
import type { DialogueEntry } from "../lib/prose-types";
import type { ComparisonOperator, StatCondition } from "@branchforge/shared";

interface UseTechnicalInfoResult {
  getTechnicalInfoForLine: (entryId: string) => DialogueEntry["technicalInfo"];
}

type CachedInfo = {
  value: DialogueEntry["technicalInfo"];
  /** JSON stability key derived from the source line fields */
  key: string;
};

const DEFAULT_OPERATOR: ComparisonOperator = ">=";

function normalizeStatCondition(value: number | StatCondition): StatCondition {
  return typeof value === "number"
    ? { value, operator: DEFAULT_OPERATOR }
    : value;
}

function normalizeConditions(
  conditions: LabelDetail["lines"][number]["conditions"]
) {
  if (!conditions?.stats) return conditions || undefined;
  const stats: Record<string, StatCondition> = {};
  for (const [key, value] of Object.entries(conditions.stats)) {
    stats[key] = normalizeStatCondition(value as number | StatCondition);
  }
  return { ...conditions, stats };
}

/**
 * Build technical info from a single line into the info accumulator.
 */
function buildLineInfo(
  line: LabelLine,
  info: NonNullable<DialogueEntry["technicalInfo"]>
) {
  // Parse menu choices
  if (line.menuOptions && line.menuOptions.length > 0) {
    info.choices = [
      ...(info.choices || []),
      ...line.menuOptions.map((choice) => ({
        label: choice.label,
        targetLabelId: choice.targetLabelId,
        targetLabelName: choice.targetLabelName,
        conditionFlags: choice.conditionFlags,
        effects: choice.effects,
      })),
    ];
  }

  // Parse jump target from content (extract label name)
  if (line.contentType === "JUMP" && line.content) {
    const jumpTargetMatch = line.content.match(/jump\s+(\w+)/);
    if (jumpTargetMatch) {
      info.jumpTarget = {
        labelName: jumpTargetMatch[1],
        labelId: "", // Jumps are parsed from content, resolved label ID would need backend support
      };
    }
  }

  // Parse conditions
  if (line.conditions) {
    info.conditions = normalizeConditions(line.conditions);
  }

  // Parse visuals
  if (line.visualStatements && line.visualStatements.length > 0) {
    info.visuals = [...(info.visuals || []), ...line.visualStatements];
  }
}

/**
 * Compute a stability key from the line fields that affect technicalInfo.
 * When the key matches the cached key, the previously-built object is
 * returned so shallow-reference equality is preserved and memoized
 * children are not forced to re-render.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSourceKey(line: any, adjacentLines?: any[]): string {
  const main = {
    menuOptions: line.menuOptions,
    contentType: line.contentType,
    content: line.content,
    conditions: line.conditions,
    visualStatements: line.visualStatements,
  };

  if (!adjacentLines || adjacentLines.length === 0) {
    return JSON.stringify(main);
  }

  return JSON.stringify({
    main,
    adjacent: adjacentLines.map((l) => ({
      menuOptions: l.menuOptions,
      contentType: l.contentType,
      content: l.content,
      conditions: l.conditions,
      visualStatements: l.visualStatements,
    })),
  });
}

/**
 * Hook to extract technical info from label lines and transform into badge data format.
 * This hook processes LabelLine objects and returns technicalInfo matching the DialogueEntry type.
 *
 * For DIALOGUE/NARRATION lines, it also aggregates technical info from adjacent structural
 * lines (MENU, JUMP, CHOICE) that immediately follow, until the next DIALOGUE/NARRATION line.
 * This allows technical badges (choices, jumps, conditions, visuals) to appear on the
 * dialogue line they logically belong to, even though the backend stores them as separate lines.
 *
 * Results are cached per entryId and returned with stable reference identity
 * across renders as long as the underlying line data hasn't changed,
 * preventing unnecessary re-renders of memoized children.
 */
export function useTechnicalInfo(
  activeLabel: LabelDetail | undefined
): UseTechnicalInfoResult {
  const lines = activeLabel?.lines;

  // Map is stable across renders — useMemo ensures identity for the same lines array
   
  const labelById = useMemo(() => {
    if (!lines) return new Map<string, LabelLine>();

    return new Map(lines.map((line) => [line.id, line]));
  }, [lines]);

  // Memoized lines array for finding adjacent structural lines
  const linesArray = useMemo(() => lines ?? [], [lines]);

  const lineIndexMap = useMemo(() => {
    if (!lines) return new Map<string, number>();
    return new Map(lines.map((line, index) => [line.id, index]));
  }, [lines]);

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

      // Collect adjacent structural lines (MENU, JUMP, CHOICE) that follow
      // this line until we hit another DIALOGUE/NARRATION line. These carry
      // technical metadata (menuOptions, jump targets, conditions, visuals)
      // that should be displayed as badges on the preceding dialogue line.
      const adjacentStructural: LabelLine[] = [];
      const lineIndex = lineIndexMap.get(entryId);
      if (lineIndex !== undefined) {
        for (let i = lineIndex + 1; i < linesArray.length; i++) {
          const nextLine = linesArray[i];
          if (
            nextLine.contentType === "DIALOGUE" ||
            nextLine.contentType === "NARRATION"
          ) {
            break;
          }
          adjacentStructural.push(nextLine);
        }
      }

      const sourceKey = buildSourceKey(line, adjacentStructural);
      const cached = cacheRef.current.get(entryId);

      // Return cached object reference when source data is semantically identical
      if (cached && cached.key === sourceKey) {
        return cached.value;
      }

      // Build fresh technical info from this line + adjacent structural lines
      const info: NonNullable<DialogueEntry["technicalInfo"]> = {};

      // Parse technical info from the dialogue/narration line itself
      buildLineInfo(line, info);

      // Aggregate from adjacent structural lines (MENU, JUMP, CHOICE, etc.)
      for (const adjLine of adjacentStructural) {
        buildLineInfo(adjLine, info);
      }

      const result = Object.keys(info).length > 0 ? info : undefined;
      cacheRef.current.set(entryId, { value: result, key: sourceKey });
      return result;
    },
    [labelById, lineIndexMap, linesArray]
  );

  return { getTechnicalInfoForLine };
}
