import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { characters, stats, variables } from "../db/schema/index.js";

/**
 * Fetch variables, stats, and characters used by export generation/preview.
 * A type-changing import can update both default tables in one commit.
 * Read all supporting rows from one snapshot so export sees either state.
 */
export async function fetchSupportingFileSources(projectId: string) {
  return getDb().transaction(
    async (tx) => {
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
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}
