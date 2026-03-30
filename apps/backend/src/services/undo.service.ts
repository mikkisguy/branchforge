/**
 * Undo Service
 *
 * Manages dialogue version snapshots for undo/redo functionality.
 * Replaces soft-delete bloat with dedicated version storage.
 */

import { getDb } from "../db/index.js";
import { labelDialogueVersions } from "../db/schema/index.js";
import { eq, and, desc, sql } from "drizzle-orm";
import { calculateDialogueHash } from "../lib/hash.js";
import { z } from "zod";

// Runtime validation schema for dialogue data
const dialogueDataSchema = z.array(
  z.object({
    speakerId: z.string().nullable(),
    text: z.string(),
  })
);

// Return type for getLabelVersions - subset of LabelDialogueVersion fields
export type LabelVersionMetadata = {
  id: string;
  versionNumber: number;
  createdAt: Date;
  contentHash: string;
};

const MAX_VERSIONS_PER_LABEL = 10;

/**
 * Create a snapshot of dialogue content if it has changed.
 * Skips snapshot if content hash matches the latest version.
 *
 * @param labelId - The label ID to snapshot
 * @param dialogue - The dialogue data to snapshot
 * @param userId - The user creating the snapshot
 * @returns true if snapshot was created, false if skipped (duplicate content)
 */
export async function createDialogueSnapshot(
  labelId: string,
  dialogue: Array<{ speakerId: string | null; text: string }>,
  userId: string
): Promise<boolean> {
  const db = getDb();
  const contentHash = calculateDialogueHash(dialogue);

  return await db.transaction(async (tx) => {
    // Get max version number
    const [maxVersionResult] = await tx
      .select({
        maxVersionNumber: sql<number | null>`MAX(${labelDialogueVersions.versionNumber})`,
      })
      .from(labelDialogueVersions)
      .where(eq(labelDialogueVersions.labelId, labelId));

    // Get latest version's content hash separately
    const [latestVersion] = await tx
      .select({
        contentHash: labelDialogueVersions.contentHash,
      })
      .from(labelDialogueVersions)
      .where(eq(labelDialogueVersions.labelId, labelId))
      .orderBy(desc(labelDialogueVersions.versionNumber))
      .limit(1);

    // Skip snapshot if content hasn't changed
    if (latestVersion && latestVersion.contentHash === contentHash) {
      return false;
    }

    const maxVersionNumber = maxVersionResult?.maxVersionNumber ?? 0;
    const newVersionNumber = maxVersionNumber + 1;

    await tx.insert(labelDialogueVersions).values({
      labelId,
      dialogueData: dialogue,
      contentHash,
      versionNumber: newVersionNumber,
      createdBy: userId,
    });

    // Delete old versions over limit
    if (newVersionNumber > MAX_VERSIONS_PER_LABEL) {
      const versionsToDelete = newVersionNumber - MAX_VERSIONS_PER_LABEL;
      await tx
        .delete(labelDialogueVersions)
        .where(
          and(
            eq(labelDialogueVersions.labelId, labelId),
            sql`${labelDialogueVersions.versionNumber} <= ${versionsToDelete}`
          )
        );
    }

    return true;
  });
}

/**
 * Get all versions for a label, ordered newest first.
 *
 * @param labelId - The label ID
 * @returns Array of version metadata
 */
export async function getLabelVersions(
  labelId: string
): Promise<LabelVersionMetadata[]> {
  const db = getDb();
  return await db
    .select({
      id: labelDialogueVersions.id,
      versionNumber: labelDialogueVersions.versionNumber,
      createdAt: labelDialogueVersions.createdAt,
      contentHash: labelDialogueVersions.contentHash,
    })
    .from(labelDialogueVersions)
    .where(eq(labelDialogueVersions.labelId, labelId))
    .orderBy(
      desc(labelDialogueVersions.createdAt),
      desc(labelDialogueVersions.versionNumber)
    );
}

/**
 * Restore dialogue data from a specific version.
 *
 * @param versionId - The version ID to restore
 * @returns The dialogue data
 * @throws Error if version not found
 */
export async function restoreLabelVersion(
  versionId: string
): Promise<Array<{ speakerId: string | null; text: string }>> {
  const db = getDb();
  const [version] = await db
    .select({ dialogueData: labelDialogueVersions.dialogueData })
    .from(labelDialogueVersions)
    .where(eq(labelDialogueVersions.id, versionId))
    .limit(1);

  if (!version) {
    throw new Error(`Version not found: ${versionId}`);
  }

  // Runtime validation to ensure data structure matches expected shape
  const parsed = dialogueDataSchema.safeParse(version.dialogueData);
  if (!parsed.success) {
    throw new Error(
      `Invalid dialogue data structure in version ${versionId}: ${parsed.error.message}`
    );
  }

  return parsed.data;
}
