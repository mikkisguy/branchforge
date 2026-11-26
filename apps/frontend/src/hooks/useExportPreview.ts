import { useQuery } from "@tanstack/react-query";
import { projectFilesApi } from "@/lib/api/project-files";
import { exportKeys } from "@/lib/query-keys";

export function useExportPreview(projectId?: string) {
  return useQuery({
    queryKey: projectId
      ? exportKeys.preview(projectId)
      : ([...exportKeys.all, "preview"] as const),
    queryFn: ({ signal }) =>
      projectFilesApi.getExportPreview(projectId!, signal),
    enabled: !!projectId,
    refetchOnMount: true,
    staleTime: 60_000,
    retry: 1,
  });
}
