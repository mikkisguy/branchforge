import { and, eq, inArray } from "drizzle-orm";
import type { Transaction } from "../../db/types.js";
import { getDb } from "../../db/index.js";
import { gitlabSyncOperations } from "../../db/schema/index.js";
import type { fetchSupportingFileSources } from "../export-sources.service.js";
import {
  generateCharacterDefinitionsFile,
  generateStatsFile,
  generateVariablesFile,
  normalizeCharacterNameType,
} from "../rpy-generator.service.js";
import {
  collectSourceOwnedRpySymbolKeys,
  filterGeneratedDefaults,
} from "../rpy-statements.service.js";
import {
  createGeneratedPathConflictError,
  createPreflightFileExistsError,
  createPreflightRemoteChangedError,
} from "./gitlab-error.helpers.js";
import type { GitLabExportConflictError } from "./gitlab-error.helpers.js";
import type { BatchCommitAction } from "./gitlab-file.service.js";
import type { GitlabRepositoryIdentity } from "./gitlab-repository.service.js";
import { getFileContentWithMetadata } from "./gitlab-repository.service.js";

interface SourceFile {
  filePath: string;
  content: string;
}

export async function buildGeneratedActions(
  projectId: string,
  userId: string,
  branch: string,
  currentPrefix: string,
  previousPrefix: string,
  generated: Awaited<ReturnType<typeof fetchSupportingFileSources>>,
  activeFiles: SourceFile[],
  occupiedPaths: ReadonlySet<string>,
  excludedTags: ReadonlySet<string>,
  repository: GitlabRepositoryIdentity,
  db: Transaction | ReturnType<typeof getDb> = getDb(),
  recordRemote?: (
    path: string,
    remote: Awaited<ReturnType<typeof getFileContentWithMetadata>>
  ) => void
): Promise<BatchCommitAction[]> {
  const sourceOwnedKeys = collectSourceOwnedRpySymbolKeys(
    activeFiles,
    excludedTags
  );
  const { variables, stats } = filterGeneratedDefaults(
    generated.projectVariables,
    generated.projectStats,
    sourceOwnedKeys
  );
  const characters = generated.projectCharacters
    .filter(
      (character) =>
        !sourceOwnedKeys.has(character.renpyTag) &&
        !excludedTags.has(character.renpyTag)
    )
    .map((character) => ({
      ...character,
      nameType: normalizeCharacterNameType(character.nameType),
    }));

  const categories = [
    {
      name: "branchforge_variables.rpy",
      content: generateVariablesFile(variables),
      empty: generateVariablesFile([]),
      hasRows: generated.projectVariables.length > 0,
    },
    {
      name: "branchforge_stats.rpy",
      content: generateStatsFile(stats),
      empty: generateStatsFile([]),
      hasRows: generated.projectStats.length > 0,
    },
    {
      name: "branchforge_definitions.rpy",
      content: generateCharacterDefinitionsFile(characters),
      empty: generateCharacterDefinitionsFile([]),
      hasRows: generated.projectCharacters.length > 0,
    },
  ];
  const candidates = categories.flatMap((category) => {
    const current = {
      ...category,
      filePath: currentPrefix + category.name,
      previous: false,
    };
    if (previousPrefix === currentPrefix) return [current];
    // Clear the previous generated destination in the move's commit so it
    // cannot retain declarations after the source baseline advances.
    return [
      current,
      {
        ...category,
        filePath: previousPrefix + category.name,
        content: category.empty,
        hasRows: false,
        previous: true,
      },
    ];
  });

  const actions = await Promise.all(
    candidates.map(async ({ filePath, content, empty, hasRows, previous }) => {
      const remote = await getFileContentWithMetadata(
        projectId,
        userId,
        filePath,
        branch,
        undefined,
        repository
      );

      recordRemote?.(filePath, remote);
      if (remote.content === null && !hasRows) return null;
      if (remote.content === content) return null;
      if (
        content === empty &&
        remote.content
          ?.split(/\r?\n/)
          .every((line) => /^[ \t]*(?:#.*)?$/.test(line))
      ) {
        return null;
      }

      // A changed prefix only suggests where a generated file might exist.
      // A handwritten file at that previous location is outside the cleanup.
      const hasGeneratedHeader = remote.content
        ?.replace(/\r\n/g, "\n")
        .startsWith(empty);
      if (previous && !hasGeneratedHeader) return null;

      const path = filePath.toLowerCase();
      for (const occupied of occupiedPaths) {
        if (
          path === occupied ||
          path.startsWith(occupied + "/") ||
          occupied.startsWith(path + "/")
        ) {
          throw createGeneratedPathConflictError(filePath);
        }
      }
      if (remote.content === null) {
        // Keep creating the category file when rows exist, even if source
        // ownership filtering left it with no declarations.
        return { action: "create", filePath, content } as const;
      }
      // The empty generator output includes a newline boundary after the
      // full category-specific header.
      if (!remote.lastCommitId || !hasGeneratedHeader) {
        throw createGeneratedPathConflictError(filePath);
      }
      return {
        action: "update",
        filePath,
        content,
        lastCommitId: remote.lastCommitId,
      } as const;
    })
  );

  const updates = actions.filter((action) => action?.action === "update");
  if (updates.length > 0) {
    // A recorded commit ID is a confirmed GitLab write even if a later
    // local finalization step failed and the export status is FAILED.
    const confirmed = await db
      .select({ commitId: gitlabSyncOperations.commitId })
      .from(gitlabSyncOperations)
      .where(
        and(
          eq(gitlabSyncOperations.projectId, projectId),
          eq(gitlabSyncOperations.operation, "EXPORT"),
          inArray(gitlabSyncOperations.commitId, [
            ...new Set(updates.map((action) => action.lastCommitId)),
          ])
        )
      );
    const exportedIds = new Set(confirmed.map(({ commitId }) => commitId));
    for (const action of updates) {
      if (!exportedIds.has(action.lastCommitId)) {
        throw createGeneratedPathConflictError(action.filePath);
      }
    }
  }

  return actions.filter((action) => action !== null);
}

/** Detect changes since planning after GitLab explicitly rejects a commit. */
export async function findGeneratedCommitConflict(
  projectId: string,
  userId: string,
  branch: string,
  actions: BatchCommitAction[],
  repository: GitlabRepositoryIdentity
): Promise<GitLabExportConflictError | undefined> {
  const conflicts = await Promise.allSettled(
    actions.map(async (action) => {
      const remote = await getFileContentWithMetadata(
        projectId,
        userId,
        action.filePath,
        branch,
        undefined,
        repository
      );
      if (action.action === "create" && remote.content !== null) {
        return createPreflightFileExistsError(action.filePath);
      }
      if (
        action.action === "update" &&
        (remote.content === null || remote.lastCommitId !== action.lastCommitId)
      ) {
        return createPreflightRemoteChangedError(action.filePath);
      }
    })
  );
  for (const conflict of conflicts) {
    if (conflict.status === "fulfilled" && conflict.value) {
      return conflict.value;
    }
  }
}
