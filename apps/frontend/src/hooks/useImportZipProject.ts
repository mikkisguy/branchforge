/**
 * ZIP Import Mutation Hook
 *
 * Handles importing new projects from ZIP files.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { projectsApi } from "@/lib/api/projects";
import { projectKeys, labelKeys } from "@/lib/query-keys";
import type { ImportZipBody } from "@/lib/api/projects";

export function useImportZipProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: ImportZipBody) => {
      return projectsApi.importZip(body);
    },
    onSuccess: async (response) => {
      // Invalidate projects cache to refresh the list
      await queryClient.invalidateQueries({ queryKey: projectKeys.lists() });

      // Invalidate label queries for the new project to ensure fresh data
      // (including incomingJumps computed during sync). We use invalidateQueries
      // to mark queries as stale so they refetch when next mounted/used.
      if (response.success && response.project?.id) {
        await queryClient.invalidateQueries({
          queryKey: labelKeys.scoped(response.project.id),
        });
      }
    },
  });
}
