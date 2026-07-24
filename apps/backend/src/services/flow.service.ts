/**
 * Flow Graph Service
 *
 * Builds a flow graph from labels and their connections,
 * representing the visual novel's branching structure.
 */

import { getDb } from "../db/index.js";
import {
  labels,
  labelLines,
  projectFiles,
  flowGraphLayouts,
} from "../db/schema/index.js";
import { eq, and, asc, isNull, inArray, sql } from "drizzle-orm";
import type {
  FlowGraph,
  FlowNode,
  FlowEdge,
  FlowLayoutMode,
} from "@branchforge/shared";
import { requireProjectAccess } from "./authz.service.js";

/**
 * Regex for identifying UUIDs vs label names
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Type discriminator for resolving targetLabelId as UUID or label name. */
type TargetType = "id" | "name";

/**
 * Regex for matching jump statements in label line content
 */
const JUMP_LINE_REGEX = /^jump\s+([a-zA-Z_][a-zA-Z0-9_]*)/;

/**
 * Get the flow graph for a project
 *
 * Builds nodes from labels and edges from:
 * 1. MENU lines with menuOptions → CHOICE edges
 * 2. JUMP lines → JUMP edges
 * 3. Sequential labels in same file → NATURAL edges
 *
 * @param projectId - The project ID
 * @param userId - The user ID making the request (for authorization)
 * @returns The flow graph with nodes and edges
 */
