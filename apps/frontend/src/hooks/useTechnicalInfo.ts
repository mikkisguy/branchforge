import { useMemo } from "react";
import type { LabelLine, LabelDetail } from "@branchforge/shared";
import type { DialogueEntry } from "../lib/prose-types";

interface UseTechnicalInfoResult {
  getTechnicalInfoForLine: (
    entryId: string,
    labelLines?: LabelLine[]
  ) => DialogueEntry["technicalInfo"];
}

/**
 * Hook to extract technical info from label lines and transform into badge data format.
 * This hook processes LabelLine objects and returns technicalInfo matching the DialogueEntry type.
 */
export function useTechnicalInfo(
  activeLabel: LabelDetail | undefined
): UseTechnicalInfoResult {
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const labelById = useMemo(() => {
    if (!activeLabel?.lines) return new Map();

    return new Map(activeLabel.lines.map((line) => [line.id, line]));
  }, [activeLabel?.lines]);

  const getTechnicalInfoForLine = (
    entryId: string,
    _labelLines?: LabelLine[]
  ): DialogueEntry["technicalInfo"] => {
    // Map entry ID to label line (they share IDs)
    const line = labelById.get(entryId);
    if (!line) return undefined;

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

    return Object.keys(info).length > 0 ? info : undefined;
  };

  return { getTechnicalInfoForLine };
}
