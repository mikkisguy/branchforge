/**
 * RPY Generator Service
 *
 * Generates Ren'Py code for state variables (prerequisites and effects).
 * Patches existing RPY content with conditional logic and variable assignments.
 */

import { RENPY_LABEL_REGEX } from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

/**
 * Valid Ren'Py identifier pattern
 * Must start with letter or underscore, followed by letters, numbers, or underscores
 * This prevents code injection through malicious variable names
 */
const RENPY_IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Type guard to validate a Ren'Py identifier
 * Checks that the name is safe to use in generated RPY code
 *
 * @param name - The identifier to validate
 * @returns True if the identifier is valid for Ren'Py
 */
export function isValidRenpyIdentifier(name: string): boolean {
  return RENPY_IDENTIFIER_REGEX.test(name);
}

/**
 * Prerequisites from label configuration
 */
export interface Prerequisites {
  stateVariables?: string[];
  meters?: Record<string, number>;
}

/**
 * Effects from label configuration
 */
export interface Effects {
  stateVariablesSet?: string[];
  stateVariablesUnset?: string[];
  meters?: Record<string, number>;
}

/**
 * Label data with prerequisites and effects
 */
export interface LabelWithConditions {
  title: string;
  prerequisites?: Prerequisites | null;
  effects?: Effects | null;
}

// ============================================================================
// Code Generation Functions
// ============================================================================

/**
 * Generate prerequisite code (if statements)
 * Returns array of code lines to insert after label declaration
 *
 * @param prerequisites - The prerequisites configuration
 * @param indentLevel - Indentation level (default 4 spaces)
 * @returns Array of code lines
 *
 * @example
 * generatePrerequisiteCode({ stateVariables: ["met_alex"] })
 * // Returns: ["    if not met_alex:", "        return"]
 */
export function generatePrerequisiteCode(
  prerequisites: Prerequisites,
  indentLevel: number = 1
): string[] {
  const lines: string[] = [];
  const indent = "    ".repeat(indentLevel);
  const nestedIndent = "    ".repeat(indentLevel + 1);

  // Generate state variable checks
  if (prerequisites.stateVariables && prerequisites.stateVariables.length > 0) {
    // Validate each state variable name and filter out invalid entries
    const validStateVariables = prerequisites.stateVariables.filter((sv) => {
      if (!isValidRenpyIdentifier(sv)) {
        process.stderr.write(
          `Warning: Skipping invalid state variable name in prerequisites: "${sv}"\n`
        );
        return false;
      }
      return true;
    });

    if (validStateVariables.length > 0) {
      // Combine multiple state variables with OR logic
      const conditions = validStateVariables.map((sv) => `not ${sv}`);
      lines.push(`${indent}if ${conditions.join(" or ")}:`);
      lines.push(`${nestedIndent}return`);
    }
  }

  // Generate meter checks
  if (prerequisites.meters) {
    for (const [meter, value] of Object.entries(prerequisites.meters)) {
      // Validate meter name before using it
      if (!isValidRenpyIdentifier(meter)) {
        process.stderr.write(
          `Warning: Skipping invalid meter name in prerequisites: "${meter}"\n`
        );
        continue;
      }
      lines.push(`${indent}if ${meter} < ${value}:`);
      lines.push(`${nestedIndent}return`);
    }
  }

  return lines;
}

/**
 * Generate effect code (variable assignments)
 * Returns array of code lines to insert before label end
 *
 * @param effects - The effects configuration
 * @param indentLevel - Indentation level (default 4 spaces)
 * @returns Array of code lines
 *
 * @example
 * generateEffectCode({ stateVariablesSet: ["met_alex"] })
 * // Returns: ["    $ met_alex = True"]
 */
