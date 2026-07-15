import type { ComparisonOperator } from "@branchforge/shared";
import type { TechnicalConstructs } from "./types.js";
import { getIndent, countLinesInChoice } from "./helpers.js";

/**
 * Extract technical constructs from a specific line in RPY content.
 * Internal version that accepts pre-split lines to avoid repeated splitting.
 *
 * @param lines - Pre-split RPY file lines
 * @param lineNumber - Line number to analyze (0-based)
 * @returns Technical constructs found at or related to this line
 */
export function extractTechnicalConstructsFromLines(
  lines: string[],
  lineNumber: number
): TechnicalConstructs {
  const constructs: TechnicalConstructs = {};

  // Bounds check
  if (lineNumber < 0 || lineNumber >= lines.length) {
    return constructs;
  }

  const line = lines[lineNumber];

  // Guard against ReDoS on maliciously long lines
  const MAX_LINE_LENGTH = 5000;
  if (line.length > MAX_LINE_LENGTH) {
    return constructs;
  }

  const trimmed = line.trim();

  // Extract jump (negative lookahead skips dynamic "jump expression")
  const jumpMatch = trimmed.match(
    /^jump\s+(?!expression\b)([a-zA-Z_][a-zA-Z0-9_]*)/
  );
  if (jumpMatch) {
    constructs.jumpTarget = jumpMatch[1];
    return constructs;
  }

  // Extract scene/show/hide
  const sceneMatch = trimmed.match(/^scene\s+(.+?)(?:\s+with\s+(\S+))?$/);
  const showMatch = trimmed.match(
    /^show\s+(.+?)(?:\s+at\s+(\S+))?(?:\s+zorder\s+(\d+))?(?:\s+with\s+(\S+))?$/
  );
  const hideMatch = trimmed.match(/^hide\s+(\S+)(?:\s+with\s+(\S+))?$/);

  if (sceneMatch) {
    constructs.visuals = constructs.visuals || [];
    constructs.visuals.push({
      type: "SCENE",
      target: sceneMatch[1],
      with: sceneMatch[2],
    });
    return constructs;
  } else if (showMatch) {
    constructs.visuals = constructs.visuals || [];
    constructs.visuals.push({
      type: "SHOW",
      target: showMatch[1],
      at: showMatch[2],
      zorder: showMatch[3] ? Number.parseInt(showMatch[3], 10) : undefined,
      with: showMatch[4],
    });
    return constructs;
  } else if (hideMatch) {
    constructs.visuals = constructs.visuals || [];
    constructs.visuals.push({
      type: "HIDE",
      target: hideMatch[1],
      with: hideMatch[2],
    });
    return constructs;
  }

  // Extract menu choices
  if (trimmed.startsWith("menu:")) {
    constructs.choices = [];
    const indentLevel = getIndent(line);

    for (let i = lineNumber + 1; i < lines.length; i++) {
      const menuLine = lines[i];
      const menuTrimmed = menuLine.trim();

      // Skip blank/whitespace-only lines between choices
      if (menuTrimmed.length === 0) continue;

      // End of menu block
      if (getIndent(menuLine) <= indentLevel) {
        break;
      }

      // Guard against ReDoS on maliciously long menu lines
      if (menuTrimmed.length > MAX_LINE_LENGTH) continue;

      // Extract choice
      const choiceMatch = menuTrimmed.match(
        /^"([^"]+)"(?:\s+(if\s+[^:]+))?:\s*$/
      );
      if (choiceMatch) {
        const choice = {
          label: choiceMatch[1],
          condition: choiceMatch[2] || undefined,
          targetLabelId: "",
          targetLabelName: "",
          effects: { stats: {} as Record<string, number> },
        };

        // Look for jump and stat changes in choice body
        const choiceIndent = getIndent(menuLine);
        for (
          let j = i + 1;
          j < lines.length && getIndent(lines[j]) > choiceIndent;
          j++
        ) {
          const bodyLine = lines[j].trim();

          // Extract jump target
          const jumpInChoice = bodyLine.match(
            /^jump\s+(?!expression\b)([a-zA-Z_][a-zA-Z0-9_]*)/
          );
          if (jumpInChoice) {
            choice.targetLabelId = jumpInChoice[1];
            choice.targetLabelName = jumpInChoice[1];
          }

          // Extract stat changes (e.g., $ affection_luna += 10)
          const statMatch = bodyLine.match(
            /\$\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(\+=|-=)\s*(-?\d+)/
          );
          if (statMatch) {
            const statName = statMatch[1];
            const operator = statMatch[2];
            const value = Number.parseInt(statMatch[3], 10);

            if (operator === "+=") {
              const prev = choice.effects.stats[statName] || 0;
              choice.effects.stats[statName] = prev + value;
            } else if (operator === "-=") {
              const prev = choice.effects.stats[statName] || 0;
              choice.effects.stats[statName] = prev - value;
            }
          }
        }

        constructs.choices.push(choice);

        // Clean up empty effects/effects.stats
        if (Object.keys(choice.effects.stats).length === 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          delete (choice as any).effects.stats;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!(choice as any).effects.stats) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          delete (choice as any).effects;
        }

        i += countLinesInChoice(lines, i);
      }
    }

    return constructs;
  }

  // Extract if/elif conditions
  if (/^if\s+/.test(trimmed) || /^elif\s+/.test(trimmed)) {
    constructs.conditions = {
      stats: {},
      statDeltas: {},
      variables: {},
    };

    // Remove leading if/elif keyword and trailing colon
    let conditionExpr = trimmed.replace(/^(if|elif)\s+/, "").trim();

    // Remove trailing colons non-regex to avoid ReDoS
    while (conditionExpr.endsWith(":")) {
      conditionExpr = conditionExpr.slice(0, -1);
    }

    // Extract stat comparisons: e.g., "strength >= 5" or "magic < 10"
    // Limitations: Does not handle variable comparisons (e.g., "strength >= max_value")
    const statRegex = /([a-zA-Z_][a-zA-Z0-9_]*)\s*(>=|<=|>|<|==|!=)\s*(-?\d+)/g;
    const statMatches = conditionExpr.matchAll(statRegex);
    for (const statMatch of statMatches) {
      const statName = statMatch[1];
      const operator = statMatch[2] as ComparisonOperator;
      const value = Number.parseInt(statMatch[3], 10);
      constructs.conditions.stats![statName] = { value, operator };
    }

    // Extract variable conditions (bare identifiers, not-patterns, string/boolean comparisons)
    const keywords = new Set([
      "if",
      "elif",
      "and",
      "or",
      "not",
      "True",
      "False",
      "None",
      "else",
    ]);
    // Split on logical connectives while respecting quoted strings,
    // so that e.g. `var == "fire and ice"` is not broken apart.
    const varParts = splitConditionParts(conditionExpr);
    for (const part of varParts) {
      // Skip parts already handled by stat extraction (numeric comparisons)
      if (
        /^[a-zA-Z_][a-zA-Z0-9_]*\s*(>=|<=|>|<|==|!=)\s*-?\d+\s*$/.test(part)
      ) {
        continue;
      }

      // String comparison: var == "value"
      const strEqMatch = part.match(
        /^([a-zA-Z_][a-zA-Z0-9_]*)\s*==\s*"([^"]*)"$/
      );
      if (strEqMatch && !keywords.has(strEqMatch[1])) {
        constructs.conditions.variables![strEqMatch[1]] = {
          value: strEqMatch[2],
          operator: "==",
        };
        continue;
      }

      // String comparison: var != "value"
      const strNeqMatch = part.match(
        /^([a-zA-Z_][a-zA-Z0-9_]*)\s*!=\s*"([^"]*)"$/
      );
      if (strNeqMatch && !keywords.has(strNeqMatch[1])) {
        constructs.conditions.variables![strNeqMatch[1]] = {
          value: strNeqMatch[2],
          operator: "!=",
        };
        continue;
      }

      // Boolean comparison: var == True/False
      const boolEqMatch = part.match(
        /^([a-zA-Z_][a-zA-Z0-9_]*)\s*==\s*(True|False)$/
      );
      if (boolEqMatch && !keywords.has(boolEqMatch[1])) {
        constructs.conditions.variables![boolEqMatch[1]] = {
          value: boolEqMatch[2] === "True",
          operator: "==",
        };
        continue;
      }

      // Boolean comparison: var != True/False
      const boolNeqMatch = part.match(
        /^([a-zA-Z_][a-zA-Z0-9_]*)\s*!=\s*(True|False)$/
      );
      if (boolNeqMatch && !keywords.has(boolNeqMatch[1])) {
        constructs.conditions.variables![boolNeqMatch[1]] = {
          value: boolNeqMatch[2] === "True",
          operator: "!=",
        };
        continue;
      }

      // Not pattern: not var_name
      const notMatch = part.match(/^not\s+([a-zA-Z_][a-zA-Z0-9_]*)$/);
      if (
        notMatch &&
        !keywords.has(notMatch[1]) &&
        !constructs.conditions.variables![notMatch[1]]
      ) {
        constructs.conditions.variables![notMatch[1]] = {
          value: true,
          operator: "falsy",
        };
        continue;
      }

      // Bare identifier (truthy check)
      // Use matchAll with a simple identifier regex, then filter out
      // function calls separately to avoid ReDoS in the lookahead.
      for (const m of part.matchAll(/[a-zA-Z_][a-zA-Z0-9_]*/g)) {
        const varName = m[0];
        if (
          keywords.has(varName) ||
          constructs.conditions.variables![varName]
        ) {
          continue;
        }
        // Skip identifiers that are function calls (followed by '(',
        // optionally with whitespace between the name and the paren).
        const after = part.slice(m.index + varName.length);
        if (/^\s*\(/.test(after)) continue;
        constructs.conditions.variables![varName] = {
          value: true,
          operator: "truthy",
        };
      }
    }

    // Look ahead into the condition block for $ stat modifications
    const ifIndent = getIndent(line);
    for (let j = lineNumber + 1; j < lines.length; j++) {
      const bodyLine = lines[j];
      const bodyTrimmed = bodyLine.trim();

      // Exit when indentation drops back to or below the if level
      // Skip blank lines (continue, don't break)
      if (bodyTrimmed.length === 0) continue;
      if (getIndent(bodyLine) <= ifIndent) break;

      // Check for $ stat += value style modifications
      const statModMatch = bodyTrimmed.match(
        /\$\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(\+=|-=)\s*(-?\d+)/
      );
      if (statModMatch) {
        const statName = statModMatch[1];
        const operator = statModMatch[2];
        const value = Number.parseInt(statModMatch[3], 10);

        // Store deltas separately to preserve thresholds from if-expressions
        const prev = constructs.conditions.statDeltas![statName] || 0;
        constructs.conditions.statDeltas![statName] =
          prev + (operator === "+=" ? value : -value);
      }
    }

    // Clean up empty arrays/objects
    if (Object.keys(constructs.conditions.stats!).length === 0) {
      delete constructs.conditions.stats;
    }
    if (Object.keys(constructs.conditions.statDeltas!).length === 0) {
      delete constructs.conditions.statDeltas;
    }
    if (Object.keys(constructs.conditions.variables!).length === 0) {
      delete constructs.conditions.variables;
    }
    if (
      !constructs.conditions.stats &&
      !constructs.conditions.statDeltas &&
      !constructs.conditions.variables
    ) {
      delete constructs.conditions;
    }

    return constructs;
  }

  return constructs;
}

