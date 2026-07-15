/**
 * RPY Parser Service
 *
 * Parses Ren'Py .rpy files and extracts:
 * - Labels (entry points for scenes/sections)
 * - Dialogue lines (speaker and text)
 * - Menu choices
 * - Jump statements
 * - Character definitions
 */

import type {
  StatCondition,
  VisualStatement,
  VariableCondition,
} from "@branchforge/shared";

// Parsed RPY data structures
export interface RPYParsedData {
  labels: string[];
  dialogue: Array<{
    speaker: string | null;
    text: string;
    lineNumber?: number;
  }>;
  choices: Array<{ label: string; target: string | null; parentLabel: string }>;
  jumps: Array<{ from: string; to: string; isCall?: boolean }>;
  characters: Array<{ tag: string; name: string; color?: string }>;
}

export interface RPYLabel {
  name: string;
  parameters?: string[];
  startLine: number;
}

export interface RPYDialogue {
  speaker: string | null;
  text: string;
  lineNumber: number;
}

export interface RPYChoice {
  label: string;
  target: string | null;
  parentLabel: string;
  lineNumber: number;
}

export interface RPYJump {
  from: string;
  to: string;
  isCall?: boolean;
  lineNumber: number;
}

export interface RPYCharacter {
  tag: string;
  name: string;
  color?: string;
}

// BranchForge scene format for conversion
export interface BranchForgeScene {
  name: string;
  entries: Array<{
    type: "DIALOGUE" | "NARRATION" | "FLAG" | "JUMP" | "MENU" | "VISUAL";
    speaker?: string;
    text?: string;
    target?: string;
    lineNumber?: number; // RPY line number for accurate export
    indentLevel?: number; // Indent level for proper formatting
    menuOptions?: Array<{
      label: string;
      targetLabelId: string;
      targetLabelName: string;
      conditionFlags?: string[];
      condition?: string;
      effects?: {
        stats?: Record<string, number>;
      };
    }>;
    visuals?: VisualStatement[];
  }>;
  characters?: Array<{ tag: string; name: string }>;
}

/**
 * Labeled dialogue with proper label boundary tracking
 * Used for Write Mode parsing where each label has its own dialogue
 */
export interface LabeledDialogue {
  label: string;
  lineNumber: number;
  dialogue: Array<{
    speaker: string | null;
    text: string;
    lineNumber: number;
  }>;
  choices: Array<{
    label: string;
    target: string | null;
    lineNumber: number;
  }>;
  jumps: Array<{
    to: string;
    lineNumber: number;
  }>;
  // NEW: Grouped menu blocks with structured options
  menus: Array<{
    lineNumber: number;
    options: Array<{
      label: string;
      target: string | null;
      lineNumber: number;
      effects?: Record<string, number>;
      conditionFlags?: string[];
      condition?: string;
    }>;
  }>;
}

/**
 * Parsed RPY file with label-aware structure
 * Distinguishes between STORY files (labels/*.rpy with dialogue) and SETTINGS files
 */
export interface ParsedRPYFileWithLabels {
  labels: LabeledDialogue[];
  characters: Array<{
    tag: string;
    name: string;
    color?: string;
  }>;
  fileType: "STORY" | "SETTINGS";
}

/**
 * Result of block tracking: which lines are inside screen/init offset blocks.
 */
export interface BlockTrackingResult {
  /** Set of line indices (0-based) that are inside screen or init offset blocks */
  skipLines: Set<number>;
  /** Number of top-level screen definitions found */
  screenCount: number;
  /** Number of top-level label definitions found */
  labelCount: number;
}

/**
 * Options for reconstructing RPY file with updated dialogue
 * Used for Write Mode saves to merge dialogue changes with original keywords
 */
/** A single menu option carried through RPY reconstruction */
export interface MenuOptionForReconstruction {
  label: string;
  targetLabelId?: string;
  targetLabelName?: string;
  conditionFlags?: string[];
  effects?: { stats?: Record<string, number> };
}

export interface ReconstructedFileOptions {
  originalContent: string;
  updatedDialogue: Map<string, Array<{ speaker: string | null; text: string }>>; // label -> dialogue
  updatedMenuChoices?: Map<string, MenuOptionForReconstruction[][]>; // label -> [menuBlock1, menuBlock2, ...]
}

/**
 * Technical constructs extracted from a single RPY line
 * Used for displaying badges in write mode
 */
export interface TechnicalConstructs {
  choices?: Array<{
    label: string;
    targetLabelId: string;
    effects?: { stats?: Record<string, number> };
  }>;
  jumpTarget?: string;
  conditions?: {
    stats?: Record<string, StatCondition>;
    statDeltas?: Record<string, number>;
    variables?: Record<string, VariableCondition>;
  };
  visuals?: Array<{
    type: "SCENE" | "SHOW" | "HIDE";
    target: string;
    with?: string;
    at?: string;
    zorder?: number;
  }>;
}

export interface LabelBlock {
  name: string;
  startLine: number;
  endLine: number;
}
