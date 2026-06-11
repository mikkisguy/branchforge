/**
 * Prose Mode Types
 *
 * Types for the WriteMode prose editor interface.
 */

import type { StatCondition, VariableCondition } from "@branchforge/shared";

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
