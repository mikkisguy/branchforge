/** Persist authored defaults independently of managed row metadata. */

import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { projectFiles, stats, variables } from "../db/schema/index.js";
import { canonicalizeRpyFilePath } from "@branchforge/shared";
import {
  extractAndStripRpySymbols,
  type DetectedDefaultStatement,
} from "./rpy-statements.service.js";
import { lockProject } from "./project-files-operations.service.js";
import type { Transaction } from "../db/types.js";

export function collectManagedDefaults(
  files: ReadonlyArray<{ filePath: string; content: string }>
): DetectedDefaultStatement[] {
  const defaults = new Map<string, DetectedDefaultStatement>();
  for (const file of files) {
    const canonical = canonicalizeRpyFilePath(file.filePath);
    if (!canonical.ok) continue;

    const symbols = extractAndStripRpySymbols(file.content, canonical.filePath);
    for (const declaration of [...symbols.variables, ...symbols.stats]) {
      if (!defaults.has(declaration.key)) {
        defaults.set(declaration.key, declaration);
      }
    }
  }
  return [...defaults.values()];
}

/** Pure row defaults used by both export projection and persistence. */
export function managedVariableDefaultValues(item: DetectedDefaultStatement) {
  return { key: item.key, authoredDefault: item.value === "True" };
}

export function managedStatDefaultValues(item: DetectedDefaultStatement) {
  return {
    key: item.key,
    name: item.key,
    minValue: Math.max(0, Math.min(Math.round(Number(item.value)), 100)),
    maxValue: 100,
    authoredDefault: item.value,
  };
}

export async function promoteManagedDefaults(
  tx: Transaction,
  projectId: string,
  declarations: readonly DetectedDefaultStatement[],
  mode: "accepted" | "current" | "legacy"
): Promise<Set<string>> {
  const booleanDefaults = declarations.filter(
    (item) => item.kind === "variable"
  );
  const numericDefaults = declarations.filter((item) => item.kind === "stat");

  const changedKeys = new Set<string>();

  // Historical snapshots may recover existing rows, but a deleted managed
  // symbol must never be recreated from archived source.
  if (mode === "legacy") {
    for (const item of booleanDefaults) {
      await tx
        .update(variables)
        .set({ authoredDefault: item.value === "True" })
        .where(
          and(
            eq(variables.projectId, projectId),
            eq(variables.key, item.key),
            isNull(variables.authoredDefault)
          )
        );
    }
    for (const item of numericDefaults) {
      await tx
        .update(stats)
        .set({ authoredDefault: item.value })
        .where(
          and(
            eq(stats.projectId, projectId),
            eq(stats.key, item.key),
            isNull(stats.authoredDefault)
          )
        );
    }
    return changedKeys;
  }

  if (booleanDefaults.length > 0) {
    const rows = await tx
      .insert(variables)
      .values(
        booleanDefaults.map((item) => ({
          projectId,
          ...managedVariableDefaultValues(item),
        }))
      )
      .onConflictDoUpdate({
        target: [variables.projectId, variables.key],
        set: { authoredDefault: sql`excluded.authored_default` },
        setWhere:
          mode === "accepted"
            ? sql`${variables.authoredDefault} IS DISTINCT FROM excluded.authored_default`
            : isNull(variables.authoredDefault),
      })
      .returning({ key: variables.key });
    for (const { key } of rows) changedKeys.add(key);
  }

  if (numericDefaults.length > 0) {
    const rows = await tx
      .insert(stats)
      .values(
        numericDefaults.map((item) => ({
          projectId,
          ...managedStatDefaultValues(item),
        }))
      )
      .onConflictDoUpdate({
        target: [stats.projectId, stats.key],
        set: { authoredDefault: sql`excluded.authored_default` },
        setWhere:
          mode === "accepted"
            ? sql`${stats.authoredDefault} IS DISTINCT FROM excluded.authored_default`
            : isNull(stats.authoredDefault),
      })
      .returning({ key: stats.key });
    for (const { key } of rows) changedKeys.add(key);
  }

  // An accepted change of literal type selects the new declaration without
  // deleting existing project metadata or changing any Stat's classification.
  if (mode === "accepted" && booleanDefaults.length > 0) {
    const rows = await tx
      .update(stats)
      .set({ authoredDefault: null })
      .where(
        and(
          eq(stats.projectId, projectId),
          inArray(
            stats.key,
            booleanDefaults.map((item) => item.key)
          ),
          isNotNull(stats.authoredDefault)
        )
      )
      .returning({ key: stats.key });
    for (const { key } of rows) changedKeys.add(key);
  }
  if (mode === "accepted" && numericDefaults.length > 0) {
    const rows = await tx
      .update(variables)
      .set({ authoredDefault: null })
      .where(
        and(
          eq(variables.projectId, projectId),
          inArray(
            variables.key,
            numericDefaults.map((item) => item.key)
          ),
          isNotNull(variables.authoredDefault)
        )
      )
      .returning({ key: variables.key });
    for (const { key } of rows) changedKeys.add(key);
  }
  return changedKeys;
}

/**
 * Idempotent catch-up promotion of defaults that are still present in the
 * CURRENT ACTIVE content of the project's non-tombstoned files.
 *
 * Runs after authorization, serialized with structural/save writes via the
 * project lock. Missing rows and authored values are filled; file content,
 * content hashes and baselines are never touched.
 */
export async function catchUpManagedDefaults(projectId: string): Promise<void> {
  const db = getDb();
  const candidates = await db
    .select({
      filePath: projectFiles.filePath,
      content: projectFiles.content,
    })
    .from(projectFiles)
    .where(
      and(eq(projectFiles.projectId, projectId), isNull(projectFiles.deletedAt))
    );
  if (collectManagedDefaults(candidates).length === 0) return;

  // The pre-check only skips work; promotion must read again under the lock.
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

    await promoteManagedDefaults(
      tx,
      projectId,
      collectManagedDefaults(files),
      "current"
    );
  });
}
