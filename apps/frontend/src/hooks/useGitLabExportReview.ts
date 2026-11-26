import { useQuery } from "@tanstack/react-query";
import { gitlabApi } from "@/lib/api/gitlab";
import { gitlabKeys } from "@/lib/query-keys";

/** Branch-keyed queries cancel obsolete requests and never reuse a previous target. */
export function useGitLabExportReview(
  projectId: string,
  branch: string,
  enabled: boolean
) {
  return useQuery({
    queryKey: gitlabKeys.exportReview(projectId, branch),
    queryFn: ({ signal }) =>
      gitlabApi.reviewGitlabExport(projectId, branch, signal),
    enabled,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
}
