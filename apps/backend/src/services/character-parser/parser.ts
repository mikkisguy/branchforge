import { DEFAULT_EXCLUDED_TAGS } from "./constants.js";
import type { DefaultExcludedTag } from "./constants.js";
import {
  parseCharacterDefinitions,
  characterStylingSignature,
} from "../character-source-definition.js";
import {
  classifyName,
  inferNameTypeFromStoredName,
} from "./name-resolution.js";
import type {
  NameForm,
  DetectedCharacter,
  CharacterConflict,
  CharacterParseResult,
} from "./types.js";
import { generateCharacterDefinitionsFile } from "../rpy-generator.service.js";
import { canonicalizeColor } from "./color.js";
import {
  isValidCharacterNameType,
  type CharacterNameType,
  type CharacterSourceDefinition,
} from "@branchforge/shared";

/**
 * Character Parser Service
 *
 * Uses the shared, safe `parseCharacterDefinitions` lexer so that detection,
 * stripping, and conflict detection agree on which declarations are safe to
 * manage. Unsupported forms are left source-owned and are never promoted.
 */
class CharacterParserService {
  /**
   * Check if a character tag is one of the default special/system tags.
   */
  private isSpecialTag(tag: string): boolean {
    return DEFAULT_EXCLUDED_TAGS.includes(tag as DefaultExcludedTag);
  }

  /**
   * Map a parsed name back to the internal `NameForm` so the existing
   * `classifyName` helper can derive confidence and displayName.
   */
  private formForNameType(nameType: CharacterNameType): NameForm | null {
    switch (nameType) {
      case "variable":
        return "identifier";
      case "interpolated":
        return "bracketed";
      case "none":
        return null;
      case "literal":
      case "tagged":
      case "unknown":
      case "empty":
        return "quoted";
      default: {
        const _exhaustive: never = nameType;
        return _exhaustive;
      }
    }
  }

  /**
   * Parse character definitions from a single file using the safe source
   * parser. Unsupported declarations are skipped; only forms that the
   * round-trip renderer can safely edit are returned.
   */
  parseFile(content: string, filename: string): DetectedCharacter[] {
    const definitions = parseCharacterDefinitions(content);
    const characters: DetectedCharacter[] = [];

    for (const definition of definitions) {
      const form = this.formForNameType(definition.nameType);
      const { confidence } = classifyName(definition.name, form);

      characters.push({
        tag: definition.tag,
        name: definition.name,
        displayName: definition.displayName,
        nameType: definition.nameType,
        color: definition.color,
        isSpecial: this.isSpecialTag(definition.tag),
        sourceFile: filename,
        confidence,
        sourceDefinition: definition.sourceDefinition,
      });
    }

    return characters;
  }

  /**
   * Parse with exclusions applied.
   */
  parseWithExclusions(
    content: string,
    filename: string,
    excludedTags: Set<string>
  ): DetectedCharacter[] {
    const allCharacters = this.parseFile(content, filename);
    return allCharacters.filter((c) => !excludedTags.has(c.tag));
  }

