/**
 * Barrel re-export for backward compatibility.
 * All implementation lives in ./rpy/ modules.
 */

export type {
  RPYParsedData,
  RPYLabel,
  RPYDialogue,
  RPYChoice,
  RPYJump,
  RPYCharacter,
  BranchForgeScene,
  LabeledDialogue,
  ParsedRPYFileWithLabels,
  MenuOptionForReconstruction,
  ReconstructedFileOptions,
  TechnicalConstructs,
  LabelBlock,
} from "./rpy/types.js";

export {
  isValidLabel,
  trackBlocks,
  getIndent,
  countLinesInChoice,
} from "./rpy/helpers.js";

export {
  splitConditionParts,
  extractTechnicalConstructsFromLines,
  extractTechnicalConstructs,
} from "./rpy/technical-constructs.js";

export {
  extractLabels,
  extractDialogue,
  extractChoices,
  extractJumps,
  extractCharacters,
  parseRPYFileWithLabels,
  parseRPYContent,
  parseRPYFile,
} from "./rpy/parser.js";

export { reconstructRPYFile } from "./rpy/reconstruction.js";

export { alignDialogue, dialogueEntriesEqual } from "./rpy/dialogue-align.js";

export { planDialogueLineUpdates } from "./rpy/plan-dialogue-updates.js";

export {
  removeLabelFromRPYContent,
  parseLabelBoundaries,
  addLabelToRPYContent,
  replaceLabelDialogue,
} from "./rpy/label-management.js";

export {
  generateRpyFile,
  convertToBranchForgeFormatFromLabels,
} from "./rpy/export-generator.js";
