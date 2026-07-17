/**
 * Labels module - Incoming Jumps Resolution
 *
 * Batch-updates incoming jumps for multiple labels by scanning all label lines
 * in the project once. Resolves both menu-choice and automatic jump targets
 * to avoid N+1 queries.
 */

import { labels, labelLines } from "../../db/schema/index.js";
import { eq, and, isNull, sql, inArray } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { UUID_REGEX } from "./types.js";
import type { IncomingJump } from "./types.js";

// ============================================================================
// Incoming Jumps Resolution
// ============================================================================

/**
 * Update incoming jumps for multiple labels by scanning all label lines in the
 * project once.  Resolves both menu-choice and automatic jump targets in batch
 * to avoid N+1 queries.
 *
 * @param context - Database query context (db connection or transaction)
 * @param labelIds - The label IDs to update incoming jumps for
 * @param projectId - The project ID to scan for incoming jumps
 */
export async function updateIncomingJumpsForLabels(
  context: Pick<ReturnType<typeof getDb>, "select" | "update" | "execute">,
  labelIds: string[],
  projectId: string
): Promise<void> {
  if (labelIds.length === 0) return;

  const targetSet = new Set(labelIds);

  // 1. Fetch all label lines in the project (single query)
  const allLines = await context
    .select({
      line: labelLines,
      sourceLabel: {
        id: labels.id,
        title: labels.title,
        labelName: labels.labelName,
      },
    })
    .from(labelLines)
    .innerJoin(labels, eq(labelLines.labelId, labels.id))
    .where(
      and(
        eq(labels.projectId, projectId),
        isNull(labels.deletedAt),
        isNull(labelLines.deletedAt)
      )
    );

  // 2. Collect all jump target names (menu choices + automatic jumps).
  // Menu option `targetLabelId` can be either a raw UUID (already-resolved
  // label ID) or a label name; only the latter needs name → ID lookup.
  const targetNames = new Set<string>();
  for (const row of allLines) {
    if (row.line.menuOptions) {
      for (const option of row.line.menuOptions) {
        if (
          option.targetLabelId &&
          option.targetLabelId !== "" &&
          !UUID_REGEX.test(option.targetLabelId)
        ) {
          targetNames.add(option.targetLabelId);
        }
      }
    }
    const jumpMatch = row.line.content.match(
      /^jump\s+([a-zA-Z_][a-zA-Z0-9_]*)/
    );
    if (jumpMatch) {
      targetNames.add(jumpMatch[1]);
    }
  }

  // 3. Batch-resolve names to label IDs (single query)
  const nameToId = new Map<string, string>();
  if (targetNames.size > 0) {
    const resolvedLabels = await context
      .select({ id: labels.id, labelName: labels.labelName })
      .from(labels)
      .where(
        and(
          eq(labels.projectId, projectId),
          inArray(labels.labelName, Array.from(targetNames)),
          isNull(labels.deletedAt)
        )
      );

    for (const l of resolvedLabels) {
      if (l.labelName) {
        nameToId.set(l.labelName.toLowerCase(), l.id);
      }
    }
  }

  // 4. Compute incoming jumps for all affected labels in a single pass
  const incomingJumpsByLabel = new Map<string, IncomingJump[]>();
  for (const id of labelIds) {
    incomingJumpsByLabel.set(id, []);
  }

  const seen = new Map<string, Set<string>>();

  for (const row of allLines) {
    const { line, sourceLabel } = row;

    // Check for menu choice jumps
    if (line.menuOptions) {
      for (const option of line.menuOptions) {
        if (option.targetLabelId && option.targetLabelId !== "") {
          // UUID targetLabelId is already a label ID; name targets must be
          // resolved via the name → ID map built above.
          const resolvedId = UUID_REGEX.test(option.targetLabelId)
            ? option.targetLabelId
            : nameToId.get(option.targetLabelId.toLowerCase());
          if (resolvedId && targetSet.has(resolvedId)) {
            const key = `${sourceLabel.id}::${option.label}`;
            const seenKeys = seen.get(resolvedId) ?? new Set();
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              seen.set(resolvedId, seenKeys);
              incomingJumpsByLabel.get(resolvedId)!.push({
                sourceLabelId: sourceLabel.id,
                sourceLabelTitle: sourceLabel.title,
                sourceLabelName: sourceLabel.labelName,
                jumpType: "MENU_CHOICE" as const,
                choiceText: option.label,
                conditions: option.conditionFlags
                  ? {
                      variables: Object.fromEntries(
                        option.conditionFlags.map((f) => [
                          f,
                          { value: true, operator: "truthy" as const },
                        ])
                      ),
                    }
                  : undefined,
              });
            }
          }
        }
      }
    }

    // Check for automatic jumps in content
    const jumpMatch = line.content.match(/^jump\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (jumpMatch) {
      const targetLabelName = jumpMatch[1];
      const resolvedId = nameToId.get(targetLabelName.toLowerCase());
      if (resolvedId && targetSet.has(resolvedId)) {
        const key = `${sourceLabel.id}::automatic`;
        const seenKeys = seen.get(resolvedId) ?? new Set();
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          seen.set(resolvedId, seenKeys);
          incomingJumpsByLabel.get(resolvedId)!.push({
            sourceLabelId: sourceLabel.id,
            sourceLabelTitle: sourceLabel.title,
            sourceLabelName: sourceLabel.labelName,
            jumpType: "AUTOMATIC" as const,
            choiceText: "Automatic jump",
          });
        }
      }
    }
  }

  // 5. Chunked batch-update to stay within PostgreSQL's parameter limit
  if (labelIds.length > 0) {
    const BATCH_SIZE = 1000;
    for (let i = 0; i < labelIds.length; i += BATCH_SIZE) {
      const batch = labelIds.slice(i, i + BATCH_SIZE);
      const cases = batch.map(
        (id) =>
          sql`WHEN ${id} THEN ${JSON.stringify(incomingJumpsByLabel.get(id) ?? [])}::jsonb`
      );
      await context.execute(
        sql`UPDATE ${labels} SET incoming_jumps = CASE id ${sql.join(cases, sql` `)} END WHERE id IN (${sql.join(
          batch.map((id) => sql`${id}`),
          sql`, `
        )})`
      );
    }
  }
}
