/**
 * Labels module - Jump Target Resolution
 *
 * Pure in-memory resolution of jump target names to label IDs.
 */

import { resolveLabelNames } from "../label-name-resolver.service.js";
import { UUID_REGEX } from "./types.js";

// ============================================================================
// Jump Target Resolution
// ============================================================================

/**
 * Resolve jump targets in label lines to actual label IDs.
 *
 * @param lines - Label lines to resolve targets for
 * @param allLabels - All labels in the project for resolution
 * @returns Lines with resolved targetLabelId in menuOptions
 */
export function resolveJumpTargets<
  T extends {
    menuOptions?: Array<{
      label: string;
      targetLabelId: string;
      targetLabelName: string;
      targetType?: "id" | "name";
      conditionFlags?: string[];
      effects?: {
        stats?: Record<string, number>;
      };
    }> | null;
  },
>(lines: T[], allLabels: Array<{ id: string; labelName: string | null }>): T[] {
  // If no lines or no menuOptions, return as-is
  if (!lines || lines.length === 0) {
    return lines;
  }

  // Build list of all target names to resolve (skip UUIDs - already resolved)
  const targetNames: string[] = [];
  for (const line of lines) {
    if (line.menuOptions) {
      for (const choice of line.menuOptions) {
        if (
          choice.targetLabelId &&
          choice.targetLabelId !== "" &&
          (choice.targetType === "name" ||
            !UUID_REGEX.test(choice.targetLabelId))
        ) {
          targetNames.push(choice.targetLabelId);
        }
      }
    }
  }

  // Resolve all target names to label IDs
  const resolvedMap = resolveLabelNames(allLabels, targetNames);

  // Update lines with resolved IDs
  return lines.map((line) => {
    if (!line.menuOptions) {
      return line;
    }

    return {
      ...line,
      menuOptions: line.menuOptions.map((choice) => {
        if (!choice.targetLabelId || choice.targetLabelId === "") {
          return { ...choice, targetLabelId: "" };
        }
        // Explicit discriminator: targetType tells us how to interpret the value
        if (choice.targetType === "name") {
          // Treat as a label name regardless of UUID shape
          const resolvedId = resolvedMap[choice.targetLabelId] ?? "";
          return {
            ...choice,
            targetLabelId: resolvedId,
            ...(resolvedId ? ({ targetType: "id" } as const) : {}),
          };
        }
        if (choice.targetType === "id") {
          // Treat as an ID — validate it's a UUID
          if (UUID_REGEX.test(choice.targetLabelId)) {
            return { ...choice };
          }
          // Non-UUID "id" — try resolving as name as fallback
          const resolvedId = resolvedMap[choice.targetLabelId] ?? "";
          return {
            ...choice,
            targetLabelId: resolvedId,
            ...(resolvedId ? ({ targetType: "id" } as const) : {}),
          };
        }
        // No explicit targetType — use UUID shape heuristic
        if (UUID_REGEX.test(choice.targetLabelId)) {
          return { ...choice, targetType: "id" };
        }
        const resolvedId = resolvedMap[choice.targetLabelId] ?? "";
        return {
          ...choice,
          targetLabelId: resolvedId,
          ...(resolvedId ? ({ targetType: "id" } as const) : {}),
        };
      }),
    };
  });
}
