/**
 * Prose Mode Types
 *
 * Types for the WriteMode prose editor interface.
 */

import type {
  StatCondition,
  VariableCondition,
  UpdateLabelDialogueNoteInput,
} from "@branchforge/shared";

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
  /** Persisted line ID; absent until a newly added line is saved. */
  labelLineId?: string;
  /** Undefined keeps the saved note, null deletes it. */
  note?: UpdateLabelDialogueNoteInput | null;

  // Additional fields for backend integration
  sequence?: number;
  speakerName?: string | null;
  contentType?: string;
  speakerTag?: string | null;

  // For structural CHOICE entries: link back to parent MENU line and choice data
  choiceData?: {
    lineId: string; // parent MENU label line ID
    optionIndex: number; // index in menuOptions array
    targetLabelId: string;
    targetLabelName: string;
    conditionFlags?: string[];
    effects?: {
      stats?: Record<string, number>;
    };
  };

  // Technical info for badges
  technicalInfo?: {
    choices?: Array<{
      label: string;
      targetLabelId: string;
      targetLabelName: string;
      effects?: {
        stats?: Record<string, number>;
      };
      conditionFlags?: string[];
    }>;
    jumpTarget?: {
      labelId: string;
      labelName: string;
    };
    conditions?: {
      stats?: Record<string, StatCondition>;
      variables?: Record<string, VariableCondition>;
    };
    visuals?: Array<{
      type: "SCENE" | "SHOW" | "HIDE";
      target: string;
    }>;
  };
}
