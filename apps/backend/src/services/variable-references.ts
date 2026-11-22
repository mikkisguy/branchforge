import type { VariableReference } from "@branchforge/shared";

interface ReferenceSource {
  fileId: string;
  filePath: string;
  content: string;
}

const IDENTIFIER = String.raw`[_\p{ID_Start}][_\p{ID_Continue}]*`;
const DIRECT_NAME = new RegExp(`^${IDENTIFIER}$`, "u");
const BOOLEAN_COMPARISON = new RegExp(
  `^(${IDENTIFIER})\\s*(?:==|!=|\\bis(?:\\s+not)?\\b)\\s*(${IDENTIFIER})$`,
  "u"
);
const ASSIGNMENT = new RegExp(`^\\$\\s*(${IDENTIFIER})\\s*=(?!=)\\s*\\S`, "u");
const LABEL_PARAMETERS = /^label\s+[^\s(]+\s*\((.*)\)(?:\s*hide)?\s*:$/;
const SCREEN = /^screen\s+[^\s(:]+(?:\s*\((.*)\))?\s*:$/;
const SCREEN_DEFAULT = new RegExp(
  "^default\\s+(" + IDENTIFIER + ")\\s*=(?!=)",
  "u"
);
const SCREEN_LOOP = new RegExp("^for\\s+(" + IDENTIFIER + ")\\s+in\\s", "u");
const UNSUPPORTED_BLOCK_PREFIX =
  /^(?:(?:init(?:\s+[+-]?\d+)?\s+)?python\b|transform\s+|translate\s+\S+\s+python\b)/;

function unwrapCondition(expression: string): string {
  let start = 0;
  let end = expression.length - 1;
  while (start <= end) {
    while (/\s/.test(expression[start] ?? "")) start++;
    while (/\s/.test(expression[end] ?? "")) end--;
    if (expression[start] !== "(" || expression[end] !== ")") break;
    start++;
    end--;
  }
  return expression.slice(start, end + 1);
}

function conditionUsesKey(expression: string, key: string): boolean {
  const unwrapped = unwrapCondition(expression);
  const negation = /^not(?=\s|\()/.exec(unwrapped);
  const inner = negation
    ? unwrapCondition(unwrapped.slice(negation[0].length))
    : unwrapped;
  const comparison = BOOLEAN_COMPARISON.exec(inner);
  if (!comparison) return inner === key;
  const [, left, right] = comparison;
  return (
    (left === key && (right === "True" || right === "False")) ||
    (right === key && (left === "True" || left === "False"))
  );
}

function parametersShadowKey(parameters: string, key: string): boolean {
  let depth = 0;
  let start = 0;
  for (let index = 0; index <= parameters.length; index++) {
    const character = parameters[index];
    if (character === "(" || character === "[" || character === "{") depth++;
    if (character === ")" || character === "]" || character === "}") depth--;
    if (index === parameters.length || (character === "," && depth === 0)) {
      const parameter = parameters.slice(start, index).trimStart();
      if (parameter.split(/[\s=:]/, 1)[0].replace(/^\*+/, "") === key) {
        return true;
      }
      start = index + 1;
    }
  }
  return false;
}

/** Treat quoted text as a token so it cannot turn into a bare name. */
function sourceCodeLines(content: string): string[] {
  let delimiter = "";
  return content.split(/\r?\n/).map((line) => {
    let code = delimiter ? "@" : "";
    for (let index = 0; index < line.length; index++) {
      const character = line[index];
      if (delimiter) {
        if (character === "\\") {
          index++;
        } else if (line.startsWith(delimiter, index)) {
          index += delimiter.length - 1;
          delimiter = "";
        }
      } else if (character === "#") {
        break;
      } else if (character === "'" || character === '"') {
        const triple = character.repeat(3);
        delimiter = line.startsWith(triple, index) ? triple : character;
        index += delimiter.length - 1;
        code += "@";
      } else {
        code += character;
      }
    }
    if (delimiter.length === 1 && !line.endsWith("\\")) delimiter = "";
    return code;
  });
}

function indentation(line: string): number {
  let width = 0;
  for (const character of line) {
    if (character === " ") width++;
    else if (character === "\t") width += 8 - (width % 8);
    else break;
  }
  return width;
}

function screenDefaultShadowsKey(
  lines: readonly string[],
  start: number,
  screenIndent: number,
  key: string
): boolean {
  let bodyIndent: number | undefined;
  for (let index = start; index < lines.length; index++) {
    const statement = lines[index].trim();
    if (!statement || statement === "@") continue;
    const indent = indentation(lines[index]);
    if (indent <= screenIndent) break;
    bodyIndent ??= indent;
    if (indent === bodyIndent && SCREEN_DEFAULT.exec(statement)?.[1] === key) {
      return true;
    }
  }
  return false;
}

/** Locate supported direct references in active Ren'Py script source. */
export function findVariableReferences(
  key: string,
  sources: readonly ReferenceSource[]
): VariableReference[] {
  if (!DIRECT_NAME.test(key)) return [];

  const references: VariableReference[] = [];
  for (const { fileId, filePath, content } of sources) {
    const lines = sourceCodeLines(content);
    let excludedIndent: number | undefined;
    let screenIndent: number | undefined;
    for (const [index, line] of lines.entries()) {
      const statement = line.trim();
      if (!statement || statement === "@") continue;

      const indent = indentation(line);
      if (excludedIndent !== undefined && indent > excludedIndent) continue;
      excludedIndent = undefined;
      if (screenIndent !== undefined && indent <= screenIndent) {
        screenIndent = undefined;
      }

      const screen = SCREEN.exec(statement);
      if (screen) {
        screenIndent = indent;
        if (
          (screen[1] && parametersShadowKey(screen[1], key)) ||
          screenDefaultShadowsKey(lines, index + 1, indent, key)
        ) {
          excludedIndent = indent;
        }
        continue;
      }

      const parameters = LABEL_PARAMETERS.exec(statement)?.[1];
      if (
        (statement.endsWith(":") && UNSUPPORTED_BLOCK_PREFIX.test(statement)) ||
        (parameters && parametersShadowKey(parameters, key)) ||
        (screenIndent !== undefined && SCREEN_LOOP.exec(statement)?.[1] === key)
      ) {
        excludedIndent = indent;
        continue;
      }

      const condition = /^(?:if|elif)\s+(.+):$/.exec(statement)?.[1];
      if (condition && conditionUsesKey(condition, key)) {
        references.push({
          fileId,
          filePath,
          line: index + 1,
          kind: "condition",
        });
      } else if (
        screenIndent === undefined &&
        ASSIGNMENT.exec(statement)?.[1] === key
      ) {
        references.push({
          fileId,
          filePath,
          line: index + 1,
          kind: "assignment",
        });
      }
    }
  }
  return references;
}
