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
 * @param line - The label line to process
 * @param info - The accumulator for technical info
 * @param skipMenuChoices - When true, skip aggregating menuOptions into choices
 *   (used when choices are rendered as inline entries in the prose editor)
 */
function buildLineInfo(
  line: LabelLine,
  info: NonNullable<DialogueEntry["technicalInfo"]>,
  skipMenuChoices = false
) {
  // Parse menu choices — skip when choices are shown as inline entries
  if (!skipMenuChoices && line.menuOptions && line.menuOptions.length > 0) {
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

/** The subset of LabelLine fields that influence the technicalInfo source key */
type SourceKeyLine = Pick<
  LabelLine,
  "menuOptions" | "contentType" | "content" | "conditions" | "visualStatements"
>;

/**
 * Compute a stability key from the line fields that affect technicalInfo.
 * When the key matches the cached key, the previously-built object is
 * returned so shallow-reference equality is preserved and memoized
 * children are not forced to re-render.
 *
 * Both forward-adjacent structural lines and backward-adjacent VISUAL
 * neighbors influence the resolved technicalInfo, so both groups are
 * included in the key.
 */
function buildSourceKey(
  line: SourceKeyLine,
  adjacentLines?: SourceKeyLine[],
  backwardLines?: SourceKeyLine[]
): string {
  const mapLine = (l: SourceKeyLine) => ({
    menuOptions: l.menuOptions,
    contentType: l.contentType,
    content: l.content,
    conditions: l.conditions,
    visualStatements: l.visualStatements,
  });
  const main = {
    menuOptions: line.menuOptions,
    contentType: line.contentType,
    content: line.content,
    conditions: line.conditions,
    visualStatements: line.visualStatements,
  };

  const hasForward = !!adjacentLines && adjacentLines.length > 0;
  const hasBackward = !!backwardLines && backwardLines.length > 0;

  if (!hasForward && !hasBackward) {
    return JSON.stringify(main);
  }

  return JSON.stringify({
    main,
    adjacent: hasForward ? adjacentLines!.map(mapLine) : undefined,
    backwardVisuals: hasBackward ? backwardLines!.map(mapLine) : undefined,
  });
}

/**
 * Hook to extract technical info from label lines and transform into badge data format.
 * This hook processes LabelLine objects and returns technicalInfo matching the DialogueEntry type.
 *
 * Technical metadata is attached in two intentional directions:
 *
 * - Forward: For DIALOGUE/NARRATION lines, it aggregates technical info from adjacent
 *   structural lines (MENU, JUMP, CHOICE) that immediately follow, until the next
 *   DIALOGUE/NARRATION line. JUMP targets, menu choices and conditions are authored on
 *   separate rows but logically belong to the prose line they precede, so they surface
 *   as badges on the preceding dialogue/narration line.
 * - Backward: VISUAL rows emitted by the parser/database precede the prose line they
 *   affect. A contiguous block of VISUAL rows immediately before a DIALOGUE/NARRATION
 *   line attaches to that following prose line. VISUAL rows are therefore excluded
 *   from the forward structural scan so they are never attached to the preceding
 *   prose line (which would otherwise double-count or mis-attach scene/show/hide
 *   badges).
 *
 * Inline visualStatements authored directly on the prose line itself are still
 * resolved on that same line.
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
  const cacheRef = useRef<Map<string, CachedInfo> | null>(null);
  if (cacheRef.current === null) cacheRef.current = new Map();

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
        cacheRef.current!.delete(entryId);
        return undefined;
      }

      // Collect adjacent structural lines (MENU, JUMP, CHOICE) that follow
      // this line until we hit another DIALOGUE/NARRATION line. These carry
      // technical metadata (menuOptions, jump targets, conditions) that
      // should be displayed as badges on the preceding dialogue line.
      // VISUAL rows are intentionally skipped here: they precede (not follow)
      // the prose they affect and are collected in the backward scan below.
      const adjacentStructural: LabelLine[] = [];
      const backwardVisuals: LabelLine[] = [];
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
          if (nextLine.contentType === "VISUAL") {
            continue;
          }
          adjacentStructural.push(nextLine);
        }

        // Backward scan (prose lines only): a contiguous block of VISUAL rows
        // immediately before this dialogue/narration line describes the
        // scene/show/hide statements in effect for it, so attach them here
        // instead of to the preceding line.
        if (
          line.contentType === "DIALOGUE" ||
          line.contentType === "NARRATION"
        ) {
          for (let i = lineIndex - 1; i >= 0; i--) {
            const prevLine = linesArray[i];
            if (prevLine.contentType !== "VISUAL") {
              break;
            }
            // Walked in reverse; unshift preserves the original source order.
            backwardVisuals.unshift(prevLine);
          }
        }
      }

      const sourceKey = buildSourceKey(
        line,
        adjacentStructural,
        backwardVisuals
      );
      const cached = cacheRef.current!.get(entryId);

      // Return cached object reference when source data is semantically identical
      if (cached && cached.key === sourceKey) {
        return cached.value;
      }

      // Build fresh technical info from this line + adjacent structural lines
      const info: NonNullable<DialogueEntry["technicalInfo"]> = {};

      // Parse technical info from the dialogue/narration line itself
      // Skip menu choices since they are now rendered as inline CHOICE entries
      buildLineInfo(line, info, true);

      // Aggregate from adjacent structural lines (MENU, JUMP, CHOICE, etc.)
      // Skip menu choices here too since they're inline entries
      for (const adjLine of adjacentStructural) {
        buildLineInfo(adjLine, info, true);
      }

      // Aggregate from the VISUAL rows immediately preceding this prose line
      for (const visualLine of backwardVisuals) {
        buildLineInfo(visualLine, info, true);
      }

      const result = Object.keys(info).length > 0 ? info : undefined;
      cacheRef.current!.set(entryId, { value: result, key: sourceKey });
      return result;
    },
    [labelById, lineIndexMap, linesArray]
  );

  return { getTechnicalInfoForLine };
}
