/**
 * Labels module - File Reconstruction
 *
 * Reconstructs RPY file content from database labels and lines.
 */

import {
  labels,
  labelLines,
  characters,
  projectFiles,
} from "../../db/schema/index.js";
import { eq, and, isNull, asc, inArray } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { NotFoundError } from "../../middleware/error-handler.middleware.js";
import { reconstructRPYFile } from "../rpy-parser.service.js";
import type { QueryContext } from "./types.js";

// ============================================================================
// File Reconstruction Functions
// ============================================================================

/**
 * Reconstruct file content for a project file by fetching all labels
 * and their associated dialogue lines, then rebuilding the RPY file.
 *
 * @param projectFileId - The project file ID to reconstruct
 * @param db - Optional database context (can be a transaction)
 * @returns The reconstructed file content
 */
export async function reconstructFileForLabel(
  projectFileId: string,
  db: QueryContext = getDb()
): Promise<string> {
  // Get the project file
  const [projectFile] = await db
    .select()
    .from(projectFiles)
    .where(eq(projectFiles.id, projectFileId))
    .limit(1);

  if (!projectFile) {
    throw new NotFoundError("ProjectFile");
  }

  // `content` is the single source of truth for the current file state.
  // `originalContent` is import-time baseline only and must not be used here.
  const reconstructionBaseContent = projectFile.content;

  // Fetch all labels for the project file
  const allLabels = await db
    .select({
      id: labels.id,
      labelName: labels.labelName,
      title: labels.title,
    })
    .from(labels)
    .where(
      and(eq(labels.projectFileId, projectFile.id), isNull(labels.deletedAt))
    )
    .orderBy(asc(labels.labelPosition));

  // If there are no labels, return current file content as-is
  if (allLabels.length === 0) {
    return reconstructRPYFile({
      originalContent: reconstructionBaseContent,
      updatedDialogue: new Map(),
    });
  }

  // Build dialogue map for reconstruction
  const updatedDialogue = new Map<
    string,
    Array<{ speaker: string | null; text: string }>
  >();

  // Batch fetch all label lines for all labels with speaker information
  // Join with characters to get Ren'Py tag from speakerId
  const allLabelLines = await db
    .select({
      labelId: labelLines.labelId,
      speakerId: labelLines.speakerId,
      speakerTag: characters.renpyTag,
      contentType: labelLines.contentType,
      content: labelLines.content,
      sequence: labelLines.sequence,
      menuOptions: labelLines.menuOptions,
    })
    .from(labelLines)
    .leftJoin(characters, eq(labelLines.speakerId, characters.id))
    .where(
      and(
        inArray(
          labelLines.labelId,
          allLabels.map((l) => l.id)
        ),
        isNull(labelLines.deletedAt)
      )
    )
    .orderBy(asc(labelLines.sequence));

  // Group lines by labelId in-memory
  const linesByLabelId = new Map<
    string,
    Array<{
      speaker: string | null;
      content: string;
      contentType: string;
    }>
  >();
  for (const line of allLabelLines) {
    if (!linesByLabelId.has(line.labelId)) {
      linesByLabelId.set(line.labelId, []);
    }
    linesByLabelId.get(line.labelId)!.push({
      // Use Ren'Py speaker tag for script-safe reconstruction
      speaker: line.speakerTag ?? null,
      content: line.content,
      contentType: line.contentType,
    });
  }

  // Build dialogue map from grouped lines.
  // Only include DIALOGUE and NARRATION entries. JUMP, MENU, and CHOICE lines are
  // structural keywords already present in the original file (handled via menuStack
  // and other mechanisms) and must not be emitted as quoted text, otherwise they
  // appear duplicated (e.g. "jump end" + jump end).
  //
  // Also build a menu choices map from MENU lines' menuOptions, so that
  // reconstructRPYFile can update choice text in the RPY file.
  const updatedMenuChoices = new Map<
    string,
    Array<
      Array<{
        label: string;
        targetLabelId?: string;
        targetLabelName?: string;
        conditionFlags?: string[];
        effects?: { stats?: Record<string, number> };
      }>
    >
  >();

  for (const l of allLabels) {
    // Skip labels without a labelName (UI-created labels that don't exist in RPY files)
    if (l.labelName === null) {
      continue;
    }

    const labelLinesData = linesByLabelId.get(l.id) || [];

    const labelDialogue = labelLinesData
      .filter(
        (line) =>
          line.contentType === "DIALOGUE" || line.contentType === "NARRATION"
      )
      .map((line) => ({
        speaker: line.speaker,
        text: line.content,
      }));
    updatedDialogue.set(l.labelName, labelDialogue);

    // Build menu choices from MENU lines' menuOptions
    const menuBlocks = allLabelLines
      .filter(
        (line) =>
          line.labelId === l.id &&
          line.contentType === "MENU" &&
          line.menuOptions &&
          line.menuOptions.length > 0
      )
      .sort((a, b) => a.sequence - b.sequence)
      .map((line) =>
        line.menuOptions!.map((opt) => ({
          label: opt.label,
          targetLabelId: opt.targetLabelId,
          targetLabelName: opt.targetLabelName,
          conditionFlags: opt.conditionFlags,
          effects: opt.effects,
        }))
      );

    if (menuBlocks.length > 0) {
      updatedMenuChoices.set(l.labelName, menuBlocks);
    }
  }

  // Reconstruct and return file content using current file content as base
  return reconstructRPYFile({
    originalContent: reconstructionBaseContent,
    updatedDialogue,
    updatedMenuChoices,
  });
}