export function generateEffectCode(
  effects: Effects,
  indentLevel: number = 1
): string[] {
  const lines: string[] = [];
  const indent = "    ".repeat(indentLevel);

  // Generate state variable assignments
  if (effects.stateVariablesSet && effects.stateVariablesSet.length > 0) {
    for (const sv of effects.stateVariablesSet) {
      // Validate state variable name before using it
      if (!isValidRenpyIdentifier(sv)) {
        process.stderr.write(
          `Warning: Skipping invalid state variable name in effects (set): "${sv}"\n`
        );
        continue;
      }
      lines.push(`${indent}$ ${sv} = True`);
    }
  }

  if (effects.stateVariablesUnset && effects.stateVariablesUnset.length > 0) {
    for (const sv of effects.stateVariablesUnset) {
      // Validate state variable name before using it
      if (!isValidRenpyIdentifier(sv)) {
        process.stderr.write(
          `Warning: Skipping invalid state variable name in effects (unset): "${sv}"\n`
        );
        continue;
      }
      lines.push(`${indent}$ ${sv} = False`);
    }
  }

  // Generate meter adjustments
  if (effects.meters) {
    for (const [meter, value] of Object.entries(effects.meters)) {
      // Validate meter name before using it
      if (!isValidRenpyIdentifier(meter)) {
        process.stderr.write(
          `Warning: Skipping invalid meter name in effects: "${meter}"\n`
        );
        continue;
      }
      lines.push(`${indent}$ ${meter} += ${value}`);
    }
  }

  return lines;
}

/**
 * Generate init block for state variable defaults
 * Returns array of code lines for the init section
 *
 * @param stateVariables - Array of state variable names
 * @returns Array of code lines
 *
 * @example
 * generateInitBlock(["met_alex", "has_key"])
 * // Returns: ["default met_alex = False", "default has_key = False"]
 */
export function generateInitBlock(stateVariables: string[]): string[] {
  const lines: string[] = [];

  for (const sv of stateVariables) {
    // Validate state variable name before using it
    if (!isValidRenpyIdentifier(sv)) {
      process.stderr.write(
        `Warning: Skipping invalid state variable name in init block: "${sv}"\n`
      );
      continue;
    }
    lines.push(`default ${sv} = False`);
  }

  return lines;
}

// ============================================================================
// RPY Patching Functions
// ============================================================================

/**
 * Detect the indentation unit used in RPY content
 * Scans non-empty lines to find the most common leading whitespace pattern
 *
 * @param lines - Array of RPY content lines
 * @returns The indentation unit in spaces (e.g., 4 for 4-space indents), or 4 as default
 */
function detectIndentUnit(lines: string[]): number {
  const indentCounts = new Map<number, number>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue; // Skip empty lines

    // Count leading whitespace
    const match = line.match(/^(\s*)/);
    if (!match) continue;

    const leadingWhitespace = match[1];
    if (leadingWhitespace.length === 0) continue; // No indent

    // Detect if using tabs or spaces
    if (leadingWhitespace.includes("\t")) {
      // Tabs detected - treat each tab as 4 spaces (Ren'Py convention)
      const tabCount = (leadingWhitespace.match(/\t/g) || []).length;
      const indentLength = tabCount * 4;
      indentCounts.set(indentLength, (indentCounts.get(indentLength) || 0) + 1);
    } else {
      // Spaces detected
      indentCounts.set(
        leadingWhitespace.length,
        (indentCounts.get(leadingWhitespace.length) || 0) + 1
      );
    }
  }

  if (indentCounts.size === 0) {
    return 4; // Default fallback
  }

  // Find the smallest non-zero indent (this is likely the base indent unit)
  const indents = Array.from(indentCounts.keys())
    .filter((n) => n > 0)
    .sort((a, b) => a - b);

  if (indents.length === 0) {
    return 4;
  }

  // Return the most common indent among the smallest 3 candidates
  // This helps avoid detecting accidental extra spaces as the indent unit
  const candidates = indents.slice(0, Math.min(3, indents.length));
  let bestIndent = candidates[0];
  let bestCount = 0;

  for (const indent of candidates) {
    const count = indentCounts.get(indent) || 0;
    if (count > bestCount) {
      bestCount = count;
      bestIndent = indent;
    }
  }

  return bestIndent;
}

/**
 * Patch RPY content with state variable prerequisites and effects
 *
 * This function:
 * 1. Parses the RPY content to find label declarations
 * 2. Inserts prerequisite code after label declarations
 * 3. Inserts effect code before label endings (jump/return)
 *
 * @param rpyContent - The original RPY file content
 * @param labels - Array of labels with their prerequisites and effects
 * @returns Patched RPY content with state variable logic
 */
