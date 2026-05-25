import { useMemo } from "react";
import type { LabelLine } from "@branchforge/shared";
import type { DialogueEntry } from "../lib/prose-types";

interface UseTechnicalInfoResult {
  getTechnicalInfoForLine: (line: LabelLine) => DialogueEntry["technicalInfo"];
}

/**
 * Hook to extract technical info from label lines and transform into badge data format.
 * This hook processes LabelLine objects and returns technicalInfo matching the DialogueEntry type.
 */
export function useTechnicalInfo(): UseTechnicalInfoResult {
  const getTechnicalInfoForLine = useMemo(() => {
    return (line: LabelLine): DialogueEntry["technicalInfo"] => {
      const info: DialogueEntry["technicalInfo"] = {};

      // Extract conditions
      if (
        line.conditions &&
        (line.conditions.stats || line.conditions.variables)
      ) {
        info.conditions = {
          stats: line.conditions.stats,
          variables: line.conditions.variables,
        };
      }

      // Extract jump target
      if (line.contentType === "JUMP" && line.content) {
        const jumpMatch = line.content.match(/^jump\s+(\S+)/);
        if (jumpMatch) {
          info.jumpTarget = {
            labelId: jumpMatch[1],
            labelName: jumpMatch[1],
          };
        }
      }

      // Extract visual statements
      if (line.visualStatements && line.visualStatements.length > 0) {
        info.visuals = line.visualStatements.map((visual) => ({
          type: visual.type,
          target: visual.target,
        }));
      }

      // Return undefined if no technical info
      return Object.keys(info).length > 0 ? info : undefined;
    };
  }, []);

  return { getTechnicalInfoForLine };
}
