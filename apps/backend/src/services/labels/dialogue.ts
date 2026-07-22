/**
 * Labels module - Dialogue Update
 *
 * Handles the business logic for updating a label's dialogue content.
 * This was extracted from the route handler to live in the service layer.
 *
 * The TOCTOU fix: ALL initial data fetching is done inside the transaction
 * so nothing is done outside the transaction.
 */

import { getDb } from "../../db/index.js";
import {
  labels,
  labelLines,
  projectFiles,
  characters,
} from "../../db/schema/index.js";
import { eq, asc, inArray, isNull, and, sql } from "drizzle-orm";
import { calculateLinesHash, calculateContentHash } from "../../lib/hash.js";
import { updateAuditFields } from "../../lib/audit.js";
import {
  NotFoundError,
  ValidationError,
} from "../../middleware/error-handler.middleware.js";
import type { UpdateLabelDialogueInput } from "../../lib/validation.js";
import { requireProjectOwnership } from "../authz.service.js";
import { planDialogueLineUpdates } from "../rpy/plan-dialogue-updates.js";
import { reconstructFileForLabel } from "./reconstruct.js";

// ============================================================================
// Types
// ============================================================================

type DialogueEntry = UpdateLabelDialogueInput["dialogue"][number];
type MenuBlock = NonNullable<UpdateLabelDialogueInput["menuBlocks"]>[number];

export type UpdateLabelDialogueResult =
  | {
      type: "success";
      version: number;
      contentHash: string;
      fileContentHash: string;
      fileUpdatedAt: string;
    }
  | {
      type: "conflict";
      success: false;
      version: number;
      contentHash: string;
      fileContentHash: string;
      fileUpdatedAt: string;
      conflict: {
        reason: "STALE_LABEL_VERSION" | "STALE_CONTENT_HASH";
        currentVersion: number;
        currentContentHash: string | null;
      };
    };

// ============================================================================
// Dialogue Update
// ============================================================================

/**
 * Update a label's dialogue content inside a single transaction.
 *
 * All initial data fetching (label, project file, ownership check, speaker
 * validation) is performed inside the transaction to prevent TOCTOU races.
 *
 * @returns A discriminated union indicating success or conflict.
 * @throws NotFoundError if the label or project file is not found.
 * @throws ForbiddenError if the user does not own the project.
 * @throws ValidationError if any speakerId references a non-existent character.
 */