export async function getFlowGraph(
  projectId: string,
  userId: string
): Promise<FlowGraph> {
  const db = getDb();

  // Verify the user has access
  await requireProjectAccess(projectId, userId);

  // Fetch all labels for the project with file info
  const labelRows = await db
    .select({
      id: labels.id,
      title: labels.title,
      labelName: labels.labelName,
      route: labels.route,
      status: labels.status,
      projectFileId: labels.projectFileId,
      labelPosition: labels.labelPosition,
      sequenceOrder: labels.sequenceOrder,
      labelNumber: labels.labelNumber,
      filePath: projectFiles.filePath,
    })
    .from(labels)
    .innerJoin(projectFiles, eq(labels.projectFileId, projectFiles.id))
    .where(and(eq(labels.projectId, projectId), isNull(labels.deletedAt)))
    .orderBy(asc(labels.sequenceOrder), asc(labels.labelNumber));

  if (labelRows.length === 0) {
    return { nodes: [], edges: [] };
  }

  // Build label name → ID map for resolving name-based targets
  const labelNameToId = new Map<string, string>();
  for (const row of labelRows) {
    if (row.labelName) {
      labelNameToId.set(row.labelName.toLowerCase(), row.id);
    }
  }
  const labelIdSet = new Set(labelRows.map((row) => row.id));

  // Build nodes with empty character lists; populated below once we know
  // which characters speak in each label.
  const nodes: FlowNode[] = labelRows.map((row) => ({
    id: row.id,
    labelId: row.id,
    title: row.title,
    labelName: row.labelName,
    routeKey: row.route,
    status: row.status,
    fileName: extractFileName(row.filePath),
    sequenceOrder: row.sequenceOrder,
    labelNumber: row.labelNumber,
    characterIds: [],
    wordCount: 0,
  }));

  // Fetch all label_lines for this project's labels
  const labelIdList = labelRows.map((row) => row.id);

  let linesRows: Array<{
    id: string;
    labelId: string;
    contentType: string;
    content: string;
    speakerId: string | null;
    menuOptions: Array<{
      label: string;
      targetLabelId: string;
      targetLabelName: string;
      targetType?: "id" | "name";
      conditionFlags?: string[];
      effects?: {
        stats?: Record<string, number>;
      };
    }> | null;
  }> = [];

  if (labelIdList.length > 0) {
    linesRows = await db
      .select({
        id: labelLines.id,
        labelId: labelLines.labelId,
        contentType: labelLines.contentType,
        content: labelLines.content,
        speakerId: labelLines.speakerId,
        menuOptions: labelLines.menuOptions,
      })
      .from(labelLines)
      .where(
        and(
          inArray(labelLines.labelId, labelIdList),
          isNull(labelLines.deletedAt)
        )
      );
  }

  // Build edges
  const edges: FlowEdge[] = [];
  const existingEdgeKeys = new Set<string>();

  // Helper to create edge key for deduplication
  const edgeKey = (source: string, target: string): string =>
    `${source}|${target}`;

  // Resolve target label ID (UUID or name)
  const resolveTargetId = (
    targetLabelId: string,
    targetType?: TargetType
  ): string | null => {
    // Use explicit type discriminator when available
    if (targetType === "id") {
      return labelIdSet.has(targetLabelId) ? targetLabelId : null;
    }
    if (targetType === "name") {
      return labelNameToId.get(targetLabelId.toLowerCase()) ?? null;
    }
    // Fallback: guess using UUID regex for backward compatibility
    // with existing menuOptions that lack the targetType field.
    if (UUID_REGEX.test(targetLabelId)) {
      return labelIdSet.has(targetLabelId) ? targetLabelId : null;
    }
    return labelNameToId.get(targetLabelId.toLowerCase()) ?? null;
  };

  // 1. CHOICE edges from MENU lines
  for (const line of linesRows) {
    if (line.contentType === "MENU" && line.menuOptions) {
      for (const option of line.menuOptions) {
        const targetId = resolveTargetId(
          option.targetLabelId,
          option.targetType
        );
        if (targetId) {
          const key = edgeKey(line.labelId, targetId);
          if (!existingEdgeKeys.has(key)) {
            edges.push({
              id: `${line.labelId}|${targetId}|CHOICE`,
              source: line.labelId,
              target: targetId,
              type: "CHOICE",
              label: option.label,
            });
            existingEdgeKeys.add(key);
          }
        }
      }
    }
  }

  // 2. JUMP edges from JUMP lines
  for (const line of linesRows) {
    if (line.contentType === "JUMP") {
      const match = JUMP_LINE_REGEX.exec(line.content);
      if (match) {
        const targetName = match[1];
        const targetId = labelNameToId.get(targetName.toLowerCase());
        if (targetId) {
          const key = edgeKey(line.labelId, targetId);
          if (!existingEdgeKeys.has(key)) {
            edges.push({
              id: `${line.labelId}|${targetId}|JUMP`,
              source: line.labelId,
              target: targetId,
              type: "JUMP",
            });
            existingEdgeKeys.add(key);
          }
        }
      }
    }
  }

  // 3. NATURAL edges from sequential labels in same file
  // Group labels by projectFileId
  const labelsByFile = new Map<string, typeof labelRows>();
  for (const row of labelRows) {
    const fileId = row.projectFileId;
    if (!labelsByFile.has(fileId)) {
      labelsByFile.set(fileId, []);
    }
    labelsByFile.get(fileId)!.push(row);
  }

  for (const [, fileLabels] of labelsByFile) {
    const sortKey = (r: (typeof fileLabels)[number]) =>
      r.labelPosition ?? Number.MAX_SAFE_INTEGER;
    fileLabels.sort((a, b) => {
      const ka = sortKey(a);
      const kb = sortKey(b);
      if (ka !== kb) return ka - kb;
      if (a.sequenceOrder !== b.sequenceOrder) {
        return a.sequenceOrder - b.sequenceOrder;
      }
      return a.labelNumber - b.labelNumber;
    });

    for (let i = 0; i < fileLabels.length - 1; i++) {
      const sourceId = fileLabels[i].id;
      const targetId = fileLabels[i + 1].id;
      const key = edgeKey(sourceId, targetId);

      // Skip if there's already a JUMP or CHOICE edge between the same source/target
      if (!existingEdgeKeys.has(key)) {
        edges.push({
          id: `${sourceId}|${targetId}|NATURAL`,
          source: sourceId,
          target: targetId,
          type: "NATURAL",
        });
        existingEdgeKeys.add(key);
      }
    }
  }

  // Aggregate speaker characters per label (deduplicated, stable order).
  // Drives the character-appears filter in the flow graph UI.
  // Also aggregate word counts per label for the node tooltip.
  const speakersByLabel = new Map<string, Set<string>>();
  const wordCountByLabel = new Map<string, number>();
  for (const line of linesRows) {
    if (line.speakerId) {
      let set = speakersByLabel.get(line.labelId);
      if (!set) {
        set = new Set();
        speakersByLabel.set(line.labelId, set);
      }
      set.add(line.speakerId);
    }
    // Count words from text-bearing line types. Word counts are computed
    // from the `content` field at query time — there is no persisted column.
    if (line.contentType === "DIALOGUE" || line.contentType === "NARRATION") {
      const trimmed = line.content?.trim();
      const words = trimmed ? trimmed.split(/\s+/).length : 0;
      wordCountByLabel.set(
        line.labelId,
        (wordCountByLabel.get(line.labelId) ?? 0) + words
      );
    }
  }
  for (const node of nodes) {
    const set = speakersByLabel.get(node.id);
    if (set) {
      node.characterIds = Array.from(set).sort();
    }
    node.wordCount = wordCountByLabel.get(node.id) ?? 0;
  }

  return { nodes, edges };
}

