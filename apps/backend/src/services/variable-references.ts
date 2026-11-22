import type { VariableReference } from "@branchforge/shared";

interface ReferenceSource {
  fileId: string;
  filePath: string;
  content: string;
  contentHash: string;
}

const DIRECT_NAME = /^[_\p{ID_Start}][_\p{ID_Continue}]*$/u;
const ASSIGNMENT = /^\$\s*([_\p{ID_Start}][_\p{ID_Continue}]*)\s*=(?!=)\s*\S/u;
const LABEL_PARAMETERS = /^label\s+[^\s(]+\s*\((.*)\)(?:\s*hide)?\s*:$/;
const SCREEN_HEADER = /^screen\s+[^\s(:]+/;
const SCREEN_DEFAULT =
  /^default\s+([_\p{ID_Start}][_\p{ID_Continue}]*)\s*=(?!=)/u;
const SCREEN_LOOP =
  /^for\s+([_\p{ID_Start}][_\p{ID_Continue}]*)\s+(?:index\s|in\s+(?<items>.+):$)/u;
// A plain list of literal values is known to yield at least one item.
const NONEMPTY_LITERAL_LIST =
  /^\[\s*(?:True|False|None|@|[+-]?\d+)(?:\s*,\s*(?:True|False|None|@|[+-]?\d+))*\s*(?:,\s*)?\]$/;
const UNSUPPORTED_BLOCK_PREFIX =
  /^(?:(?:init(?:\s+[+-]?\d+)?\s+)?python\b|transform\s+|translate\s+\S+\s+python\b)/;

function unwrapCondition(expression: string): string {
  const trimmed = expression.trim();
  if (!trimmed.startsWith("(") || !trimmed.endsWith(")")) return trimmed;

  const starts: number[] = [];
  const closingByStart = new Map<number, number>();
  for (let index = 0; index < trimmed.length; index++) {
    if (trimmed[index] === "(") starts.push(index);
    if (trimmed[index] === ")") {
      const start = starts.pop();
      if (start === undefined) return trimmed;
      closingByStart.set(start, index);
    }
  }

  let start = 0;
  let end = trimmed.length - 1;
  while (closingByStart.get(start) === end) {
    start++;
    end--;
    while (/\s/.test(trimmed[start] ?? "")) start++;
    while (/\s/.test(trimmed[end] ?? "")) end--;
  }
  return trimmed.slice(start, end + 1);
}

function conditionUsesKey(expression: string, key: string): boolean {
  const unwrapped = unwrapCondition(expression);
  const negation = /^not(?=\s|\()/.exec(unwrapped);
  const inner = negation
    ? unwrapCondition(unwrapped.slice(negation[0].length))
    : unwrapped;
  const operands = inner.split(
    /==|!=|(?<![_\p{ID_Continue}])is(?:\s+not)?(?![_\p{ID_Continue}])/u
  );
  if (operands.length !== 2) return inner === key;
  const [left, right] = operands.map(unwrapCondition);
  return (
    (left === key && (right === "True" || right === "False")) ||
    (right === key && (left === "True" || left === "False"))
  );
}

// Read only the initial parameter group. Inline property values can also
// contain parentheses, including calls with keyword arguments.
function screenParameters(suffix: string): string | undefined {
  const text = suffix.trimStart();
  if (!text.startsWith("(")) return undefined;
  let depth = 0;
  for (let index = 0; index < text.length; index++) {
    if (text[index] === "(") depth++;
    if (text[index] === ")" && --depth === 0) return text.slice(1, index);
  }
  return undefined;
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
  for (const { fileId, filePath, content, contentHash } of sources) {
    const lines = sourceCodeLines(content);
    let excludedIndent: number | undefined;
    let screen:
      { indent: number; bodyIndent?: number; loopBound?: boolean } | undefined;
    for (const [index, line] of lines.entries()) {
      const statement = line.trim();
      if (!statement || statement === "@") continue;

      const indent = indentation(line);
      if (excludedIndent !== undefined && indent > excludedIndent) continue;
      excludedIndent = undefined;
      if (screen && indent <= screen.indent) screen = undefined;
      if (screen?.loopBound) continue;
      if (screen) screen.bodyIndent ??= indent;

      const header = SCREEN_HEADER.exec(statement);
      if (header && statement.endsWith(":")) {
        screen = { indent };
        const parameters = screenParameters(statement.slice(header[0].length));
        if (
          (parameters && parametersShadowKey(parameters, key)) ||
          screenDefaultShadowsKey(lines, index + 1, indent, key)
        ) {
          excludedIndent = indent;
        }
        continue;
      }

      const parameters = LABEL_PARAMETERS.exec(statement)?.[1];
      if (
        (statement.endsWith(":") && UNSUPPORTED_BLOCK_PREFIX.test(statement)) ||
        (parameters && parametersShadowKey(parameters, key))
      ) {
        excludedIndent = indent;
        continue;
      }

      const loop = screen && SCREEN_LOOP.exec(statement);
      if (screen && loop?.[1] === key && statement.endsWith(":")) {
        excludedIndent = indent;
        // At the screen's top level, a definitely nonempty loop also
        // leaves its target bound for the statements that follow it.
        const items = loop.groups?.items;
        screen.loopBound =
          indent === screen.bodyIndent &&
          !!items &&
          NONEMPTY_LITERAL_LIST.test(items.trim());
        continue;
      }

      const condition = /^(?:if|elif)\s+(.+):$/.exec(statement)?.[1];
      if (condition && conditionUsesKey(condition, key)) {
        references.push({
          fileId,
          filePath,
          contentHash,
          line: index + 1,
          kind: "condition",
        });
      } else if (!screen && ASSIGNMENT.exec(statement)?.[1] === key) {
        references.push({
          fileId,
          filePath,
          contentHash,
          line: index + 1,
          kind: "assignment",
        });
      }
    }
  }
  return references;
}
