import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db/index.js";
import type { Transaction } from "../db/types.js";
import {
  characters,
  projectFiles,
  stats,
  variables,
} from "../db/schema/index.js";

const snapshot = {
  isolationLevel: "repeatable read",
  accessMode: "read only",
} as const;

/** Keep managed rows together when an import changes a default's type. */
export function fetchSupportingFileSources(projectId: string) {
  return getDb().transaction(
    (tx) => readSupportingFileSources(tx, projectId),
    snapshot
  );
}

/** Read active declarations together with the rows they can suppress. */
export function fetchExportPreviewSources(projectId: string) {
  return getDb().transaction(async (tx) => {
    const sources = await readSupportingFileSources(tx, projectId);
    const sourceFiles = await tx
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
    return { sources, sourceFiles };
  }, snapshot);
}

async function readSupportingFileSources(tx: Transaction, projectId: string) {
  const projectVariables = await tx
    .select({
      key: variables.key,
      authoredDefault: variables.authoredDefault,
      description: variables.description,
      category: variables.category,
    })
    .from(variables)
    .where(eq(variables.projectId, projectId));
  const projectStats = await tx
    .select({
      key: stats.key,
      authoredDefault: stats.authoredDefault,
      name: stats.name,
      minValue: stats.minValue,
      maxValue: stats.maxValue,
      description: stats.description,
    })
    .from(stats)
    .where(eq(stats.projectId, projectId));
  const projectCharacters = await tx
    .select({
      renpyTag: characters.renpyTag,
      name: characters.name,
      nameType: characters.nameType,
      color: characters.color,
      isNarrator: characters.isNarrator,
      displayName: characters.displayName,
      sourceDefinition: characters.sourceDefinition,
    })
    .from(characters)
    .where(eq(characters.projectId, projectId));

  return { projectVariables, projectStats, projectCharacters };
}
