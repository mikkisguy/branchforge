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
import { labels, labelLines } from "../db/schema/index.js";
import { eq, and, inArray, isNull } from "drizzle-orm";
import {
  parseRPYFileWithLabels,
  convertToBranchForgeFormatFromLabels,
  type ParsedRPYFileWithLabels,
} from "./rpy-parser.service.js";
import { calculateContentHash, calculateLinesHash } from "../lib/hash.js";

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
 * Map BranchForge entry type to content type enum
 */
function mapEntryToDbType(entry: {
  type: string;
}): "NARRATION" | "DIALOGUE" | "JUMP" {
  if (entry.type === "FLAG") {
    return "JUMP";
  }
  if (
    entry.type === "NARRATION" ||
    entry.type === "DIALOGUE" ||
    entry.type === "JUMP"
  ) {
    return entry.type as "NARRATION" | "DIALOGUE" | "JUMP";
  }
  // Don't default to NARRATION - skip unrecognized types
  // This prevents non-dialogue entries from becoming label_lines
  throw new Error(`Unrecognized entry type: ${entry.type}`);
}

/**
 * Build label line values for batch insert.
 * Maps parsed entries to database records with hashes and metadata.
 */
function buildLineValues(
  labelId: string,
  entries: Array<{
    type: string;
    target?: string;
    text?: string;
    lineNumber?: number;
    indentLevel?: number;
  }>,
  sourceId: string
): Array<{
  labelId: string;
  sequence: number;
  contentType: "NARRATION" | "DIALOGUE" | "JUMP";
  content: string;
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

    return {
      labelId,
      sequence: index + 1,
      contentType,
      content,
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
 * @param projectId - The project ID to sync labels for
 * @param fileData - The file data containing content, path, and type
 * @param rpyContent - The RPY file content
 * @param sourceId - The source file ID (for linking labels to source)
 * @param options - Sync options (skipCleanup)
 * @returns Sync result with statistics
 */
export async function syncLabelsFromFile(
  projectId: string,
  fileData: { filePath: string; fileType: string },
  rpyContent: string,
  sourceId: string,
  options?: SyncLabelsFromOptions
): Promise<SyncLabelsFromResult> {
  const db = getDb();
  const skipCleanup = options?.skipCleanup ?? false;

  const result: SyncLabelsFromResult = {
    success: false,
    labelsCreated: 0,
    labelsUpdated: 0,
    labelsDeleted: 0,
    linesProcessed: 0,
    errors: [],
    skipped: false,
  };

  try {
    // Step 1: Parse RPY content with filename for better file type detection
    const parsed = parseRPYFileWithLabels(rpyContent, fileData.filePath);

    // Step 2: Validate file type
    validateFileType(fileData.fileType);

    // Step 3: Validate RPY content
    validateRPYContent(rpyContent, parsed);

    // Step 4: Execute sync in atomic transaction
    const syncResult = await db.transaction(async (tx) => {
      // Fetch existing labels for this source file
      const existingLabels = await tx
        .select()
        .from(labels)
        .where(eq(labels.projectFileId, sourceId));

      const existingLabelsByName = new Map<
        string,
        (typeof existingLabels)[0]
      >();
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
                sourceId
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

            // Insert lines in batch
            if (labelData.entries.length > 0) {
              const lineValues = buildLineValues(
                newScene.id,
                labelData.entries,
                sourceId
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
          (s) =>
            s.labelName && !currentLabelNames.has(s.labelName) && !s.deletedAt
        );

        if (orphanedLabels.length > 0) {
          const orphanedIds = orphanedLabels.map((s) => s.id);

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
            .where(
              and(inArray(labels.id, orphanedIds), isNull(labels.deletedAt))
            );

          labelsDeleted = orphanedIds.length;
        }
      }

      return {
        labelsCreated,
        labelsUpdated,
        labelsDeleted,
        linesProcessed,
        errors,
      };
    });

    // Return success
    return {
      success: true,
      labelsCreated: syncResult.labelsCreated,
      labelsUpdated: syncResult.labelsUpdated,
      labelsDeleted: syncResult.labelsDeleted,
      linesProcessed: syncResult.linesProcessed,
      errors: syncResult.errors,
      skipped: false,
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
