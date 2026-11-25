import type { DetectedCharacter } from "@branchforge/shared";
import {
  characterDeclarationSignature,
  parseCharacterDefinitions,
} from "../character-source-definition.js";
import { characterParserService } from "../character-parser.service.js";
import { isValidRenpyIdentifier } from "../rpy-generator.service.js";
import {
  collectGlobalDeclarationLines,
  collectSourceOwnedRpyDeclarations,
  parseRpyDefaultLine,
  type DetectedDefaultStatement,
} from "../rpy-statements.service.js";
import { GitLabGeneratedImportError } from "./gitlab-error.helpers.js";

const generatedKinds = new Map<string, Declaration["kind"]>([
  ["branchforge_variables.rpy", "variable"],
  ["branchforge_stats.rpy", "stat"],
  ["branchforge_definitions.rpy", "character"],
]);

export function generatedDeclarationKind(fileName: string) {
  return generatedKinds.get(fileName.toLowerCase());
}

interface SourceFile {
  path: string;
  content: string;
}

type Declaration = {
  key: string;
  kind: "character" | "variable" | "stat";
  signature: string;
  location: string;
  endLine: number;
  value: DetectedDefaultStatement | null;
};

function location(path: string, line: number, endLine = line): string {
  const lines =
    endLine === line ? String(line + 1) : `${line + 1}–${endLine + 1}`;
  return `${JSON.stringify(path)} line ${lines}`;
}

function defaultSignature({ kind, value }: DetectedDefaultStatement): string {
  if (kind === "variable") return value;
  const [integer, fraction] = value.split(".");
  const normalized = integer.replace(/^(-?)0+(?=\d)/, "$1");
  // An integer and a float can compare equal in Python but have different
  // types. Keep the decimal point in the signature for integral floats.
  if (fraction === undefined) return normalized === "-0" ? "0" : normalized;
  return `${normalized}.${fraction.replace(/0+$/, "")}`;
}

function indexDeclarations({ path, content }: SourceFile) {
  const lines = content.replace(/^\uFEFF/, "").split("\n");
  const globalNames = collectGlobalDeclarationLines(content);
  const declarations = new Map<number, Declaration>();
  // Translate offsets to line numbers in a single walk through sorted spans.
  let line = 0;
  let newline = content.indexOf("\n");
  function lineAt(offset: number) {
    while (newline !== -1 && newline < offset) {
      line++;
      newline = content.indexOf("\n", newline + 1);
    }
    return line;
  }
  for (const character of parseCharacterDefinitions(content)) {
    const start = lineAt(character.start);
    const endLine = lineAt(character.end);
    declarations.set(start, {
      key: character.tag,
      kind: "character",
      signature: characterDeclarationSignature(character),
      location: location(path, start, endLine),
      endLine,
      value: null,
    });
  }
  for (const [index, key] of globalNames) {
    if (declarations.has(index)) continue;
    const item = parseRpyDefaultLine(lines[index].trim());
    if (!item || item.kind === "unknown") continue;
    declarations.set(index, {
      key,
      kind: item.kind,
      signature: defaultSignature(item),
      location: location(path, index),
      endLine: index,
      value: item,
    });
  }
  return { lines, globalNames, declarations };
}

/** Validate reserved files before any source or managed rows are imported. */
export function recoverGeneratedDeclarations(
  generatedFiles: Array<SourceFile & { kind: Declaration["kind"] }>,
  ordinaryFiles: Array<SourceFile & { cleanedContent: string }>,
  excludedTags: ReadonlySet<string>
): {
  defaults: DetectedDefaultStatement[];
  characters: DetectedCharacter[];
  sourceOwnedKeys: Set<string>;
} {
  const recovered = new Map<string, Declaration>();
  const characters = new Map<string, DetectedCharacter>();
  const sourceOwnedKeys = new Set<string>();
  const ordinaryKeys = new Set<string>();

  function checkEquivalent(
    first: Declaration,
    second: Declaration | undefined,
    at: string
  ) {
    if (first.kind === second?.kind && first.signature === second.signature)
      return;
    throw new GitLabGeneratedImportError(
      `Conflicting Ren’Py declarations at ${first.location} and ${at}. Resolve them in GitLab, then retry the import.`
    );
  }

  for (const file of generatedFiles) {
    const { lines, declarations } = indexDeclarations(file);
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (/^[ \t\r]*(?:#.*)?$/.test(line)) continue;
      const item = declarations.get(index);
      if (
        item?.kind !== file.kind ||
        /^[ \t]/.test(line) ||
        !isValidRenpyIdentifier(item.key)
      ) {
        throw new GitLabGeneratedImportError(
          `Unsupported content in reserved Ren’Py file ${location(file.path, index)}. Move ordinary code out of this file in GitLab, then retry the import.`
        );
      }
      const first = recovered.get(item.key);
      if (first) checkEquivalent(first, item, item.location);
      else recovered.set(item.key, item);
      index = item.endLine;
    }
    if (file.kind === "character") {
      for (const character of characterParserService.parseFile(
        file.content,
        file.path
      )) {
        if (!characters.has(character.tag))
          characters.set(character.tag, character);
      }
    }
  }

  if (recovered.size > 0) {
    for (const file of ordinaryFiles) {
      const { globalNames, declarations } = indexDeclarations(file);
      const sourceKeys = collectSourceOwnedRpyDeclarations(file.cleanedContent);
      for (const [line, key] of globalNames) {
        const first = recovered.get(key);
        if (!first) continue;
        const item = declarations.get(line);
        checkEquivalent(
          first,
          item,
          item?.location ?? location(file.path, line)
        );
        ordinaryKeys.add(key);
        if (sourceKeys.has(key)) sourceOwnedKeys.add(key);
      }
    }
  }

  const defaults: DetectedDefaultStatement[] = [];
  for (const [key, item] of recovered) {
    if (ordinaryKeys.has(key)) continue;
    if (item.kind === "character" && excludedTags.has(key)) {
      throw new GitLabGeneratedImportError(
        `Excluded Ren’Py character at ${item.location}. Move its declaration into an ordinary Ren’Py file in GitLab, then retry the import.`
      );
    }
    if (item.value) defaults.push(item.value);
  }

  return {
    defaults,
    characters: [...characters.values()].filter(
      ({ tag }) => !ordinaryKeys.has(tag)
    ),
    sourceOwnedKeys,
  };
}
