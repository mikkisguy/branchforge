import { and, asc, eq, isNull } from "drizzle-orm";
import type { CharacterSourceDefinition } from "@branchforge/shared";
import { getDb } from "../db/index.js";
import {
  characters,
  projectFiles,
  projectSettings,
} from "../db/schema/index.js";
import type { Transaction } from "../db/types.js";
import { calculateContentHash } from "../lib/hash.js";
import {
  parseCharacterDefinitions,
  renderCharacterSourceDefinition,
} from "./character-source-definition.js";
import {
  BRANCHFORGE_MANAGED_NOTICE,
  DEFAULT_EXCLUDED_RENPY_TAGS,
  collectSourceOwnedRpySymbolKeys,
  collectSourceOwnedRpyDeclarations,
  extractAndStripRpySymbols,
  extractLegacyRpySymbols,
  isSourceOwnedRpyFile,
} from "./rpy-statements.service.js";
import { lockProject } from "./project-files-operations.service.js";
import {
  generateCharacterDefinitionsFile,
  normalizeCharacterNameType,
} from "./rpy-generator.service.js";
import { canonicalizeColor } from "./character-parser/color.js";
import { ConflictError } from "../middleware/error-handler.middleware.js";

export function characterDefinitionSnapshot(content: string) {
  const definitions = new Map<string, CharacterSourceDefinition>();
  for (const definition of parseCharacterDefinitions(content)) {
    if (!definitions.has(definition.tag)) {
      definitions.set(definition.tag, definition.sourceDefinition);
    }
  }
  return Object.fromEntries(definitions);
}

/** Script edits replace visible definitions without reviving removed source. */
export function updateCharacterDefinitionSnapshot(
  before: string,
  after: string,
  existing: Record<string, CharacterSourceDefinition> | null
): Record<string, CharacterSourceDefinition> {
  const definitions = { ...existing };
  const next = characterDefinitionSnapshot(after);
  for (const definition of parseCharacterDefinitions(before)) {
    if (!Object.hasOwn(next, definition.tag))
      delete definitions[definition.tag];
  }
  return { ...definitions, ...next };
}

/** Resolve accepted templates without consulting rejected or stale snapshots. */
export function acceptedCharacterDefinitionContent(
  file: Parameters<typeof recoverLegacyCharacterSource>[0] & {
    characterDefinitions?: Record<string, CharacterSourceDefinition> | null;
  },
  excludedTags: ReadonlySet<string>
): string {
  if (isSourceOwnedRpyFile(file.filePath)) return "";
  const visible = collectSourceOwnedRpyDeclarations(file.content);
  const snapshot =
    file.characterDefinitions ??
    recoverLegacyCharacterSource(file, excludedTags)?.definitions ??
    {};
  const declarations = new Map<string, string>();
  for (const [tag, metadata] of Object.entries(snapshot)) {
    if (visible.has(tag)) continue;
    const parsed = parseCharacterDefinitions(metadata.declaration);
    if (parsed.length === 1 && parsed[0].tag === tag) {
      declarations.set(tag, parsed[0].sourceDefinition.declaration);
    }
  }
  for (const [tag, metadata] of Object.entries(
    characterDefinitionSnapshot(file.content)
  )) {
    declarations.set(tag, metadata.declaration);
  }
  return [...declarations.values()].join("\n");
}

/** Evidence for recovery, rather than treating old snapshots as current source. */
export function recoverLegacyCharacterSource(
  file: {
    filePath: string;
    content: string;
    contentHash: string;
    originalContent: string | null;
    remoteContent?: string | null;
    hasRemoteConflict?: boolean;
    lastPushedContentHash?: string | null;
  },
  excludedTags: ReadonlySet<string>
): {
  content: string;
  definitions: ReturnType<typeof characterDefinitionSnapshot>;
} | null {
  if (
    file.hasRemoteConflict ||
    (file.lastPushedContentHash &&
      file.lastPushedContentHash !== file.contentHash)
  )
    return null;
  // GitLab's accepted raw snapshot takes precedence, even when it contains
  // no declarations. Historical originals must not undo accepted removals.
  const candidates =
    file.remoteContent != null
      ? [file.remoteContent]
      : file.originalContent != null
        ? [file.originalContent]
        : [];
  for (const raw of candidates) {
    const extracted = extractLegacyRpySymbols(raw);
    const legacy = extracted.cleanedContent;
    const oldNotice =
      extracted.characters.length ||
      extracted.variables.length ||
      extracted.stats.length
        ? legacy.replace(/^[^\n]*\n/, `${BRANCHFORGE_MANAGED_NOTICE}\n`)
        : legacy;
    const modern = extractAndStripRpySymbols(
      raw,
      file.filePath,
      excludedTags
    ).cleanedContent;
    if (![legacy, oldNotice, modern, raw].includes(file.content)) continue;
    return {
      content: modern,
      definitions: isSourceOwnedRpyFile(file.filePath)
        ? {}
        : characterDefinitionSnapshot(raw),
    };
  }
  return null;
}

