/** Promote current source defaults using the existing import semantics. */

import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { projectFiles, stats, variables } from "../db/schema/index.js";
import { canonicalizeRpyFilePath } from "@branchforge/shared";
import {
  extractAndStripRpySymbols,
  type DetectedDefaultStatement,
} from "./rpy-statements.service.js";
import { lockProject } from "./project-files-operations.service.js";
import type { Transaction } from "../db/types.js";

/**
 * Promote the variable/stat defaults found in the given files into the
 * `variables` and `stats` tables.
 *
 * Mirrors the ZIP import promotion exactly: variables are inserted with the
 * detected key only, stats use `name = key` with a minValue rounded and
 * clamped to [0, 100] and maxValue 100, and `onConflictDoNothing` preserves
 * any existing managed rows including their metadata and values.
 *
 * Rejected (unsafe) file paths and source-owned files cannot promote symbols.
 */
export async function promoteManagedDefaults(
  tx: Transaction,
  projectId: string,
  files: ReadonlyArray<{ filePath: string; content: string }>
): Promise<boolean> {
  const variablesByKey = new Map<string, DetectedDefaultStatement>();
  const statsByKey = new Map<string, DetectedDefaultStatement>();

  for (const file of files) {
    const canonical = canonicalizeRpyFilePath(file.filePath);
    if (!canonical.ok) continue;

    const symbols = extractAndStripRpySymbols(file.content, canonical.filePath);
    for (const variable of symbols.variables) {
      if (!variablesByKey.has(variable.key)) {
        variablesByKey.set(variable.key, variable);
      }
    }
    for (const stat of symbols.stats) {
      if (!statsByKey.has(stat.key)) {
        statsByKey.set(stat.key, stat);
      }
    }
  }

  let inserted = false;
  if (variablesByKey.size > 0) {
    const rows = await tx
      .insert(variables)
      .values(
        Array.from(variablesByKey.values()).map((variable) => ({
          projectId,
          key: variable.key,
        }))
      )
      .onConflictDoNothing({
        target: [variables.projectId, variables.key],
      })
      .returning({ id: variables.id });
    inserted = rows.length > 0;
  }

  if (statsByKey.size > 0) {
    const rows = await tx
      .insert(stats)
      .values(
        Array.from(statsByKey.values()).map((stat) => {
          const parsed = Math.round(Number.parseFloat(stat.value)) || 0;
          const minValue = Math.max(0, Math.min(parsed, 100));
          return {
            projectId,
            key: stat.key,
            name: stat.key,
            minValue,
            maxValue: 100,
            updatedAt: new Date(),
          };
        })
      )
      .onConflictDoNothing({
        target: [stats.projectId, stats.key],
      })
      .returning({ id: stats.id });
    inserted = inserted || rows.length > 0;
  }
  return inserted;
}

/**
 * Idempotent catch-up promotion of defaults that are still present in the
 * CURRENT ACTIVE content of the project's non-tombstoned files.
 *
 * Runs after authorization, serialized with structural/save writes via the
 * project lock. Only missing variable/stat rows are inserted; file content,
 * content hashes and baselines are never touched.
 */
export async function catchUpManagedDefaults(projectId: string): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await lockProject(tx, projectId);

    const files = await tx
      .select({
        filePath: projectFiles.filePath,
        content: projectFiles.content,
      })
      .from(projectFiles)
      .where(
        and(
          eq(projectFiles.projectId, projectId),
          isNull(projectFiles.deletedAt)
        )
      );

    await promoteManagedDefaults(tx, projectId, files);
  });
}