/**
 * Get saved flow graph layout positions for a project, scoped to a single
 * layout mode (FLOW / ROUTE / FILE). Positions saved in one mode are not
 * returned when viewing another — users get clean per-mode storage.
 *
 * @param projectId - The project ID
 * @param userId - The user ID making the request
 * @param mode - The layout mode whose positions to load
 * @returns The saved positions map, or empty object if none saved
 */
export async function getFlowGraphLayout(
  projectId: string,
  userId: string,
  mode: FlowLayoutMode
): Promise<Record<string, { x: number; y: number }>> {
  const db = getDb();

  // Verify the user has access
  await requireProjectAccess(projectId, userId);

  const layout = await db
    .select({ positions: flowGraphLayouts.positions })
    .from(flowGraphLayouts)
    .where(
      and(
        eq(flowGraphLayouts.projectId, projectId),
        eq(flowGraphLayouts.userId, userId),
        eq(flowGraphLayouts.mode, mode)
      )
    )
    .limit(1);

  if (layout.length === 0) {
    return {};
  }

  return layout[0].positions;
}

/**
 * Save flow graph layout positions for a project, scoped to a single
 * layout mode. Uses upsert against the (project, user, mode) unique
 * index, so a save in one mode never clobbers positions in another.
 *
 * @param projectId - The project ID
 * @param userId - The user ID making the request
 * @param positions - Map of labelId → { x, y }
 * @param mode - The layout mode these positions belong to
 */
export async function saveFlowGraphLayout(
  projectId: string,
  userId: string,
  positions: Record<string, { x: number; y: number }>,
  mode: FlowLayoutMode
): Promise<void> {
  const db = getDb();

  // Verify the user has access
  await requireProjectAccess(projectId, userId);

  await db
    .insert(flowGraphLayouts)
    .values({
      projectId,
      userId,
      mode,
      positions,
    })
    .onConflictDoUpdate({
      target: [
        flowGraphLayouts.projectId,
        flowGraphLayouts.userId,
        flowGraphLayouts.mode,
      ],
      set: {
        positions,
        updatedAt: sql`now()`,
      },
    });
}

/**
 * Delete (reset) flow graph layout positions for a project, scoped to a
 * single layout mode. Resetting ROUTE does not affect FLOW/FILE positions.
 *
 * @param projectId - The project ID
 * @param userId - The user ID making the request
 * @param mode - The layout mode to reset
 */
export async function deleteFlowGraphLayout(
  projectId: string,
  userId: string,
  mode: FlowLayoutMode
): Promise<void> {
  const db = getDb();

  // Verify the user has access
  await requireProjectAccess(projectId, userId);

  await db
    .delete(flowGraphLayouts)
    .where(
      and(
        eq(flowGraphLayouts.projectId, projectId),
        eq(flowGraphLayouts.userId, userId),
        eq(flowGraphLayouts.mode, mode)
      )
    );
}

/**
 * Extract the file name (basename) from a file path.
 * e.g., "labels/act_i.rpy" → "act_i.rpy"
 */
function extractFileName(filePath: string): string {
  const parts = filePath.split("/");
  return parts[parts.length - 1] ?? filePath;
}
