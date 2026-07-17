/**
 * Labels module - Types
 *
 * Shared types and constants used across the labels service modules.
 */

import type { Label, LabelLine } from "../../db/schema/index.js";
import type { PublicLabel, IncomingJump } from "@branchforge/shared";
import type { Transaction } from "../../db/types.js";

// Re-export PublicLabel from shared for route handlers
export type { PublicLabel, IncomingJump };

// ============================================================================
// Query Context
// ============================================================================

/**
 * Generic type for database query operations shared by both db connections
 * and transactions. This allows the same function to work with either context.
 *
 * Only includes the query methods actually used by reconstructFileForLabel.
 */
export type QueryContext =
  | Pick<ReturnType<typeof import("../../db/index.js").getDb>, "select">
  | Pick<Transaction, "select">;

// ============================================================================
// Constants
// ============================================================================

/**
 * Matches canonical UUIDs.  Used to distinguish raw label IDs from
 * label-name references in menu option `targetLabelId` fields.
 */
export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Maximum attempts to find a unique label name before falling back to timestamp/UUID
export const MAX_LABEL_ATTEMPTS = 1000;

// ============================================================================
// Sync Types
// ============================================================================

export interface SyncLabelsResult {
  success: boolean;
  labelsCreated: number;
  labelsUpdated: number;
  labelsDeleted: number;
  linesProcessed: number;
  errors: Array<{ label: string; error: string }>;
  skipped: boolean; // True if sync was skipped due to idempotency
  affectedLabelIds: string[]; // IDs of labels created, updated, or deleted
  dbLabelCount: number; // Actual count of active labels in DB after sync
}

export interface SyncLabelsOptions {
  skipCleanup?: boolean;
}

// ============================================================================
// Public Types
// ============================================================================

/**
 * Label line with speaker information
 */
export interface LabelLineWithSpeaker extends Omit<
  LabelLine,
  "speakerId" | "createdAt" | "updatedAt"
> {
  speakerId: string | null;
  speakerName: string | null; // From characters.displayName
  speakerTag: string | null; // From characters.renpyTag
  // Explicitly type enum fields to preserve literal types
  contentType: "DIALOGUE" | "NARRATION" | "CHOICE" | "MENU" | "JUMP" | "VISUAL";
  visualType: "GENERATED" | "BLACK" | "CUSTOM";
  // Date fields as ISO strings for JSON serialization
  createdAt: string;
  updatedAt: string;
}

/**
 * Character in a label (derived from label_lines.speakerId)
 */
export interface LabelCharacterWithInfo {
  id: string;
  name: string;
  displayName: string;
  renpyTag: string;
}

/**
 * Detailed label information with lines and characters
 */
export interface LabelDetail extends PublicLabel {
  lines: LabelLineWithSpeaker[];
  characters: LabelCharacterWithInfo[];
}

/**
 * Label fields needed for PublicLabel mapping
 */
export type LabelForPublic = Pick<
  Label,
  | "id"
  | "projectId"
  | "title"
  | "labelName"
  | "groupType" // was: act
  | "groupValue" // was: chapter
  | "labelNumber"
  | "sequenceOrder"
  | "route"
  | "status"
  | "visibility"
  | "conditions"
  | "incomingJumps"
  | "version"
  | "contentHash"
  | "projectFileId"
  | "createdAt"
  | "updatedAt"
> & {
  // filePath from INNER JOIN with project_files
  filePath: string;
};

/**
 * List labels request filters
 */
export interface ListLabelsFilters {
  routeKey?: string;
  status?: import("@branchforge/shared").LabelStatus;
}
