/**
 * Label Line Mapper
 *
 * Shared utilities for mapping RPY parser entries to label_lines database values.
 * Extracted to eliminate code duplication between gitlab-sync, label-sync, and gitlab-file-sync services.
 */

import { calculateContentHash } from "../lib/hash.js";
import type { NewLabelLine } from "../db/schema/index.js";
import { ValidationError } from "../middleware/error-handler.middleware.js";
import { logError, LogEventType } from "../lib/logger.js";
import type {
  ComparisonOperator,
  StatCondition,
  VariableCondition,
} from "@branchforge/shared";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Supported content types for label lines
 * Matches the database enum for label_lines.contentType
 */
export type ContentType =
  "NARRATION" | "DIALOGUE" | "CHOICE" | "MENU" | "JUMP" | "FLAG" | "VISUAL";

/**
 * Type for line-level conditions
 */
export type LineConditions = {
  stats?: Record<string, number | StatCondition>;
  variables?: Record<string, VariableCondition>;
  statDeltas?: Record<string, number>;
};

/**
 * Type for visual statements (scene, show, hide)
 */
export type VisualStatement = {
  type: "SCENE" | "SHOW" | "HIDE";
  target: string;
  at?: string;
  with?: string;
  zorder?: number;
};

/**
 * Strict content types for label sync operations
 * Subset of ContentType that excludes CHOICE and MENU
 */
export type StrictContentType = "NARRATION" | "DIALOGUE" | "JUMP";

/**
 * Type for label line insert values
 * Inferred from the label_lines table schema to stay in sync
 */
export type LabelLineInsertValues = Pick<
  NewLabelLine,
  | "labelId"
  | "sequence"
  | "contentType"
  | "content"
  | "speakerId"
  | "projectFileId"
  | "contentHash"
  | "lastSyncedHash"
  | "lastSyncedAt"
  | "rpyLineNumber"
  | "rpyIndentLevel"
  | "conditions"
  | "visualStatements"
  | "menuOptions"
>;

// ============================================================================
// Constants
// ============================================================================

/**
 * Content type constant for FLAG entries
 * FLAG is mapped to JUMP for database storage
 */
const FLAG_MAPPED_TYPE: StrictContentType = "JUMP";

/**
 * Default fallback content type when entry type is unrecognized
 */
const DEFAULT_CONTENT_TYPE: StrictContentType = "NARRATION";

/**
 * Default operator for stat conditions when not explicitly specified
 */
const DEFAULT_OPERATOR: ComparisonOperator = ">=";

// ============================================================================
// Type Mapping Functions
// ============================================================================

/**
 * Check if an entry type is a recognized strict content type
 *
 * @param type - Entry type string to check
 * @returns True if the type is NARRATION, DIALOGUE, or JUMP
 */
function isStrictContentType(type: string): type is StrictContentType {
  return type === "NARRATION" || type === "DIALOGUE" || type === "JUMP";
}

/**
 * Normalize a stat condition to ensure it has the correct shape.
 * Converts plain numbers to StatCondition objects with the default operator.
 *
 * @param value - Either a number or a StatCondition object
 * @returns A normalized StatCondition object
 */
export function normalizeStatCondition(
  value: number | StatCondition
): StatCondition {
  if (typeof value === "number") {
    return { value, operator: DEFAULT_OPERATOR };
  }
  return value;
}

/**
 * Normalize line conditions to ensure all stats are StatCondition objects.
 *
 * @param conditions - LineConditions object to normalize
 * @returns Normalized LineConditions with StatCondition objects for stats
 */
function normalizeLineConditions(
  conditions?: LineConditions
): LineConditions | undefined {
  if (!conditions?.stats) return conditions;
  const normalized: Record<string, StatCondition> = {};
  for (const [key, value] of Object.entries(conditions.stats)) {
    normalized[key] = normalizeStatCondition(value);
  }
  return { ...conditions, stats: normalized };
}

/**
 * Map entry type to content type with fallback
 * Handles FLAG entries and provides default fallback for unrecognized types
 *
 * @param entry - Parsed entry from RPY file
 * @returns Object with contentType and formatted content string
 */
export function mapEntryToDbContentType(entry: {
  type: ContentType;
  text?: string;
  target?: string;
}): {
  contentType: StrictContentType;
  content: string;
} {
  // Map FLAG to JUMP
  if (entry.type === "FLAG") {
    const content = entry.target ? `jump ${entry.target}` : "";
    return { contentType: FLAG_MAPPED_TYPE, content };
  }

  // Use strict content types if recognized, otherwise default to NARRATION
  let contentType: StrictContentType;
  if (isStrictContentType(entry.type)) {
    contentType = entry.type as StrictContentType;
  } else {
    contentType = DEFAULT_CONTENT_TYPE;
  }

  // Format content for JUMP entries with targets
  const content =
    entry.target && contentType === "JUMP"
      ? `jump ${entry.target}`
      : (entry.text ?? "");

  return { contentType, content };
}