/** One-time server maintenance, serialized with source writes by the project lock. */
export async function ensureCharacterSourcePreservation(
  projectId: string
): Promise<void> {
  const db = getDb();
  const [state] = await db
    .select({ version: projectSettings.characterSourcePreservationVersion })
    .from(projectSettings)
    .where(eq(projectSettings.projectId, projectId))
    .limit(1);
  if (state?.version === 1) return;
  await db.transaction(async (tx) => {
    await lockProject(tx, projectId);
    const [settings] = await tx
      .select()
      .from(projectSettings)
      .where(eq(projectSettings.projectId, projectId))
      .limit(1);
    if (settings?.characterSourcePreservationVersion === 1) return;
    const excludedTags = new Set(
      settings?.excludedCharacterTags ?? DEFAULT_EXCLUDED_RENPY_TAGS
    );
    const files = await tx
      .select()
      .from(projectFiles)
      .where(
        and(
          eq(projectFiles.projectId, projectId),
          isNull(projectFiles.deletedAt)
        )
      );
    const templates = new Map<string, CharacterSourceDefinition[]>();
    const legacyBaselines = new Map<
      string,
      { name: string | null; color: string }
    >();
    for (const file of files) {
      const recovery =
        file.characterDefinitions === null
          ? recoverLegacyCharacterSource(file, excludedTags)
          : null;
      const definitions = file.characterDefinitions ?? recovery?.definitions;
      if (recovery) {
        const contentHash = calculateContentHash(recovery.content);
        await tx
          .update(projectFiles)
          .set({
            content: recovery.content,
            contentHash,
            characterDefinitions: recovery.definitions,
            lastPushedContentHash:
              file.lastPushedContentHash === file.contentHash
                ? contentHash
                : file.lastPushedContentHash,
          })
          .where(eq(projectFiles.id, file.id));
      }
      if (isSourceOwnedRpyFile(file.filePath)) continue;
      if (recovery) {
        const raw = file.remoteContent ?? file.originalContent;
        if (raw) {
          for (const baseline of extractLegacyRpySymbols(raw).characters) {
            legacyBaselines.set(baseline.tag, baseline);
          }
        }
      }
      for (const [tag, template] of Object.entries(definitions ?? {})) {
        const entries = templates.get(tag) ?? [];
        entries.push(template);
        templates.set(tag, entries);
      }
    }
    // Duplicate source tags make historical attribution ambiguous; do not guess.
    const rows = await tx
      .select()
      .from(characters)
      .where(eq(characters.projectId, projectId));
    for (const row of rows) {
      const entries = templates.get(row.renpyTag);
      if (row.sourceDefinition === null && entries?.length === 1) {
        const baseline = legacyBaselines.get(row.renpyTag);
        const template = entries[0];
        await tx
          .update(characters)
          .set({
            sourceDefinition: template,
            // Legacy ZIP parsing confused what_color with speaker color and
            // retained escaped name syntax. Normalize only unchanged values;
            // explicitly edited names/colors remain authoritative.
            ...(baseline && row.name === (baseline.name ?? row.renpyTag)
              ? {
                  name: template.name ?? row.renpyTag,
                  ...(row.nameType === "literal"
                    ? { nameType: template.nameType }
                    : {}),
                }
              : {}),
            ...(baseline &&
            canonicalizeColor(row.color) === canonicalizeColor(baseline.color)
              ? { color: template.color }
              : {}),
          })
          .where(eq(characters.id, row.id));
      }
    }
    await tx
      .insert(projectSettings)
      .values({
        projectId,
        excludedCharacterTags: [...excludedTags],
        characterSourcePreservationVersion: 1,
      })
      .onConflictDoUpdate({
        target: projectSettings.projectId,
        set: { characterSourcePreservationVersion: 1 },
      });
  });
}