export function patchRPYWithStateVariables(
  rpyContent: string,
  labels: LabelWithConditions[]
): string {
  const lines = rpyContent.split("\n");
  const result: string[] = [];

  // Detect the indentation unit used in this file
  const indentUnit = detectIndentUnit(lines);

  // Create a map for quick label lookup
  const labelMap = new Map<string, LabelWithConditions>();
  for (const label of labels) {
    labelMap.set(label.title, label);
  }

  let currentLabel: string | null = null;
  let currentLabelIndent = 0;
  const effectsInserted = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Detect label declaration: label xyz:
    const labelIndent = line.match(/^(\s*)/)?.[0]?.length ?? 0;
    const labelNameMatch = line.match(RENPY_LABEL_REGEX);
    if (labelNameMatch) {
      currentLabel = labelNameMatch[1];
      currentLabelIndent = labelIndent;
      effectsInserted.delete(currentLabel);

      result.push(line);

      // Insert prerequisites after label declaration
      const labelData = labelMap.get(currentLabel);
      if (labelData?.prerequisites) {
        const hasConditions =
          (labelData.prerequisites.stateVariables &&
            labelData.prerequisites.stateVariables.length > 0) ||
          (labelData.prerequisites.meters &&
            Object.keys(labelData.prerequisites.meters).length > 0);

        if (hasConditions) {
          const prereqLines = generatePrerequisiteCode(
            labelData.prerequisites,
            Math.round(currentLabelIndent / indentUnit) + 1
          );
          result.push(...prereqLines);
        }
      }
      continue;
    }

    // Detect end of label (for effect insertion)
    // We look for jump, return, or end of file at the same or lower indent level
    if (currentLabel && !effectsInserted.has(currentLabel)) {
      const lineIndent = line.match(/^(\s*)/)?.[1].length ?? 0;

      // Check if this line ends the label (jump, return at same or lower indent)
      if (
        lineIndent <= currentLabelIndent &&
        (trimmed.startsWith("jump ") ||
          trimmed === "return" ||
          trimmed.startsWith("call "))
      ) {
        const labelData = labelMap.get(currentLabel);
        if (labelData?.effects) {
          const hasEffects =
            (labelData.effects.stateVariablesSet &&
              labelData.effects.stateVariablesSet.length > 0) ||
            (labelData.effects.stateVariablesUnset &&
              labelData.effects.stateVariablesUnset.length > 0) ||
            (labelData.effects.meters &&
              Object.keys(labelData.effects.meters).length > 0);

          if (hasEffects) {
            const effectLines = generateEffectCode(
              labelData.effects,
              Math.round(currentLabelIndent / indentUnit) + 1
            );
            result.push(...effectLines);
            effectsInserted.add(currentLabel);
          }
        }
      }
    }

    result.push(line);
  }

  // Handle labels that don't end with jump/return/call
  // For these, we need to find the actual end of their label block in result
  for (const [labelTitle, labelData] of labelMap) {
    if (labelData?.effects && !effectsInserted.has(labelTitle)) {
      const hasEffects =
        (labelData.effects.stateVariablesSet &&
          labelData.effects.stateVariablesSet.length > 0) ||
        (labelData.effects.stateVariablesUnset &&
          labelData.effects.stateVariablesUnset.length > 0) ||
        (labelData.effects.meters &&
          Object.keys(labelData.effects.meters).length > 0);

      if (hasEffects) {
        // Find the label in result
        let labelIndex = -1;
        let labelIndent = 0;

        for (let i = 0; i < result.length; i++) {
          const indentMatch = result[i].match(/^(\s*)/);
          const labelMatch = result[i].match(RENPY_LABEL_REGEX);
          if (labelMatch && labelMatch[1] === labelTitle) {
            labelIndex = i;
            labelIndent = indentMatch?.[1]?.length ?? 0;
            break;
          }
        }

        if (labelIndex === -1) {
          // Label not found - this shouldn't happen if the file is well-formed
          process.stderr.write(
            `Warning: label '${labelTitle}' not found in RPY content, skipping effects\n`
          );
          continue;
        }

        // Scan forward from the label to find where its block ends
        // Block ends at: next label at same/lesser indent, or end of file
        let blockEndIndex = result.length; // Default to EOF

        for (let i = labelIndex + 1; i < result.length; i++) {
          const line = result[i];
          const lineIndent = line.match(/^(\s*)/)?.[1].length ?? 0;

          // Check if this line is a label declaration at same or lesser indent
          const labelMatch = line.match(RENPY_LABEL_REGEX);
          if (labelMatch && lineIndent <= labelIndent) {
            // Found another label at same or lesser indent level
            // This marks the end of the current label's block
            blockEndIndex = i;
            break;
          }
        }

        // Generate and splice effects at the computed position
        const effectLines = generateEffectCode(
          labelData.effects,
          Math.round(labelIndent / indentUnit) + 1
        );
        result.splice(blockEndIndex, 0, ...effectLines);
      }
    }
  }

  return result.join("\n");
}

