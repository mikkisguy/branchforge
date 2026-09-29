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
  labelLineNotes,
  projectFiles,
  characters,
} from "../../db/schema/index.js";
import { eq, asc, inArray, isNull, isNotNull, and, sql } from "drizzle-orm";
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
import { applyNoteChanges, type LineNoteChange } from "./notes.js";

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
      lineIdMapping: Record<string, string>;
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
    // 1. Read label to get projectFileId (no lock yet — re-read under lock
    //    after the project_file lock to match deleteLabel's lock ordering).
    const [label] = await tx
      .select({
        id: labels.id,
        projectId: labels.projectId,
        projectFileId: labels.projectFileId,
      })
      .from(labels)
      .where(and(eq(labels.id, labelId), isNull(labels.deletedAt)))
      .limit(1);

    if (!label || !label.projectFileId) {
      throw new NotFoundError("Label or file not found");
    }

    // 2. Lock the project file row FIRST (matches updateLabel / deleteLabel
    //    lock ordering of project_files → labels, preventing deadlock).
    await tx.execute(
      sql`SELECT id FROM project_files WHERE id = ${label.projectFileId} FOR UPDATE`
    );

    // 3. Read the locked project file
    const [lockedProjectFile] = await tx
      .select()
      .from(projectFiles)
      .where(
        and(
          eq(projectFiles.id, label.projectFileId),
          // Tombstoned files cannot be mutated through label endpoints.
          isNull(projectFiles.deletedAt)
        )
      )
      .limit(1);

    if (!lockedProjectFile) {
      throw new NotFoundError("File");
    }

    // 4. Lock the label row to serialize concurrent updates
    await tx.execute(
      sql`SELECT id FROM labels WHERE id = ${labelId} FOR UPDATE`
    );

    // 5. Re-read the label under lock to get current version/contentHash
    const [lockedLabel] = await tx
      .select({
        version: labels.version,
        contentHash: labels.contentHash,
        projectFileId: labels.projectFileId,
      })
      .from(labels)
      .where(and(eq(labels.id, labelId), isNull(labels.deletedAt)))
      .limit(1);

    if (!lockedLabel || !lockedLabel.projectFileId) {
      throw new NotFoundError("Label or file not found");
    }

    // 6. Verify user owns the project (uses tx to stay inside the transaction)
    await requireProjectOwnership(label.projectId, userId, tx);

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
            eq(characters.projectId, label.projectId),
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

    // 8. Fetch existing lines — concurrency serialized by the label-row lock in step 1
    const existingLines = await tx
      .select()
      .from(labelLines)
      .where(and(eq(labelLines.labelId, labelId), isNull(labelLines.deletedAt)))
      .orderBy(asc(labelLines.sequence));

    const existingProse = existingLines.filter(
      (line) =>
        line.contentType === "DIALOGUE" || line.contentType === "NARRATION"
    );
    const proseUnchanged =
      existingProse.length === dialogue.length &&
      dialogue.every(
        (entry, index) =>
          entry.speakerId === existingProse[index].speakerId &&
          entry.text === existingProse[index].content &&
          (!entry.lineId || entry.lineId === existingProse[index].id)
      );
    const existingMenus = new Map(
      existingLines
        .filter((line) => line.contentType === "MENU")
        .map((line) => [line.id, line.menuOptions])
    );
    const menusUnchanged = (menuBlocks ?? []).every(
      (block) =>
        existingMenus.has(block.lineId) &&
        JSON.stringify(existingMenus.get(block.lineId)) ===
          JSON.stringify(block.menuOptions)
    );
    const lineIdMapping: Record<string, string> = {};

    // Notes alone use the same autosave endpoint, but private notes must not
    // rewrite the script or mark prose rows as dirty.
    if (proseUnchanged && menusUnchanged) {
      const noteChanges: LineNoteChange[] = [];
      dialogue.forEach((entry, index) => {
        const lineId = existingProse[index].id;
        if (entry.clientId) lineIdMapping[entry.clientId] = lineId;
        if (entry.note !== undefined) {
          noteChanges.push({ lineId, note: entry.note });
        }
      });
      const noteResult = await applyNoteChanges(tx, labelId, noteChanges);
      if (!noteResult.changed) {
        return {
          type: "success" as const,
          version: lockedCurrentVersion,
          contentHash: lockedLabel.contentHash ?? "",
          fileContentHash: lockedProjectFile.contentHash,
          fileUpdatedAt: lockedProjectFile.updatedAt.toISOString(),
          lineIdMapping,
        };
      }

      const auditFields = updateAuditFields(lockedCurrentVersion, userId);
      await tx
        .update(labels)
        .set({
          ...auditFields,
          ...(noteResult.scriptChanged
            ? { syncStatus: "MODIFIED_LOCAL" as const }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(labels.id, labelId));

      if (!noteResult.scriptChanged) {
        return {
          type: "success" as const,
          version: auditFields.version ?? lockedCurrentVersion,
          contentHash: lockedLabel.contentHash ?? "",
          fileContentHash: lockedProjectFile.contentHash,
          fileUpdatedAt: lockedProjectFile.updatedAt.toISOString(),
          lineIdMapping,
        };
      }

      const content = await reconstructFileForLabel(lockedProjectFile.id, tx);
      const fileUpdatedAt = new Date();
      const fileContentHash = calculateContentHash(content);
      await tx
        .update(projectFiles)
        .set({
          content,
          contentHash: fileContentHash,
          updatedAt: fileUpdatedAt,
        })
        .where(eq(projectFiles.id, lockedProjectFile.id));
      return {
        type: "success" as const,
        version: auditFields.version ?? lockedCurrentVersion,
        contentHash: lockedLabel.contentHash ?? "",
        fileContentHash,
        fileUpdatedAt: fileUpdatedAt.toISOString(),
        lineIdMapping,
      };
    }

    // 9. Align prose against the incoming list so mid-list inserts/deletes keep
    //    VISUAL/MENU rows interleaved correctly (not appended at max sequence).
    const oldNotes = await tx
      .select()
      .from(labelLineNotes)
      .where(
        and(
          eq(labelLineNotes.labelId, labelId),
          isNotNull(labelLineNotes.labelLineId),
          isNull(labelLineNotes.deletedAt)
        )
      );
    const oldNotesByLineId = new Map(
      oldNotes.map((note) => [note.labelLineId!, note])
    );
    // Detach before replacing rows, then restore each note to its incoming
    // line. A line removed from the draft leaves its note unattached.
    if (oldNotes.length > 0) {
      await tx
        .update(labelLineNotes)
        .set({ labelLineId: null })
        .where(
          and(
            eq(labelLineNotes.labelId, labelId),
            isNotNull(labelLineNotes.labelLineId),
            isNull(labelLineNotes.deletedAt)
          )
        );
    }
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

    const persistedByIncomingIndex = new Map<number, string>(
      plan.updates.map((update) => [update.incomingIndex, update.id])
    );

    // 12. Insert new prose rows at planned sequences
    if (plan.inserts.length > 0) {
      const inserted = await tx
        .insert(labelLines)
        .values(
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
        )
        .returning({ id: labelLines.id, sequence: labelLines.sequence });
      const idBySequence = new Map(
        inserted.map((line) => [line.sequence, line.id])
      );
      for (const insert of plan.inserts) {
        const id = idBySequence.get(insert.sequence);
        if (!id) throw new Error("Inserted prose line was not returned");
        persistedByIncomingIndex.set(insert.incomingIndex, id);
      }
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

    const updateByIncomingIndex = new Map(
      plan.updates.map((update) => [update.incomingIndex, update.id])
    );
    const seenOriginalIds = new Set<string>();
    const noteChanges: LineNoteChange[] = [];
    for (let index = 0; index < dialogue.length; index++) {
      const entry = dialogue[index];
      const lineId = persistedByIncomingIndex.get(index);
      if (!lineId) throw new Error("Prose line mapping is incomplete");
      if (entry.clientId) lineIdMapping[entry.clientId] = lineId;

      const originalId = entry.lineId ?? updateByIncomingIndex.get(index);
      if (originalId) {
        if (seenOriginalIds.has(originalId)) {
          throw new ValidationError("Duplicate prose line ID");
        }
        seenOriginalIds.add(originalId);
      }
      const previousNote = originalId
        ? oldNotesByLineId.get(originalId)
        : undefined;
      if (entry.note === null) {
        if (previousNote) {
          await tx
            .update(labelLineNotes)
            .set({ deletedAt: new Date(), updatedAt: new Date() })
            .where(eq(labelLineNotes.id, previousNote.id));
        }
      } else if (entry.note) {
        noteChanges.push({
          lineId,
          note: { ...entry.note, id: entry.note.id ?? previousNote?.id },
        });
      } else if (previousNote) {
        noteChanges.push({
          lineId,
          note: {
            id: previousNote.id,
            text: previousNote.body,
            storage: previousNote.storage,
          },
        });
      }
    }
    await applyNoteChanges(tx, labelId, noteChanges);

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
      lineIdMapping,
    };
  });
}
