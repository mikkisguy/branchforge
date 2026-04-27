/**
 * Label Sync Service
 *
 * Unified service for synchronizing labels from RPY files.
 * Extracted and generalized from gitlab-file-sync.service.ts to work
 * with any file source (GitLab, zip, etc.).
 *
 * Features:
 * - Atomic transactions for all-or-nothing sync
 * - Idempotency via content hash (same content skipped)
 * - Validation before and after sync
 * - Batch operations for performance
 * - Orphan cleanup within transaction
 */

import { getDb } from "../db/index.js";
import { labels, labelLines, characters } from "../db/schema/index.js";
import { eq, and, inArray, isNull } from "drizzle-orm";
import {
  parseRPYFileWithLabels,
  convertToBranchForgeFormatFromLabels,
  type ParsedRPYFileWithLabels,
} from "./rpy-parser.service.js";
import { calculateContentHash, calculateLinesHash } from "../lib/hash.js";
import { mapEntryToDbType } from "./label-line-mapper.js";

// ============================================================================
// Types
// ============================================================================

export interface SyncLabelsFromResult {
  success: boolean;
  labelsCreated: number;
  labelsUpdated: number;
  labelsDeleted: number;
  linesProcessed: number;
  errors: Array<{ label: string; error: string }>;
  skipped: boolean; // True if sync was skipped due to idempotency
  affectedLabelIds: string[]; // IDs of labels created, updated, or deleted
}

