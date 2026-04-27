/**
 * Label Line Mapper
 *
 * Shared utilities for mapping RPY parser entries to label_lines database values.
 * Extracted to eliminate code duplication between gitlab-sync, label-sync, and gitlab-file-sync services.
 */

import { calculateContentHash } from "../lib/hash.js";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Supported content types for label lines
 * Matches the database enum for label_lines.contentType
 */
export type ContentType = "NARRATION" | "DIALOGUE" | "CHOICE" | "MENU" | "JUMP";

/**
 * Strict content types for label sync operations
 * Subset of ContentType that excludes CHOICE and MENU
 */
export type StrictContentType = "NARRATION" | "DIALOGUE" | "JUMP";

/**
 * Type for label line insert values
 * Matches the schema for label_lines table inserts
 */
export interface LabelLineInsertValues {
  labelId: string;
  sequence: number;
  contentType: ContentType;
  content: string;
  speakerId?: string | null; // Optional speaker ID for dialogue lines
  projectFileId?: string;
  linePosition?: number;
  contentHash?: string;
  lastSyncedHash?: string;
  lastSyncedAt?: Date;
  rpyLineNumber?: number;
  rpyIndentLevel?: number;
}

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
const DEFAULT_CONTENT_TYPE: ContentType = "NARRATION";

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
 * Map entry type to content type with fallback
 * Handles FLAG entries and provides default fallback for unrecognized types
 *
 * @param entry - Parsed entry from RPY file
 * @returns Object with contentType and formatted content string
 */
export function mapEntryToDbContentType(entry: {
  type: string;
  text?: string;
  target?: string;
}): {
  contentType: ContentType;
  content: string;
} {
  // Map FLAG to JUMP
  if (entry.type === "FLAG") {
    const content = entry.target ? `jump ${entry.target}` : "";
    return { contentType: FLAG_MAPPED_TYPE, content };
  }

  // Use strict content types if recognized, otherwise default to NARRATION
  const contentType: ContentType = isStrictContentType(entry.type)
    ? entry.type
    : DEFAULT_CONTENT_TYPE;

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
export function mapEntryToDbType(entry: { type: string }): StrictContentType {
  // Map FLAG to JUMP
  if (entry.type === "FLAG") {
    return FLAG_MAPPED_TYPE;
  }

  // Validate and return strict content type
  if (isStrictContentType(entry.type)) {
    return entry.type;
  }

  // Don't default to NARRATION - fail explicitly on unrecognized types
  // This prevents non-dialogue entries from becoming label_lines
  throw new Error(`Unrecognized entry type: ${entry.type}`);
}

/**
 * Helper function to get character ID by renpyTag
 * Returns null if character not found
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
  return charactersByTag.get(renpyTag) ?? null;
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
    type: string;
    text?: string;
    target?: string;
    speaker?: string;
    lineNumber?: number;
    indentLevel?: number;
  }>,
  labelId: string,
  projectFileId: string,
  charactersByTag: Map<string, string>
): LabelLineInsertValues[] {
  return entries.map((entry, index) => {
    const mapped = mapEntryToDbContentType(entry);
    const entryContentHash = calculateContentHash(mapped.content);
    const speakerId = getCharacterIdByTag(entry.speaker, charactersByTag);
    return {
      labelId,
      sequence: index + 1,
      contentType: mapped.contentType,
      content: mapped.content,
      speakerId,
      projectFileId,
      linePosition: index,
      contentHash: entryContentHash,
      lastSyncedHash: entryContentHash,
      lastSyncedAt: new Date(),
      rpyLineNumber: entry.lineNumber,
      rpyIndentLevel: entry.indentLevel ?? 0,
    };
  });
}
