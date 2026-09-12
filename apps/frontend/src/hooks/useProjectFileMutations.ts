/**
 * useProjectFileMutations Hook
 *
 * TanStack Query mutations for structural project-file operations
 * (rename/move and delete) with filtered and unfiltered list-cache
 * updates plus targeted invalidation of dependent caches.
 *
 * List caches: the unfiltered `projectFilesKeys.lists(projectId)` key and
 * every source-filtered `listsWithSource` key share the
 * `["projectFiles", projectId, "list"]` prefix, so a single partial-match
 * `setQueriesData` updates them all consistently.
 */

import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { projectFilesApi } from "@/lib/api/project-files";
import type { ProjectFileNode } from "@/lib/api/project-files";
import {
  exportKeys,
  flowKeys,
  gitlabKeys,
  labelKeys,
  projectFilesKeys,
} from "@/lib/query-keys";

type FileListUpdater = (
  files: ProjectFileNode[] | undefined
) => ProjectFileNode[] | undefined;

/**
 * Updates the unfiltered list cache and every source-filtered list cache
 * for the project via partial key matching.
 */
export function updateProjectFileListCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string,
  updater: FileListUpdater
): void {
  queryClient.setQueriesData<ProjectFileNode[]>(
    { queryKey: projectFilesKeys.lists(projectId) },
    updater
  );
}

export interface UseProjectFileMutationsReturn {
  renameFile: (fileId: string, filePath: string) => Promise<ProjectFileNode>;
  deleteFile: (
    fileId: string,
    options?: { force?: boolean }
  ) => Promise<{ deletedLabelCount: number }>;
  isRenaming: boolean;
  isDeleting: boolean;
}

export function useProjectFileMutations(
  projectId: string | undefined
): UseProjectFileMutationsReturn {
  const queryClient = useQueryClient();

  const renameMutation = useMutation({
    mutationFn: async ({
      operationProjectId,
      fileId,
      filePath,
    }: {
      operationProjectId: string;
      fileId: string;
      filePath: string;
    }) => {
      return projectFilesApi.renameFile(operationProjectId, fileId, filePath);
    },
    onSuccess: async (renamedFile, variables) => {
      const { operationProjectId } = variables;

      updateProjectFileListCaches(queryClient, operationProjectId, (files) =>
        files?.map((file) =>
          file.id === renamedFile.id ? { ...file, ...renamedFile } : file
        )
      );

      // Source-specific content caches may exist for either path. Invalidate
      // their common prefix rather than guessing a source from a list cache.
      void queryClient.invalidateQueries({
        queryKey: ["projectFiles", operationProjectId, "content"],
      });

      // Labels carry the file path/name; flow graph nodes reference files.
      void queryClient.invalidateQueries({
        queryKey: labelKeys.scoped(operationProjectId),
      });
      void queryClient.invalidateQueries({
        queryKey: flowKeys.graph(operationProjectId),
      });
      void queryClient.invalidateQueries({
        queryKey: exportKeys.preview(operationProjectId),
      });
      void queryClient.invalidateQueries({
        queryKey: gitlabKeys.pendingChanges(operationProjectId),
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({
      operationProjectId,
      fileId,
      force,
    }: {
      operationProjectId: string;
      fileId: string;
      force: boolean;
    }) => {
      return projectFilesApi.deleteFile(operationProjectId, fileId, { force });
    },
    onSuccess: async (_result, variables) => {
      const { operationProjectId, fileId } = variables;

      updateProjectFileListCaches(queryClient, operationProjectId, (files) =>
        files?.filter((file) => file.id !== fileId)
      );

      // Remove now-dangling per-file caches.
      queryClient.removeQueries({
        queryKey: projectFilesKeys.detail(operationProjectId, fileId),
      });
      queryClient.removeQueries({
        queryKey: projectFilesKeys.deleteImpact(operationProjectId, fileId),
      });
      void queryClient.removeQueries({
        queryKey: ["projectFiles", operationProjectId, "content"],
      });

      // Labels and flow graph entries for the deleted file are gone.
      void queryClient.invalidateQueries({
        queryKey: labelKeys.scoped(operationProjectId),
      });
      void queryClient.invalidateQueries({
        queryKey: flowKeys.graph(operationProjectId),
      });
      void queryClient.invalidateQueries({
        queryKey: exportKeys.preview(operationProjectId),
      });
      void queryClient.invalidateQueries({
        queryKey: gitlabKeys.pendingChanges(operationProjectId),
      });
    },
  });

  const renameFile = useCallback(
    async (fileId: string, filePath: string): Promise<ProjectFileNode> => {
      if (!projectId) {
        throw new Error("Cannot rename a file without a project");
      }
      return renameMutation.mutateAsync({
        operationProjectId: projectId,
        fileId,
        filePath,
      });
    },
    [projectId, renameMutation]
  );

  const deleteFile = useCallback(
    async (
      fileId: string,
      options?: { force?: boolean }
    ): Promise<{ deletedLabelCount: number }> => {
      if (!projectId) {
        throw new Error("Cannot delete a file without a project");
      }
      return deleteMutation.mutateAsync({
        operationProjectId: projectId,
        fileId,
        force: options?.force ?? false,
      });
    },
    [projectId, deleteMutation]
  );

  return {
    renameFile,
    deleteFile,
    isRenaming: renameMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
