/**
 * Barrel re-export for backward compatibility.
 * All implementation lives in ./character-parser/ modules.
 */

export type {
  DetectedCharacter,
  CharacterConflict,
  CharacterParseResult,
} from "./character-parser/types.js";

export { DEFAULT_EXCLUDED_TAGS } from "./character-parser/constants.js";
export type { DefaultExcludedTag } from "./character-parser/constants.js";

export { characterParserService } from "./character-parser/parser.js";
