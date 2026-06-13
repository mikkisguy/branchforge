/**
 * useExports Hook
 *
 * Provides export state and operations using TanStack Query.
 * Supports listing exports, generating new exports, and downloading.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { projectFilesApi } from "@/lib/api/project-files";
import { exportKeys } from "@/lib/query-keys";
import type {
  ExportSummary,
  GenerateExportResponse,
} from "@/lib/api/project-files";

// ============================================================================
// Types
// ============================================================================

export interface UseExportsReturn {
  // State
  exports: ExportSummary[];
  isLoadingExports: boolean;
  exportsError: Error | null;

  // Mutation states
  isGenerating: boolean;
  isDownloading: boolean;

  // Methods
  refreshExports: () => void;
  generateExport: () => Promise<GenerateExportResponse>;
  downloadExport: (exportId: string) => Promise<void>;
}

// ============================================================================
// Hook
// ============================================================================

export function useExports(projectId: string | undefined): UseExportsReturn {
  const queryClient = useQueryClient();

  // Query exports list
  const {
    data: exports = [],
    isLoading: isLoadingExports,
    error: exportsError,
    refetch: refreshExports,
  } = useQuery({
    queryKey: exportKeys.lists(projectId ?? ""),
    queryFn: async () => {
      if (!projectId) return [];
      return projectFilesApi.listExports(projectId);
    },
    enabled: !!projectId,
    staleTime: 30 * 1000, // 30 seconds — exports change infrequently
  });

  // Generate export mutation
  const generateExportMutation = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("Project ID is required");
      return projectFilesApi.generateExport(projectId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: exportKeys.lists(projectId ?? ""),
      });
    },
  });

  // Download export mutation
  const downloadExportMutation = useMutation({
    mutationFn: async (exportId: string) => {
      if (!projectId) throw new Error("Project ID is required");
      await projectFilesApi.downloadExport(projectId, exportId);
    },
  });

  const generateExport = async (): Promise<GenerateExportResponse> => {
    return generateExportMutation.mutateAsync();
  };

  const downloadExport = async (exportId: string): Promise<void> => {
    return downloadExportMutation.mutateAsync(exportId);
  };

  return {
    exports,
    isLoadingExports,
    exportsError: exportsError as Error | null,
    isGenerating: generateExportMutation.isPending,
    isDownloading: downloadExportMutation.isPending,
    refreshExports,
    generateExport,
    downloadExport,
  };
}