/** Move declarations between source and managed ownership in the settings transaction. */
export async function reconcileCharacterOwnership(
  tx: Transaction,
  projectId: string,
  excludedTags: ReadonlySet<string>,
  previousExcludedTags: ReadonlySet<string>
): Promise<void> {
  await lockProject(tx, projectId);
  const [files, rows] = await Promise.all([
    tx
      .select()
      .from(projectFiles)
      .where(
        and(
          eq(projectFiles.projectId, projectId),
          isNull(projectFiles.deletedAt)
        )
      )
      .orderBy(asc(projectFiles.filePath)),
    tx
      .select()
      .from(characters)
      .where(eq(characters.projectId, projectId))
      .orderBy(asc(characters.renpyTag)),
  ]);
  const initialContents = new Map(files.map((file) => [file.id, file.content]));
  const owned = collectSourceOwnedRpySymbolKeys(files, excludedTags);
  const affected = (tag: string) =>
    previousExcludedTags.has(tag) !== excludedTags.has(tag);
  for (const row of rows) {
    if (
      !affected(row.renpyTag) ||
      !excludedTags.has(row.renpyTag) ||
      owned.has(row.renpyTag)
    )
      continue;
    const owners = files.filter(
      (file) =>
        !isSourceOwnedRpyFile(file.filePath) &&
        Object.hasOwn(file.characterDefinitions ?? {}, row.renpyTag)
    );
    const target =
      owners.length === 1
        ? owners[0]
        : files.find(
            (file) =>
              !isSourceOwnedRpyFile(file.filePath) &&
              !/\/branchforge_[^/]*\.rpy$/i.test(`/${file.filePath}`)
          );
    if (!target) {
      throw new ConflictError(
        "A character cannot be excluded until its source can be preserved."
      );
    }
    const character = {
      ...row,
      nameType: normalizeCharacterNameType(row.nameType),
    };
    const fallback = parseCharacterDefinitions(
      generateCharacterDefinitionsFile([character])
    )[0]?.sourceDefinition.declaration;
    const declaration = row.sourceDefinition
      ? (renderCharacterSourceDefinition(row.sourceDefinition, character) ??
        fallback)
      : fallback;
    if (!declaration) continue;
    target.content = `${declaration}\n${target.content}`;
    owned.add(row.renpyTag);
  }
  for (const file of files) {
    if (isSourceOwnedRpyFile(file.filePath)) continue;
    const extracted = extractAndStripRpySymbols(
      file.content,
      file.filePath,
      excludedTags
    );
    let content = file.content;
    for (const definition of parseCharacterDefinitions(
      file.content
    ).reverse()) {
      if (excludedTags.has(definition.tag) || !affected(definition.tag))
        continue;
      const end =
        content[definition.end] === "\n" ? definition.end + 1 : definition.end;
      content = content.slice(0, definition.start) + content.slice(end);
    }
    const definitions = {
      ...file.characterDefinitions,
      ...characterDefinitionSnapshot(file.content),
    };
    for (const definition of extracted.characters) {
      if (!affected(definition.tag)) continue;
      if (!definition.sourceDefinition) continue;
      const existing = rows.find((row) => row.renpyTag === definition.tag);
      if (existing) {
        await tx
          .update(characters)
          .set({ sourceDefinition: definition.sourceDefinition })
          .where(eq(characters.id, existing.id));
      } else {
        await tx
          .insert(characters)
          .values({
            projectId,
            renpyTag: definition.tag,
            name: definition.name ?? definition.tag,
            displayName: definition.displayName || definition.tag,
            nameType: definition.nameType,
            color: definition.color,
            sourceDefinition: definition.sourceDefinition,
          })
          .onConflictDoNothing();
      }
    }
    if (
      content === initialContents.get(file.id) &&
      file.characterDefinitions !== null &&
      JSON.stringify(definitions) === JSON.stringify(file.characterDefinitions)
    )
      continue;
    await tx
      .update(projectFiles)
      .set({
        content,
        contentHash: calculateContentHash(content),
        characterDefinitions: definitions,
      })
      .where(eq(projectFiles.id, file.id));
  }
}

/** Script Mode is an explicit source edit, unlike a pending import review. */
export async function syncAuthoredCharacterDefinitions(
  tx: Transaction,
  projectId: string,
  filePath: string,
  content: string,
  previousContent: string
): Promise<void> {
  if (isSourceOwnedRpyFile(filePath)) return;
  const previous = characterDefinitionSnapshot(previousContent);
  const definitions = characterDefinitionSnapshot(content);
  for (const [tag, definition] of Object.entries(definitions)) {
    if (
      Object.hasOwn(previous, tag) &&
      previous[tag].declaration === definition.declaration
    )
      delete definitions[tag];
  }
  if (Object.keys(definitions).length === 0) return;
  const [settings] = await tx
    .select({ excluded: projectSettings.excludedCharacterTags })
    .from(projectSettings)
    .where(eq(projectSettings.projectId, projectId))
    .limit(1);
  const excluded = new Set(settings?.excluded ?? DEFAULT_EXCLUDED_RENPY_TAGS);
  for (const [tag, definition] of Object.entries(definitions)) {
    if (excluded.has(tag)) continue;
    const parsed = parseCharacterDefinitions(definition.declaration)[0];
    await tx
      .insert(characters)
      .values({
        projectId,
        renpyTag: tag,
        name: parsed.name ?? tag,
        displayName: parsed.displayName || tag,
        nameType: parsed.nameType,
        color: parsed.color,
        sourceDefinition: definition,
      })
      .onConflictDoUpdate({
        target: [characters.projectId, characters.renpyTag],
        set: {
          name: parsed.name ?? tag,
          nameType: parsed.nameType,
          color: parsed.color,
          sourceDefinition: definition,
          updatedAt: new Date(),
        },
      });
  }
}