export async function updateLabelDialogue(params: {
  labelId: string;
  dialogue: DialogueEntry[];
  menuBlocks?: MenuBlock[];
  expectedVersion?: number;
  expectedContentHash?: string | null;
  userId: string;
}): Promise<UpdateLabelDialogueResult> {
  const {
    labelId,
    dialogue,
    menuBlocks,
    expectedVersion,
    expectedContentHash,
    userId,
  } = params;

  return getDb().transaction(async (tx) => {
    // 1. Lock the label row to serialize concurrent updates
    await tx.execute(
      sql`SELECT id FROM labels WHERE id = ${labelId} FOR UPDATE`
    );

    // 2. Read the locked label
    const [lockedLabel] = await tx
      .select({
        id: labels.id,
        projectId: labels.projectId,
        projectFileId: labels.projectFileId,
        version: labels.version,
        contentHash: labels.contentHash,
        labelPosition: labels.labelPosition,
      })
      .from(labels)
      .where(and(eq(labels.id, labelId), isNull(labels.deletedAt)))
      .limit(1);

    if (!lockedLabel || !lockedLabel.projectFileId) {
      throw new NotFoundError("Label or file not found");
    }

    // 3. Lock the project file row
    await tx.execute(
      sql`SELECT id FROM project_files WHERE id = ${lockedLabel.projectFileId} FOR UPDATE`
    );

    // 4. Read the locked project file
    const [lockedProjectFile] = await tx
      .select()
      .from(projectFiles)
      .where(eq(projectFiles.id, lockedLabel.projectFileId))
      .limit(1);

    if (!lockedProjectFile) {
      throw new NotFoundError("File");
    }

    // 5. Verify user owns the project (uses tx to stay inside the transaction)
    await requireProjectOwnership(lockedLabel.projectId, userId, tx);

    // 6. Validate that all speakerIds exist in the characters table for this project
    const speakerIdsInDialogue = dialogue
      .map((entry) => entry.speakerId)
      .filter((id): id is string => id !== null);

    if (speakerIdsInDialogue.length > 0) {
      const uniqueSpeakerIds = Array.from(new Set(speakerIdsInDialogue));

      const existingCharacters = await tx
        .select({ id: characters.id })
        .from(characters)
        .where(
          and(
            eq(characters.projectId, lockedLabel.projectId),
            inArray(characters.id, uniqueSpeakerIds)
          )
        );

      const existingCharacterIds = new Set(existingCharacters.map((c) => c.id));
      const invalidSpeakerIds = uniqueSpeakerIds.filter(
        (id) => !existingCharacterIds.has(id)
      );

      if (invalidSpeakerIds.length > 0) {
        throw new ValidationError(
          `Invalid speakerId(s): ${invalidSpeakerIds.join(", ")}. Character(s) not found in this project.`
        );
      }
    }

    const lockedCurrentVersion = lockedLabel.version ?? 1;

    // 7. Conflict checks (expectedVersion / expectedContentHash)
    if (
      expectedVersion !== undefined &&
      expectedVersion !== lockedCurrentVersion
    ) {
      return {
        type: "conflict",
        success: false as const,
        version: lockedCurrentVersion,
        contentHash: lockedLabel.contentHash ?? "",
        fileContentHash: lockedProjectFile.contentHash,
        fileUpdatedAt: lockedProjectFile.updatedAt.toISOString(),
        conflict: {
          reason: "STALE_LABEL_VERSION",
          currentVersion: lockedCurrentVersion,
          currentContentHash: lockedLabel.contentHash,
        },
      };
    }

    if (
      expectedContentHash !== undefined &&
      (lockedLabel.contentHash ?? null) !== expectedContentHash
    ) {
      return {
        type: "conflict",
        success: false as const,
        version: lockedCurrentVersion,
        contentHash: lockedLabel.contentHash ?? "",
        fileContentHash: lockedProjectFile.contentHash,
        fileUpdatedAt: lockedProjectFile.updatedAt.toISOString(),
        conflict: {
          reason: "STALE_CONTENT_HASH",
          currentVersion: lockedCurrentVersion,
          currentContentHash: lockedLabel.contentHash,
        },
      };
    }

    // 8. Fetch existing lines (with FOR UPDATE to prevent concurrent modifications)
    const existingLines = await tx
      .select()
      .from(labelLines)
      .where(and(eq(labelLines.labelId, labelId), isNull(labelLines.deletedAt)))
      .orderBy(asc(labelLines.sequence));

    // 9. Align prose against the incoming list so mid-list inserts/deletes keep
    //    VISUAL/MENU rows interleaved correctly (not appended at max sequence).
    const plan = planDialogueLineUpdates(
      existingLines.map((line) => ({
        id: line.id,
        sequence: line.sequence,
        contentType: line.contentType,
        content: line.content,
        speakerId: line.speakerId,
      })),
      dialogue
    );

    // 10. Delete removed prose rows (structural MENU/JUMP/VISUAL are never deleted)
    if (plan.deleteIds.length > 0) {
      await tx.delete(labelLines).where(inArray(labelLines.id, plan.deleteIds));
    }

    // 11. Update matched prose rows in place
    await Promise.all(
      plan.updates.map((update) =>
        tx
          .update(labelLines)
          .set({
            contentType: (update.speakerId ? "DIALOGUE" : "NARRATION") as
              "DIALOGUE" | "NARRATION",
            content: update.text,
            speakerId: update.speakerId,
            demoNotes: null,
            isDirty: true,
            projectFileId: lockedProjectFile.id,
            contentHash: calculateContentHash(update.text),
            lastSyncedHash: null,
            sequence: plan.sequenceByKey.get(update.id)!,
          })
          .where(eq(labelLines.id, update.id))
      )
    );

    // 12. Insert new prose rows at planned sequences
    if (plan.inserts.length > 0) {
      await tx.insert(labelLines).values(
        plan.inserts.map((insert) => ({
          labelId,
          sequence: insert.sequence,
          contentType: (insert.speakerId ? "DIALOGUE" : "NARRATION") as
            "DIALOGUE" | "NARRATION",
          content: insert.text,
          speakerId: insert.speakerId,
          demoNotes: null,
          isDirty: true,
          projectFileId: lockedProjectFile.id,
          contentHash: calculateContentHash(insert.text),
          lastSyncedHash: null,
        }))
      );
    }

    // 13. Reindex non-prose rows that shifted due to inserts/deletes
    const structuralReindexes = existingLines.filter((line) => {
      if (line.contentType === "DIALOGUE" || line.contentType === "NARRATION") {
        return false;
      }
      const newSequence = plan.sequenceByKey.get(line.id);
      return newSequence !== undefined && newSequence !== line.sequence;
    });

    await Promise.all(
      structuralReindexes.map((line) =>
        tx
          .update(labelLines)
          .set({
            sequence: plan.sequenceByKey.get(line.id)!,
            projectFileId: lockedProjectFile.id,
            isDirty: true,
            lastSyncedHash: null,
          })
          .where(eq(labelLines.id, line.id))
      )
    );

    // 14. Process menu blocks - update MENU lines' menuOptions
    if (menuBlocks && menuBlocks.length > 0) {
      for (const block of menuBlocks) {
        const menuContentHash = calculateContentHash(
          JSON.stringify(block.menuOptions)
        );
        const result = await tx
          .update(labelLines)
          .set({
            menuOptions: block.menuOptions,
            contentHash: menuContentHash,
            isDirty: true,
            lastSyncedHash: null,
          })
          .where(
            and(
              eq(labelLines.id, block.lineId),
              eq(labelLines.labelId, labelId),
              eq(labelLines.contentType, "MENU"),
              isNull(labelLines.deletedAt)
            )
          );
        if (result.rowCount === 0) {
          throw new NotFoundError(
            `Menu line ${block.lineId} not found in label ${labelId}`
          );
        }
      }
    }

    // 15. Compute content hash from the actual persisted label_lines
    //     (includes MENU/JUMP rows preserved during prose edits) so the hash
    //     stays consistent with sync/import flows that use calculateLinesHash.
    const finalLines = await tx
      .select()
      .from(labelLines)
      .where(and(eq(labelLines.labelId, labelId), isNull(labelLines.deletedAt)))
      .orderBy(asc(labelLines.sequence));
    const contentHash = calculateLinesHash(finalLines);

    // 16. Update label with audit fields and sync status
    const auditFields = updateAuditFields(lockedCurrentVersion, userId);
    await tx
      .update(labels)
      .set({
        ...auditFields,
        contentHash,
        syncStatus: "MODIFIED_LOCAL",
        updatedAt: new Date(),
      })
      .where(eq(labels.id, labelId));

    // 17. Reconstruct file and update project file
    const newContent = await reconstructFileForLabel(lockedProjectFile.id, tx);
    const newContentHash = calculateContentHash(newContent);
    const fileUpdatedAt = new Date();

    await tx
      .update(projectFiles)
      .set({
        content: newContent,
        contentHash: newContentHash,
        updatedAt: fileUpdatedAt,
      })
      .where(eq(projectFiles.id, lockedProjectFile.id));

    // 18. Return success result
    return {
      type: "success",
      version: (auditFields.version ?? lockedCurrentVersion) as number,
      contentHash,
      fileContentHash: newContentHash,
      fileUpdatedAt: fileUpdatedAt.toISOString(),
    };
  });
}
