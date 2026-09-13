/**
 * Shared project export helpers.
 *
 * Used by quick-export flows and useExports so generate + download share
 * one implementation and consistent error surfacing.
 */

import { projectFilesApi } from "@/lib/api/project-files";
import type { GenerateExportResponse } from "@/lib/api/project-files";

export const EXPORT_ERROR_TITLE = "Export Error";

export function getExportErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Export failed";
}

export async function exportAndDownloadProject(
  projectId: string
): Promise<GenerateExportResponse> {
  const result = await projectFilesApi.generateExport(projectId);
  await projectFilesApi.downloadExport(projectId, result.id);
  return result;
}
