/**
 * Enum Validation Schemas
 *
 * Zod schemas for shared enum types used across domain modules.
 */

import { z } from "zod";
import { LabelStatus } from "@branchforge/shared";

/**
 * Label status enum
 */
export const labelStatusSchema = z.enum(
  [LabelStatus.DRAFT, LabelStatus.REVIEW, LabelStatus.FINAL],
  {
    message: "Status must be DRAFT, REVIEW, or FINAL",
  }
);

/**
 * Element type enum
 */
export const elementTypeSchema = z.enum(
  ["LOCATION", "ITEM", "CONCEPT", "EVENT"],
  {
    message: "Element type must be LOCATION, ITEM, CONCEPT, or EVENT",
  }
);

/**
 * Label visibility enum
 */
export const labelVisibilitySchema = z.enum(
  ["EXCLUSIVE", "SHARED", "DUO_PAIR"],
  {
    message: "Label visibility must be EXCLUSIVE, SHARED, or DUO_PAIR",
  }
);

/**
 * Source origin enum
 */
export const sourceOriginSchema = z.enum(["GITLAB", "ZIP"], {
  message: "Source must be GITLAB or ZIP",
});

// ============================================================================
// Conflict Resolution
// ============================================================================

/**
 * Conflict resolution enum
 */
export const conflictResolutionSchema = z.enum(
  ["branchforge_wins", "gitlab_wins", "manual_review"],
  {
    message:
      "Conflict resolution must be branchforge_wins, gitlab_wins, or manual_review",
  }
);

export type ConflictResolutionValue = z.infer<typeof conflictResolutionSchema>;

/**
 * Get the valid conflict resolution values
 * @returns Array of valid conflict resolution values
 */
export function getValidConflictResolutions(): ConflictResolutionValue[] {
  return ["branchforge_wins", "gitlab_wins", "manual_review"];
}

/**
 * Check if a value is a valid conflict resolution
 * @param value - The value to check
 * @returns true if the value is a valid conflict resolution
 */
export function isValidConflictResolution(
  value: unknown
): value is ConflictResolutionValue {
  return (
    typeof value === "string" &&
    getValidConflictResolutions().includes(value as ConflictResolutionValue)
  );
}
