import {
  characterSourceDefinitionSchema,
  type CharacterNameType,
  type CharacterSourceDefinition,
} from "@branchforge/shared";
import { classifyName } from "./character-parser/name-resolution.js";
import { canonicalizeColor, normalizeColor } from "./character-parser/color.js";

interface Token {
  start: number;
  end: number;
  text: string;
  kind: "string" | "word" | "punctuation";
}

interface Span {
  start: number;
  end: number;
}

export interface ParsedCharacterDefinition extends Span {
  tag: string;
  name: string | null;
  nameType: CharacterNameType;
  displayName: string;
  color: string;
  sourceDefinition: CharacterSourceDefinition;
  tagSpan: Span;
  nameSpan: Span;
  colorSpan: Span | null;
  closeParen: number;
  lastArgumentEnd: number;
  trailingComma: boolean;
}

const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const SAFE_NAME_REFERENCE =
  /^[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*$/;
const OPEN_TO_CLOSE: Record<string, string> = {
  "(": ")",
  "[": "]",
  "{": "}",
};

/** A single lexer supplies spans for detection and editing; Python is never run. */
function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  for (let i = 0; i < source.length;) {
    if (/\s/.test(source[i]) || (i === 0 && source[i] === "\uFEFF")) {
      i++;
      continue;
    }
    if (source[i] === "#") {
      const newline = source.indexOf("\n", i);
      i = newline === -1 ? source.length : newline + 1;
      continue;
    }
    const start = i;
    const quote = source[i];
    if (quote === '"' || quote === "'") {
      const delimiter = source.startsWith(quote.repeat(3), i)
        ? quote.repeat(3)
        : quote;
      i += delimiter.length;
      let closed = false;
      while (i < source.length) {
        if (source[i] === "\\") {
          i += 2;
        } else if (source.startsWith(delimiter, i)) {
          i += delimiter.length;
          closed = true;
          break;
        } else if (source[i] === "\n" && delimiter.length === 1) {
          break;
        } else {
          i++;
        }
      }
      // An unterminated string makes the remainder unsafe to inspect.
      if (!closed) break;
      tokens.push({
        start,
        end: i,
        text: source.slice(start, i),
        kind: "string",
      });
    } else if (/[a-zA-Z_]/.test(source[i])) {
      while (i < source.length && /[a-zA-Z0-9_]/.test(source[i])) i++;
      tokens.push({
        start,
        end: i,
        text: source.slice(start, i),
        kind: "word",
      });
    } else {
      i++;
      tokens.push({
        start,
        end: i,
        text: source.slice(start, i),
        kind: "punctuation",
      });
    }
  }
  return tokens;
}

