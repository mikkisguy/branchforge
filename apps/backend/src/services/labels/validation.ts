/**
 * Labels module - Validation
 *
 * Validation functions for RPY content, file types, and label statuses.
 */

import { ValidationError } from "../../middleware/error-handler.middleware.js";
import type { ParsedRPYFileWithLabels } from "../rpy-parser.service.js";
import { LabelStatus } from "@branchforge/shared";

// ============================================================================
// Sync Validation Functions
// ============================================================================

/**
 * Validate RPY content before sync
 * @throws ValidationError if validation fails
 */
export function validateRPYContent(
  content: string,
  parsed: ParsedRPYFileWithLabels
): void {
  if (!content || content.trim().length === 0) {
    throw new ValidationError("RPY content is empty");
  }

  if (parsed.labels.length === 0) {
    throw new ValidationError("No labels found in RPY content");
  }

  // Check for duplicate labels (case-insensitive)
  const labelSet = new Set<string>();
  const duplicateLabels: string[] = [];
  for (const label of parsed.labels) {
    const lowerLabel = label.label.toLowerCase();
    if (labelSet.has(lowerLabel)) {
      duplicateLabels.push(label.label);
    }
    labelSet.add(lowerLabel);
  }

  if (duplicateLabels.length > 0) {
    throw new ValidationError(
      `Duplicate labels found: ${duplicateLabels.join(", ")}`
    );
  }
}

/**
 * Validate that file type is STORY (only STORY files should sync to labels)
 * @throws ValidationError if validation fails
 */
export function validateFileType(fileType: string): void {
  if (fileType !== "STORY") {
    throw new ValidationError(
      `Invalid file type for label sync: ${fileType}. Only STORY files can sync to labels.`
    );
  }
}

// ============================================================================
// Type Guards for Enum Values
// ============================================================================

/**
 * Type guard to check if a value is a valid label status
 */
export function isValidLabelStatus(
  value: string | null | undefined
): value is LabelStatus {
  const validStatuses: LabelStatus[] = [
    LabelStatus.DRAFT,
    LabelStatus.REVIEW,
    LabelStatus.FINAL,
  ];
  return (
    value !== null &&
    value !== undefined &&
    validStatuses.includes(value as LabelStatus)
  );
}