/**
 * Map entry type to strict content type
 * Throws error on unrecognized types - use when validation is required
 *
 * @param entry - Parsed entry from RPY file
 * @returns Strict content type enum value
 * @throws Error if entry type is not recognized
 */
export function mapEntryToDbType(entry: {
  type: ContentType;
}): StrictContentType {
  // Map FLAG to JUMP
  if (entry.type === "FLAG") {
    return FLAG_MAPPED_TYPE;
  }

  // Validate and return strict content type
  if (isStrictContentType(entry.type)) {
    return entry.type as StrictContentType;
  }

  // Don't default to NARRATION - fail explicitly on unrecognized types
  // This prevents non-dialogue entries from becoming label_lines
  logError(LogEventType.SERVICE_ERROR, {
    message: `Unrecognized entry type: ${entry.type}`,
  });
  throw new ValidationError("Invalid content type");
}

/**
 * Helper function to get character ID by renpyTag
 * Returns null if character not found
 * Performs exact match first, then falls back to case-insensitive lookup.
 *
 * @param renpyTag - Character's Ren'Py tag
 * @param charactersByTag - Map of renpyTag to character ID
 * @returns Character ID or null
 */
export function getCharacterIdByTag(
  renpyTag: string | undefined,
  charactersByTag: Map<string, string>
): string | null {
  if (!renpyTag) return null;

  const exact = charactersByTag.get(renpyTag);
  if (exact) return exact;

  const lower = renpyTag.toLowerCase();
  for (const [key, value] of charactersByTag) {
    if (key.toLowerCase() === lower) return value;
  }

  return null;
}

/**
 * Helper function to map parsed entries to LabelLineInsertValues
 * Consolidates logic from gitlab-sync, label-sync, and gitlab-file-sync services
 *
 * @param entries - Array of parsed entries from RPY file
 * @param labelId - Label ID to associate lines with
 * @param projectFileId - Project file ID
 * @param charactersByTag - Map of renpyTag to character ID for speaker resolution
 * @returns Array of LabelLineInsertValues ready for database insertion
 */
export function mapEntriesToLabelLineValues(
  entries: Array<{
    type: ContentType;
    text?: string;
    target?: string;
    speaker?: string;
    lineNumber?: number;
    indentLevel?: number;
    conditions?: LineConditions;
    visuals?: VisualStatement[];
    menuOptions?: Array<{
      label: string;
      targetLabelId: string;
      targetLabelName: string;
      conditionFlags?: string[];
      effects?: {
        stats?: Record<string, number>;
      };
    }>;
  }>,
  labelId: string,
  projectFileId: string,
  charactersByTag: Map<string, string>
): LabelLineInsertValues[] {
  return entries.map((entry, index) => {
    // Handle MENU entries with menuOptions
    if (entry.type === "MENU") {
      const contentHash = calculateContentHash(
        JSON.stringify(entry.menuOptions ?? [])
      );
      return {
        labelId,
        sequence: index + 1,
        contentType: "MENU" as const,
        content: "",
        speakerId: null,
        projectFileId,
        contentHash,
        lastSyncedHash: contentHash,
        lastSyncedAt: new Date(),
        rpyLineNumber: entry.lineNumber,
        rpyIndentLevel: entry.indentLevel ?? 0,
        conditions: null,
        visualStatements: null,
        menuOptions: entry.menuOptions ?? null,
      };
    }

    // Handle VISUAL entries (scene/show/hide statements)
    if (entry.type === "VISUAL") {
      const contentHash = calculateContentHash(
        JSON.stringify(entry.visuals ?? [])
      );
      return {
        labelId,
        sequence: index + 1,
        contentType: "VISUAL" as const,
        content: "",
        speakerId: null,
        projectFileId,
        contentHash,
        lastSyncedHash: contentHash,
        lastSyncedAt: new Date(),
        rpyLineNumber: entry.lineNumber,
        rpyIndentLevel: entry.indentLevel ?? 0,
        conditions: null,
        visualStatements: entry.visuals ?? null,
        menuOptions: null,
      };
    }

    const mapped = mapEntryToDbContentType(entry);
    const entryContentHash = calculateContentHash(mapped.content);
    const speakerId = getCharacterIdByTag(entry.speaker, charactersByTag);
    const normalizedConditions = normalizeLineConditions(entry.conditions);
    return {
      labelId,
      sequence: index + 1,
      contentType: mapped.contentType,
      content: mapped.content,
      speakerId,
      projectFileId,
      contentHash: entryContentHash,
      lastSyncedHash: entryContentHash,
      lastSyncedAt: new Date(),
      rpyLineNumber: entry.lineNumber,
      rpyIndentLevel: entry.indentLevel ?? 0,
      conditions: normalizedConditions ?? null,
      visualStatements: entry.visuals ?? null,
      menuOptions: null,
    };
  });
}