/** Decode only plain quoted strings. Unsupported escape forms stay source-owned. */
function decodeString(raw: string): string | null {
  if (raw.startsWith('"""') || raw.startsWith("'''")) return null;
  if (!/^(["'])[\s\S]*\1$/.test(raw)) return null;
  let result = "";
  const escapes: Record<string, string> = {
    n: "\n",
    r: "\r",
    t: "\t",
    b: "\b",
    f: "\f",
    v: "\v",
    "\\": "\\",
    '"': '"',
    "'": "'",
  };
  for (let i = 1; i < raw.length - 1; i++) {
    if (raw[i] !== "\\") {
      result += raw[i];
      continue;
    }
    const escaped = raw[++i];
    if (escaped === undefined) return null;
    if (escaped === "\n") continue;
    if (escaped in escapes) {
      result += escapes[escaped];
    } else if (escaped === "x" || escaped === "u" || escaped === "U") {
      const length = escaped === "x" ? 2 : escaped === "u" ? 4 : 8;
      const hex = raw.slice(i + 1, i + 1 + length);
      if (hex.length !== length || !/^[\da-fA-F]+$/.test(hex)) return null;
      const code = parseInt(hex, 16);
      if (code > 0x10ffff) return null;
      result += String.fromCodePoint(code);
      i += length;
    } else if (/[0-7N]/.test(escaped)) {
      return null;
    } else {
      result += "\\" + escaped;
    }
  }
  return result;
}

function parseAt(
  source: string,
  tokens: Token[],
  index: number
): {
  definition: ParsedCharacterDefinition;
  next: number;
} | null {
  const prefix = tokens.slice(index, index + 5);
  if (
    prefix.length !== 5 ||
    !SAFE_IDENTIFIER.test(prefix[1].text) ||
    prefix[2].text !== "=" ||
    prefix[3].text !== "Character" ||
    prefix[4].text !== "("
  )
    return null;
  // The declaration prefix must be on one line; multiline calls start at `(`.
  for (let i = 1; i < prefix.length; i++) {
    if (!/^[ \t]*$/.test(source.slice(prefix[i - 1].end, prefix[i].start)))
      return null;
  }
  const groups: Token[][] = [];
  let group: Token[] = [];
  const stack = [")"];
  let closeIndex = -1;
  let trailingComma = false;
  for (let i = index + 5; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.kind === "punctuation") {
      if (token.text in OPEN_TO_CLOSE) {
        stack.push(OPEN_TO_CLOSE[token.text]);
      } else if ([")", "]", "}"].includes(token.text)) {
        if (stack.pop() !== token.text) return null;
        if (stack.length === 0) {
          closeIndex = i;
          break;
        }
      } else if (token.text === "," && stack.length === 1) {
        if (group.length === 0) return null;
        groups.push(group);
        group = [];
        trailingComma = true;
        continue;
      }
    }
    group.push(token);
    trailingComma = false;
  }
  if (closeIndex === -1) return null;
  if (group.length) groups.push(group);
  if (groups.length === 0) return null;
  const close = tokens[closeIndex];
  const newline = source.indexOf("\n", close.end);
  const end = newline === -1 ? source.length : newline;
  if (!/^[ \t\r]*(?:#[^\n]*)?$/.test(source.slice(close.end, end))) return null;

  const first = groups[0];
  const nameSpan = { start: first[0].start, end: first[first.length - 1].end };
  const rawName = source.slice(nameSpan.start, nameSpan.end);
  let name: string | null;
  let form: "quoted" | "identifier" | "bracketed" | null;
  if (first.length === 1 && first[0].kind === "string") {
    name = decodeString(rawName);
    if (name === null) return null;
    form = "quoted";
  } else if (rawName === "None") {
    name = null;
    form = null;
  } else if (SAFE_NAME_REFERENCE.test(rawName)) {
    name = rawName;
    form = "identifier";
  } else if (
    rawName.startsWith("[") &&
    rawName.endsWith("]") &&
    SAFE_NAME_REFERENCE.test(rawName.slice(1, -1))
  ) {
    name = rawName;
    form = "bracketed";
  } else {
    return null;
  }

  const kwargs = new Map<string, Token[]>();
  for (const argument of groups.slice(1)) {
    if (
      argument.length < 3 ||
      argument[0].kind !== "word" ||
      argument[1].text !== "=" ||
      kwargs.has(argument[0].text)
    )
      return null;
    kwargs.set(argument[0].text, argument.slice(2));
  }
  const colorTokens = kwargs.get("who_color") ?? kwargs.get("color");
  const literalColor =
    colorTokens?.length === 1 && colorTokens[0].kind === "string"
      ? decodeString(colorTokens[0].text)
      : null;
  const normalized =
    literalColor === null ? "#cfcfcf" : normalizeColor(literalColor);
  const color = /^#[\da-fA-F]{6}$/.test(normalized) ? normalized : "#cfcfcf";
  const { nameType, displayName } = classifyName(name, form);
  const start = prefix[0].start;
  const sourceDefinition: CharacterSourceDefinition = {
    declaration: source.slice(start, end),
    name,
    nameType,
    color,
  };
  return {
    definition: {
      start,
      end,
      tag: prefix[1].text,
      name,
      nameType,
      displayName,
      color,
      sourceDefinition,
      tagSpan: prefix[1],
      nameSpan,
      colorSpan: colorTokens
        ? {
            start: colorTokens[0].start,
            end: colorTokens[colorTokens.length - 1].end,
          }
        : null,
      closeParen: close.start,
      lastArgumentEnd: groups[groups.length - 1].at(-1)!.end,
      trailingComma,
    },
    next: closeIndex,
  };
}

/** Unsafe forms remain source-owned; callers must not strip them separately. */
export function parseCharacterDefinitions(
  source: string
): ParsedCharacterDefinition[] {
  const tokens = tokenize(source);
  const definitions: ParsedCharacterDefinition[] = [];
  const stack: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const lineStart = source.lastIndexOf("\n", token.start - 1) + 1;
    if (
      stack.length === 0 &&
      token.kind === "word" &&
      ["define", "default"].includes(token.text) &&
      (token.start === lineStart ||
        (token.start === 1 && source[0] === "\uFEFF"))
    ) {
      const parsed = parseAt(source, tokens, i);
      if (parsed) {
        definitions.push(parsed.definition);
        i = parsed.next;
        continue;
      }
    }
    if (token.kind === "punctuation") {
      if (token.text in OPEN_TO_CLOSE) stack.push(OPEN_TO_CLOSE[token.text]);
      else if (token.text === stack.at(-1)) stack.pop();
    }
  }
  return definitions;
}

function quoteName(name: string): string {
  return JSON.stringify(name)
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** Compare retained options without confusing name/color edits with styling. */
export function characterStylingSignature(
  metadata: CharacterSourceDefinition | null | undefined
): string | null {
  if (!metadata) return null;
  const parsed = parseCharacterDefinitions(metadata.declaration)[0];
  if (!parsed) return null;
  const edits: Array<Span & { replacement: string }> = [
    { ...parsed.tagSpan, replacement: "_character" },
    { ...parsed.nameSpan, replacement: '"_name"' },
  ];
  if (
    parsed.colorSpan &&
    decodeString(
      metadata.declaration.slice(parsed.colorSpan.start, parsed.colorSpan.end)
    ) !== null
  ) {
    edits.push({ ...parsed.colorSpan, replacement: '"_color"' });
  }
  let source = metadata.declaration;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    source =
      source.slice(0, edit.start) + edit.replacement + source.slice(edit.end);
  }
  return tokenize(source)
    .map((token) =>
      token.kind === "string"
        ? JSON.stringify(decodeString(token.text) ?? token.text)
        : token.text
    )
    .join(" ");
}

export function renderCharacterSourceDefinition(
  metadata: CharacterSourceDefinition,
  character: {
    renpyTag: string;
    name: string | null;
    nameType: CharacterNameType;
    color: string;
  }
): string | null {
  const validated = characterSourceDefinitionSchema.safeParse(metadata);
  if (
    !validated.success ||
    !SAFE_IDENTIFIER.test(character.renpyTag) ||
    !/^#[\da-fA-F]{6}$/.test(character.color)
  )
    return null;
  const parsed = parseCharacterDefinitions(metadata.declaration);
  const original = parsed[0];
  if (
    parsed.length !== 1 ||
    !original ||
    original.start !== 0 ||
    original.end !== metadata.declaration.length ||
    original.name !== metadata.name ||
    original.nameType !== metadata.nameType ||
    canonicalizeColor(original.color) !== canonicalizeColor(metadata.color)
  )
    return null;
  const edits: Array<Span & { replacement: string }> = [];
  if (character.renpyTag !== original.tag) {
    edits.push({ ...original.tagSpan, replacement: character.renpyTag });
  }
  const name =
    character.nameType === "none"
      ? null
      : character.nameType === "empty"
        ? ""
        : character.name;
  if (name !== metadata.name || character.nameType !== metadata.nameType) {
    let replacement: string;
    if (character.nameType === "none") replacement = "None";
    else if (character.nameType === "variable") {
      if (name === null || !SAFE_NAME_REFERENCE.test(name)) return null;
      replacement = name;
    } else replacement = quoteName(name ?? "");
    edits.push({ ...original.nameSpan, replacement });
  }
  if (
    canonicalizeColor(character.color) !== canonicalizeColor(metadata.color)
  ) {
    if (original.colorSpan) {
      edits.push({
        ...original.colorSpan,
        replacement: quoteName(character.color),
      });
    } else {
      // Insert before the closing parenthesis, after existing comments/commas.
      // A newline keeps a trailing comment from swallowing the new argument.
      const multiline = metadata.declaration
        .slice(original.lastArgumentEnd, original.closeParen)
        .includes("\n");
      edits.push({
        start: original.closeParen,
        end: original.closeParen,
        replacement: `${original.trailingComma ? "" : ","}${multiline ? "\n    " : " "}color=${quoteName(character.color)}${original.trailingComma ? "," : ""}`,
      });
    }
  }
  let result = metadata.declaration;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    result =
      result.slice(0, edit.start) + edit.replacement + result.slice(edit.end);
  }
  return result;
}