/**
 * Generate a complete state variables initialization file
 * This creates a new RPY file content with all state variable defaults
 *
 * @param stateVariables - Array of state variable objects with key, description, category
 * @returns Complete RPY file content
 */
export function generateStateVariablesFile(
  stateVariables: Array<{
    key: string;
    description?: string | null;
    category?: string | null;
  }>
): string {
  const lines: string[] = [];

  // File header comment
  lines.push(
    "##############################################################################"
  );
  lines.push("# State Variables");
  lines.push("#");
  lines.push("# This file was automatically generated by BranchForge");
  lines.push("# Modifications may be overwritten during future exports");
  lines.push(
    "##############################################################################"
  );
  lines.push("");

  // Group by category
  const grouped = new Map<string, string[]>();
  for (const sv of stateVariables) {
    const category = sv.category?.trim() || "Uncategorized";
    if (!grouped.has(category)) {
      grouped.set(category, []);
    }
    grouped.get(category)!.push(sv.key);
  }

  // Generate init statements grouped by category
  for (const [category, keys] of grouped) {
    lines.push(`# ${category}`);
    for (const key of keys) {
      // Validate state variable key before using it
      if (!isValidRenpyIdentifier(key)) {
        process.stderr.write(
          `Warning: Skipping invalid state variable key in state variables file: "${key}"\n`
        );
        continue;
      }
      lines.push(`default ${key} = False`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Generate a complete Ren'Py definitions file
 * Creates definitions.rpy with all project definitions
 *
 * @param definitions - Array of definition objects with category, tag, displayName, definitionCode, sortOrder
 * @returns Complete RPY file content
 */
export function generateDefinitionsFile(
  definitions: Array<{
    category: string;
    tag: string;
    displayName: string;
    definitionCode: string;
    sortOrder: number;
  }>
): string {
  const lines: string[] = [];

  // File header
  lines.push(
    "##############################################################################"
  );
  lines.push("# Ren'Py Definitions");
  lines.push("#");
  lines.push("# This file was automatically generated by BranchForge");
  lines.push("# Modifications may be overwritten during future exports");
  lines.push(
    "##############################################################################"
  );
  lines.push("");

  // Category order for known categories
  const categoryOrder = ["CHARACTER", "TRANSFORM", "IMAGE", "INIT"];

  // Group and sort by category
  const grouped = new Map<string, typeof definitions>();
  for (const def of definitions) {
    if (!grouped.has(def.category)) {
      grouped.set(def.category, []);
    }
    grouped.get(def.category)!.push(def);
  }

  // Sort within each category by sortOrder
  for (const cat of grouped.keys()) {
    grouped.get(cat)!.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  // Output known categories in defined order, then any remaining categories
  const knownCategories = new Set(categoryOrder);
  const remainingCategories = Array.from(grouped.keys())
    .filter((cat) => !knownCategories.has(cat))
    .sort();

  // Output in category order
  for (const category of [...categoryOrder, ...remainingCategories]) {
    if (!grouped.has(category)) continue;

    lines.push(`# ${category}`);
    const defs = grouped.get(category)!;

    for (const def of defs) {
      lines.push(`# ${def.displayName} (${def.tag})`);
      lines.push(def.definitionCode);
    }
    lines.push("");
  }

  return lines.join("\n");
}
