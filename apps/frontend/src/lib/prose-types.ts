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

  // Additional fields for backend integration
  labelLineId?: string;
  sequence?: number;
  speakerName?: string | null;
  contentType?: string;
  speakerTag?: string | null;

  // Technical info for badges
  technicalInfo?: {
    conditions: {
      stats?: Record<string, number>;
      variables?: string[];
    } | null;
    visualStatements: Array<{
      type: "SCENE" | "SHOW" | "HIDE";
      target: string;
      at?: string;
      with?: string;
      zorder?: number;
    }> | null;
  };
}
