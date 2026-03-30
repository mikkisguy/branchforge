/**
 * Prose Mode Types
 *
 * Types for the WriteMode prose editor interface.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * A dialogue entry in the prose editor
 * Represents either a character's dialogue line or narration
 */
export interface DialogueEntry {
  id: string; // UUID for the entry
  speakerId: string | null; // Character UUID (null = narration)
  text: string; // Content text
}

/**
 * Backend payload format for dialogue updates
 * Used when sending updates to the backend
 */
export type DialoguePayload = Omit<DialogueEntry, "id">;
