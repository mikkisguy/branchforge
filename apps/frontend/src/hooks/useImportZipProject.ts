/**
 * ZIP Import Mutation Hook
 *
 * Handles importing new projects from ZIP files.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { projectsApi } from "@/lib/api/projects";
import { projectKeys } from "@/lib/query-keys";
import type { ImportZipBody } from "@/lib/api/projects";

export function useImportZipProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: ImportZipBody) => {
      return projectsApi.importZip(body);
    },
    onSuccess: async () => {
      // Invalidate projects cache to refresh the list
      await queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
    },
  });
}