  /**
   * Detect conflicts between detected and existing characters.
   *
   * Compares the semantic source name, nameType, and color. When those are
   * unchanged but the accepted source declaration differs in styling or
   * options, a "definition" conflict is reported using the declaration
   * text and a styling signature comparison.
   */
  detectConflicts(
    detected: DetectedCharacter[],
    existing: Array<{
      renpyTag: string;
      name: string | null;
      displayName: string;
      color: string;
      nameType?: CharacterNameType | string | null;
      sourceDefinition?: CharacterSourceDefinition | null;
      isNarrator?: boolean;
    }>
  ): CharacterConflict[] {
    const conflicts: CharacterConflict[] = [];
    const existingByTag = new Map(existing.map((c) => [c.renpyTag, c]));

    for (const detectedChar of detected) {
      const existingChar = existingByTag.get(detectedChar.tag);

      if (existingChar) {
        const existingNameType = this.resolveExistingNameType(
          existingChar.name,
          existingChar.nameType
        );

        const changedFields: Array<
          "name" | "nameType" | "color" | "definition"
        > = [];

        const existingSourceName =
          existingNameType === "none"
            ? null
            : existingNameType === "empty"
              ? ""
              : existingChar.name;
        const nameMismatch = detectedChar.name !== existingSourceName;
        const nameTypeMismatch = detectedChar.nameType !== existingNameType;
        const colorMismatch =
          canonicalizeColor(detectedChar.color) !==
          canonicalizeColor(existingChar.color);

        if (nameMismatch) changedFields.push("name");
        if (nameTypeMismatch) changedFields.push("nameType");
        if (colorMismatch) changedFields.push("color");

        // A legacy row without a recoverable template exports the fallback
        // declaration. Compare against that actual behavior so new retained
        // options can still be accepted through the review wizard.
        const existingDefinition =
          existingChar.sourceDefinition ??
          parseCharacterDefinitions(
            generateCharacterDefinitionsFile([
              {
                ...existingChar,
                nameType: existingNameType,
                color: canonicalizeColor(existingChar.color),
              },
            ])
          )[0]?.sourceDefinition;
        let definitionMismatch = false;
        {
          const detectedSignature = characterStylingSignature(
            detectedChar.sourceDefinition
          );
          const existingSignature =
            characterStylingSignature(existingDefinition);
          if (
            detectedSignature !== null &&
            existingSignature !== null &&
            detectedSignature !== existingSignature
          ) {
            definitionMismatch = true;
            changedFields.push("definition");
          }
        }

        if (
          nameMismatch ||
          nameTypeMismatch ||
          colorMismatch ||
          definitionMismatch
        ) {
          conflicts.push({
            tag: detectedChar.tag,
            detectedName: detectedChar.name,
            existingName: existingChar.name ?? existingChar.renpyTag,
            detectedColor: detectedChar.color,
            existingColor: existingChar.color,
            detectedNameType: detectedChar.nameType,
            existingNameType: existingNameType,
            existingDisplayName: existingChar.displayName,
            detectedDefinition: detectedChar.sourceDefinition?.declaration,
            existingDefinition: existingDefinition?.declaration,
            changedFields,
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Resolve the semantic nameType for a stored character.
   *
   * - `null` name is always "none".
   * - `""` name is always "empty".
   * - Legacy rows that stored "literal" for a dynamic name have their
   *   nameType inferred from the stored name.
   * - Otherwise the stored (or inferred) nameType is returned.
   */
  private resolveExistingNameType(
    name: string | null,
    storedNameType: CharacterNameType | string | null | undefined
  ): CharacterNameType {
    if (name === null) return "none";
    if (name === "") return "empty";

    const inferred = inferNameTypeFromStoredName(name);

    if (storedNameType === "literal" && inferred !== "literal") {
      return inferred;
    }

    if (
      typeof storedNameType === "string" &&
      isValidCharacterNameType(storedNameType)
    ) {
      return storedNameType;
    }

    return inferred;
  }

  /**
   * Parse multiple files and aggregate results
   */
  parseFiles(
    files: Array<{ content: string; filename: string }>
  ): CharacterParseResult {
    const allCharacters: DetectedCharacter[] = [];
    const excludedTags = new Set<string>(DEFAULT_EXCLUDED_TAGS);

    for (const file of files) {
      const characters = this.parseFile(file.content, file.filename);
      allCharacters.push(...characters);
    }

    // Deduplicate by tag (keep first occurrence)
    const seenTags = new Set<string>();
    const uniqueCharacters: DetectedCharacter[] = [];

    for (const char of allCharacters) {
      if (!seenTags.has(char.tag)) {
        seenTags.add(char.tag);
        uniqueCharacters.push(char);
      }
    }

    return {
      characters: uniqueCharacters,
      conflicts: [],
      excludedTags,
    };
  }
}

// Export singleton instance
export const characterParserService = new CharacterParserService();