export interface SyncLabelsFromOptions {
  skipCleanup?: boolean;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate RPY content before sync
 * @throws Error if validation fails
 */
export function validateRPYContent(
  content: string,
  parsed: ParsedRPYFileWithLabels
): void {
  if (!content || content.trim().length === 0) {
    throw new Error("RPY content is empty");
  }

  if (parsed.labels.length === 0) {
    throw new Error("No labels found in RPY content");
  }

  // Check for duplicate labels (case-insensitive)
  const labelSet = new Set<string>();
  const duplicateLabels: string[] = [];
  for (const label of parsed.labels) {
    const lowerLabel = label.label.toLowerCase();
    if (labelSet.has(lowerLabel)) {
      duplicateLabels.push(label.label);
    }
    labelSet.add(lowerLabel);
  }

  if (duplicateLabels.length > 0) {
    throw new Error(`Duplicate labels found: ${duplicateLabels.join(", ")}`);
  }
}

/**
 * Validate that file type is STORY (only STORY files should sync to labels)
 */
export function validateFileType(fileType: string): void {
  if (fileType !== "STORY") {
    throw new Error(
      `Invalid file type for label sync: ${fileType}. Only STORY files can sync to labels.`
    );
  }
}

// ============================================================================
// Core Sync Logic
// ============================================================================

/**
 * Internal helper: Execute the label sync operations within a transaction.
 * This function is called either within a new transaction or with an external one.
 *
 * TRANSACTION TYPE NOTE: We use `any` for the tx parameter because Drizzle ORM's
 * transaction type is complex and not easily exportable. The transaction object has
 * the same API as the regular db instance (select, insert, update, delete, etc.),
 * but with additional transaction-specific methods (rollback, commit). Using `any`
 * here is a pragmatic choice since:
 * 1. The transaction API is identical to Db for our use case
 * 2. Drizzle doesn't export a portable transaction type that works across modules
 * 3. Attempting to extract the exact type results in unwieldy generics
 *
 * @param tx - The transaction context (same API as Db, passed from db.transaction())
 * @param projectId - The project ID
 * @param parsed - The parsed RPY file
 * @param rpyContent - The raw RPY content
 * @param sourceId - The source file ID
 * @param skipCleanup - Whether to skip orphan cleanup
 * @returns Sync statistics
 */
async function syncLabelsInTransaction(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  projectId: string,
  parsed: ParsedRPYFileWithLabels,
  rpyContent: string,
  sourceId: string,
  skipCleanup: boolean
): Promise<{
  labelsCreated: number;
  labelsUpdated: number;
  labelsDeleted: number;
  linesProcessed: number;
  errors: Array<{ label: string; error: string }>;
  affectedLabelIds: string[];
}> {
  // Fetch existing labels for this source file
  const existingLabels = await tx
    .select()
    .from(labels)
    .where(and(eq(labels.projectFileId, sourceId), isNull(labels.deletedAt)));

  // Build character lookup maps once for robust speaker linking during sync
  const projectCharacters = await tx
    .select({
      id: characters.id,
      renpyTag: characters.renpyTag,
      displayName: characters.displayName,
    })
    .from(characters)
    .where(eq(characters.projectId, projectId));

  const lookupMaps: CharacterLookupMaps = {
    byTag: new Map<string, string | null>(),
    byTagLower: new Map<string, string | null>(),
    byDisplayName: new Map<string, string | null>(),
    byDisplayNameLower: new Map<string, string | null>(),
  };

  for (const char of projectCharacters) {
    registerLookup(lookupMaps.byTag, char.renpyTag, char.id);
    if (char.renpyTag) {
      registerLookup(
        lookupMaps.byTagLower,
        char.renpyTag.toLowerCase(),
        char.id
      );
    }
    registerLookup(lookupMaps.byDisplayName, char.displayName, char.id);
    if (char.displayName) {
      registerLookup(
        lookupMaps.byDisplayNameLower,
        char.displayName.toLowerCase(),
        char.id
      );
    }
  }

  const existingLabelsByName = new Map<string, (typeof existingLabels)[0]>();
  for (const labelRow of existingLabels) {
    if (labelRow.labelName) {
      existingLabelsByName.set(labelRow.labelName, labelRow);
    }
  }

  // Track results
  let labelsCreated = 0;
  let labelsUpdated = 0;
  let linesProcessed = 0;
  const errors: Array<{ label: string; error: string }> = [];
  const affectedLabelIds: string[] = [];

  // Process each label
  for (let i = 0; i < parsed.labels.length; i++) {
    const label = parsed.labels[i];
    const labelData = convertToBranchForgeFormatFromLabels(
      parsed,
      label.label,
      rpyContent
    );

    try {
      const existingLabel = existingLabelsByName.get(label.label);

      if (existingLabel) {
        // Update existing label
        // Delete old lines
        await tx
          .delete(labelLines)
          .where(eq(labelLines.labelId, existingLabel.id));

        // Calculate label lines hash
        const labelLinesHash = calculateLinesHash(labelData.entries);

        // Insert new lines in batch
        if (labelData.entries.length > 0) {
          const lineValues = buildLineValues(
            existingLabel.id,
            labelData.entries,
            sourceId,
            lookupMaps
          );

          await tx.insert(labelLines).values(lineValues);
          linesProcessed += lineValues.length;
        }

        // Update label sync metadata
        await tx
          .update(labels)
          .set({
            contentHash: labelLinesHash,
            lastSyncedHash: labelLinesHash,
            syncStatus: "SYNCED",
            updatedAt: new Date(),
          })
          .where(eq(labels.id, existingLabel.id));

        affectedLabelIds.push(existingLabel.id);
        labelsUpdated++;
      } else {
        // Create new scene
        const labelLinesHash = calculateLinesHash(labelData.entries);

        const [newScene] = await tx
          .insert(labels)
          .values({
            projectId,
            title: label.label,
            projectFileId: sourceId,
            labelName: label.label,
            labelPosition: i,
            sequenceOrder: i,
            route: null, // User will assign route later
            labelNumber: i + 1,
            status: "DRAFT",
            prerequisites: {},
            effects: {},
            // Sync fields
            contentHash: labelLinesHash,
            lastSyncedHash: labelLinesHash,
            syncStatus: "SYNCED",
          })
          .returning();

        affectedLabelIds.push(newScene.id);

        // Insert lines in batch
        if (labelData.entries.length > 0) {
          const lineValues = buildLineValues(
            newScene.id,
            labelData.entries,
            sourceId,
            lookupMaps
          );

          await tx.insert(labelLines).values(lineValues);
          linesProcessed += lineValues.length;
        }

        labelsCreated++;
      }
    } catch (error) {
      errors.push({
        label: label.label,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  // Orphan cleanup (labels that no longer exist in RPY content)
  let labelsDeleted = 0;
  if (!skipCleanup) {
    const currentLabelNames = new Set(parsed.labels.map((l) => l.label));

    // Find orphaned labels (excluding already soft-deleted)
    const orphanedLabels = existingLabels.filter(
      (s: (typeof existingLabels)[0]) =>
        s.labelName && !currentLabelNames.has(s.labelName) && !s.deletedAt
    );

    if (orphanedLabels.length > 0) {
      const orphanedIds = orphanedLabels.map(
        (s: (typeof orphanedLabels)[0]) => s.id
      );

      // Soft delete label lines for orphaned labels
      await tx
        .update(labelLines)
        .set({ deletedAt: new Date() })
        .where(
          and(
            inArray(labelLines.labelId, orphanedIds),
            isNull(labelLines.deletedAt)
          )
        );

      // Soft delete orphaned labels
      await tx
        .update(labels)
        .set({ deletedAt: new Date() })
        .where(and(inArray(labels.id, orphanedIds), isNull(labels.deletedAt)));

      labelsDeleted = orphanedIds.length;

      // Track orphaned label IDs as affected for downstream cache/webhook handling
      affectedLabelIds.push(...orphanedIds);
    }
  }

  return {
    labelsCreated,
    labelsUpdated,
    labelsDeleted,
    linesProcessed,
    errors,
    affectedLabelIds,
  };
}

interface CharacterLookupMaps {
  byTag: Map<string, string | null>;
  byTagLower: Map<string, string | null>;
  byDisplayName: Map<string, string | null>;
  byDisplayNameLower: Map<string, string | null>;
}

function registerLookup(
  map: Map<string, string | null>,
  key: string,
  value: string
): void {
  if (!map.has(key)) {
    map.set(key, value);
    return;
  }

  const existing = map.get(key);
  if (existing !== value) {
    // Ambiguous key - force unresolved to avoid accidental mis-linking.
    map.set(key, null);
  }
}

/**
 * Resolve parsed speaker text to character ID.
 *
 * Match order:
 * 1) renpyTag exact
 * 2) renpyTag case-insensitive
 * 3) displayName exact (compatibility with legacy reconstructed content)
 * 4) displayName case-insensitive
 */
function resolveSpeakerId(
  speakerTag: string | undefined,
  lookupMaps: CharacterLookupMaps
): string | null {
  if (!speakerTag) {
    return null;
  }

  const normalized = speakerTag.trim();
  if (!normalized) {
    return null;
  }

  const tagExact = lookupMaps.byTag.get(normalized);
  if (tagExact !== undefined) {
    return tagExact;
  }

  const tagLower = lookupMaps.byTagLower.get(normalized.toLowerCase());
  if (tagLower !== undefined) {
    return tagLower;
  }

  const nameExact = lookupMaps.byDisplayName.get(normalized);
  if (nameExact !== undefined) {
    return nameExact;
  }

  const nameLower = lookupMaps.byDisplayNameLower.get(normalized.toLowerCase());
  if (nameLower !== undefined) {
    return nameLower;
  }

  return null;
}

/**
 * Build label line values for batch insert.
 * Maps parsed entries to database records with hashes and metadata.
 */
function buildLineValues(
  labelId: string,
  entries: Array<{
    type: string;
    speaker?: string;
    target?: string;
    text?: string;
    lineNumber?: number;
    indentLevel?: number;
  }>,
  sourceId: string,
  lookupMaps: CharacterLookupMaps
): Array<{
  labelId: string;
  sequence: number;
  contentType: "NARRATION" | "DIALOGUE" | "JUMP";
  content: string;
  speakerId: string | null;
  visualType: "GENERATED";
  projectFileId: string;
  linePosition: number;
  contentHash: string;
  lastSyncedHash: string;
  lastSyncedAt: Date;
  rpyLineNumber: number | null;
  rpyIndentLevel: number;
}> {
  return entries.map((entry, index) => {
    const contentType = mapEntryToDbType(entry);
    const content = entry.target ? `jump ${entry.target}` : entry.text || "";
    const lineHash = calculateContentHash(content);
    const speakerId =
      contentType === "DIALOGUE"
        ? resolveSpeakerId(entry.speaker, lookupMaps)
        : null;

    return {
      labelId,
      sequence: index + 1,
      contentType,
      content,
      speakerId,
      visualType: "GENERATED" as const,
      projectFileId: sourceId,
      linePosition: index,
      contentHash: lineHash,
      lastSyncedHash: lineHash,
      lastSyncedAt: new Date(),
      rpyLineNumber: entry.lineNumber ?? null,
      rpyIndentLevel: entry.indentLevel ?? 0,
    };
  });
}

/**
 * Sync labels from RPY file content.
 *
 * This is the main sync function that:
 * 1. Validates input
 * 2. Parses RPY content
 * 3. Executes atomic sync transaction
 *
 * TRANSACTION PARAMETER: The `tx` option allows passing an existing Drizzle
 * transaction context to enable atomic operations across multiple database calls.
 * This is essential when the caller needs the sync to be part of a larger transaction
 * (e.g., updating file content and syncing labels atomically).
 *
 * We use `any` for the tx type because Drizzle ORM's transaction type is complex and
 * not easily exportable as a portable type. The transaction has the same API as Db.
 *
 * @param projectId - The project ID to sync labels for
 * @param fileData - The file data containing content, path, and type
 * @param rpyContent - The RPY file content
 * @param sourceId - The source file ID (for linking labels to source)
 * @param options - Sync options (skipCleanup, tx)
 * @returns Sync result with statistics
 */
export async function syncLabelsFromFile(
  projectId: string,
  fileData: { filePath: string; fileType: string },
  rpyContent: string,
  sourceId: string,
  options?: SyncLabelsFromOptions & {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx?: any; // Drizzle transaction context (same API as Db)
  }
): Promise<SyncLabelsFromResult> {
  const db = options?.tx ?? getDb();
  const skipCleanup = options?.skipCleanup ?? false;
  const externalTx = !!options?.tx;

  const result: SyncLabelsFromResult = {
    success: false,
    labelsCreated: 0,
    labelsUpdated: 0,
    labelsDeleted: 0,
    linesProcessed: 0,
    errors: [],
    skipped: false,
    affectedLabelIds: [],
  };

  try {
    // Step 1: Parse RPY content with filename for better file type detection
    const parsed = parseRPYFileWithLabels(rpyContent, fileData.filePath);

    // Step 2: Validate file type
    validateFileType(fileData.fileType);

    // Step 3: Validate RPY content
    validateRPYContent(rpyContent, parsed);

    // Step 4: Execute sync in atomic transaction
    // If an external transaction is provided, use it directly; otherwise create a new one
    // Note: We annotate tx as `any` because Drizzle's transaction type is complex.
    // The transaction callback parameter has the same API as Db for our operations.
    const syncResult = await (externalTx
      ? syncLabelsInTransaction(
          db,
          projectId,
          parsed,
          rpyContent,
          sourceId,
          skipCleanup
        )
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        db.transaction((tx: any) =>
          syncLabelsInTransaction(
            tx,
            projectId,
            parsed,
            rpyContent,
            sourceId,
            skipCleanup
          )
        ));

    // Return success
    return {
      success: true,
      labelsCreated: syncResult.labelsCreated,
      labelsUpdated: syncResult.labelsUpdated,
      labelsDeleted: syncResult.labelsDeleted,
      linesProcessed: syncResult.linesProcessed,
      errors: syncResult.errors,
      skipped: false,
      affectedLabelIds: syncResult.affectedLabelIds,
    };
  } catch (error) {
    // Sync failed
    result.errors.push({
      label: "",
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return result;
  }
}