/**
 * Extract technical constructs from a specific line in RPY content.
 * Public wrapper that splits content into lines and delegates to the
 * internal implementation.
 *
 * @param rpyContent - Full RPY file content
 * @param lineNumber - Line number to analyze (0-based)
 * @returns Technical constructs found at or related to this line
 */
export function extractTechnicalConstructs(
  rpyContent: string,
  lineNumber: number
): TechnicalConstructs {
  return extractTechnicalConstructsFromLines(
    rpyContent.split("\n"),
    lineNumber
  );
}

/**
 * Split a Ren'Py condition expression on logical connectives (and, or, &&, ||)
 * while respecting double-quoted string literals so that connective words
 * inside quoted values (e.g. `var == "fire and ice"`) are not treated as
 * operators.
 *
 * Returns an array of trimmed individual condition strings.
 */
export function splitConditionParts(expr: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inString = false;
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i];

    // Handle escape sequences inside strings
    if (inString && ch === "\\" && i + 1 < expr.length) {
      current += ch + expr[i + 1];
      i += 2;
      continue;
    }

    // Toggle string mode on double quote
    if (ch === '"') {
      inString = !inString;
      current += ch;
      i++;
      continue;
    }

    // Outside strings, check for connective operators
    if (!inString) {
      // Try to match a connective at this position, bounded by whitespace
      const rest = expr.slice(i);
      const connectiveMatch = rest.match(/^(\s+(?:and|or|&&|\|\|)\s+)/);
      if (connectiveMatch) {
        const trimmed = current.trim();
        if (trimmed.length > 0) {
          parts.push(trimmed);
        }
        current = "";
        i += connectiveMatch[1].length;
        continue;
      }
    }

    current += ch;
    i++;
  }

  // Push the last accumulated part
  const trimmed = current.trim();
  if (trimmed.length > 0) {
    parts.push(trimmed);
  }

  return parts;
}
